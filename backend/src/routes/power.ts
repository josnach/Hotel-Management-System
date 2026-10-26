import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC, postJournal } from '../services/accounting';
import { addDays, dbDate, ymd } from '../services/period';
import { getPowerConfig, powerReport, savePowerConfig } from '../services/power';

export const powerRouter = Router();
const log = requireRole('MAINTENANCE', 'ACCOUNTANT'); // daily readings: maintenance staff or the accountant
const acct = requireRole('ACCOUNTANT');                // money, setup and reports
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = (v: unknown) => Number(v ?? 0);

// ───────────── Generators (setup) ─────────────
powerRouter.get('/generators', log, asyncHandler(async (_q, res) => res.json((await prisma.generator.findMany({ orderBy: { name: 'asc' } })).map((g) => ({ ...g, litresPerHour: g.litresPerHour === null ? null : n(g.litresPerHour) })))));
const genBody = z.object({ name: z.string().trim().min(1).max(60), litresPerHour: z.coerce.number().min(0).max(1000).nullable().optional(), isActive: z.boolean().optional() });
powerRouter.post('/generators', acct, asyncHandler(async (req, res) => res.status(201).json(await prisma.generator.create({ data: parse(genBody, req.body) }))));
powerRouter.put('/generators/:id', acct, asyncHandler(async (req, res) => {
  const g = await prisma.generator.update({ where: { id: req.params.id }, data: parse(genBody.partial(), req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'GENERATOR_EDIT', entity: 'Generator', entityId: g.id, meta: { name: g.name, litresPerHour: g.litresPerHour === null ? null : n(g.litresPerHour) } });
  res.json(g);
}));

// ───────────── Daily readings ─────────────
powerRouter.get('/day', log, asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateStr.default(ymd(new Date())) }), req.query);
  const [runs, dip] = await Promise.all([prisma.generatorRun.findMany({ where: { date: dbDate(date) } }), prisma.tankDip.findUnique({ where: { date: dbDate(date) } })]);
  res.json({ date, runs: runs.map((r) => ({ generatorId: r.generatorId, hours: n(r.hours) })), tankLitres: dip ? n(dip.litres) : null });
}));

/** One entry per day: hours each generator ran, and (optionally) the tank level. Saving again replaces the day's figures. */
powerRouter.post('/day', log, asyncHandler(async (req, res) => {
  const b = parse(z.object({ date: dateStr, runs: z.array(z.object({ generatorId: z.string(), hours: z.coerce.number().min(0).max(24) })).max(20), tankLitres: z.coerce.number().min(0).max(1_000_000).nullable().optional() }), req.body);
  if (b.date > ymd(new Date())) throw new HttpError(400, 'You cannot enter readings for a future date');
  await prisma.$transaction(async (tx) => {
    for (const r of b.runs) await tx.generatorRun.upsert({ where: { date_generatorId: { date: dbDate(b.date), generatorId: r.generatorId } }, update: { hours: r.hours, userId: req.user!.id }, create: { date: dbDate(b.date), generatorId: r.generatorId, hours: r.hours, userId: req.user!.id } });
    if (b.tankLitres !== null && b.tankLitres !== undefined) await tx.tankDip.upsert({ where: { date: dbDate(b.date) }, update: { litres: b.tankLitres, userId: req.user!.id }, create: { date: dbDate(b.date), litres: b.tankLitres, userId: req.user!.id } });
  });
  res.json({ ok: true });
}));

// ───────────── Diesel purchases (money goes out, so accountants only) ─────────────
powerRouter.get('/purchases', acct, asyncHandler(async (req, res) => {
  const q = parse(z.object({ from: dateStr.default(addDays(ymd(new Date()), -30)), to: dateStr.default(ymd(new Date())) }), req.query);
  const rows = await prisma.dieselPurchase.findMany({ where: { date: { gte: dbDate(q.from), lte: dbDate(q.to) } }, orderBy: { date: 'desc' } });
  res.json(rows.map((p) => ({ id: p.id, date: p.date.toISOString().slice(0, 10), litres: n(p.litres), pricePerLitre: n(p.pricePerLitre), total: n(p.total), supplier: p.supplier, paidFrom: p.paidFrom, reference: p.reference })));
}));

powerRouter.post('/purchases', acct, asyncHandler(async (req, res) => {
  const b = parse(z.object({ date: dateStr, litres: z.coerce.number().positive().max(1_000_000), pricePerLitre: z.coerce.number().positive().max(100_000), supplier: z.string().trim().max(100).optional(), paidFrom: z.enum(['BANK', 'CASH']), reference: z.string().trim().max(100).optional() }), req.body);
  if (b.date > ymd(new Date())) throw new HttpError(400, 'The purchase date cannot be in the future');
  const total = D(b.litres).times(b.pricePerLitre).toDecimalPlaces(2);
  const p = await prisma.$transaction(async (tx) => {
    const row = await tx.dieselPurchase.create({ data: { date: dbDate(b.date), litres: b.litres, pricePerLitre: b.pricePerLitre, total, supplier: b.supplier, paidFrom: b.paidFrom, reference: b.reference, userId: req.user!.id } });
    await postJournal(tx, { description: `Diesel ${b.litres}L${b.supplier ? ` from ${b.supplier}` : ''}`, reference: `DIESEL-${row.id}`, userId: req.user!.id, lines: [{ code: ACC.DIESEL, debit: total }, { code: b.paidFrom === 'BANK' ? ACC.BANK : ACC.CASH, credit: total }] });
    await audit(tx, { userId: req.user!.id, action: 'DIESEL_PURCHASE', entity: 'DieselPurchase', entityId: row.id, meta: { litres: b.litres, total: Number(total), supplier: b.supplier ?? null } });
    return row;
  });
  res.status(201).json({ id: p.id, total: Number(total) });
}));

// ───────────── Report and settings ─────────────
powerRouter.get('/report', acct, asyncHandler(async (req, res) => {
  const q = parse(z.object({ from: dateStr.default(addDays(ymd(new Date()), -29)), to: dateStr.default(ymd(new Date())) }), req.query);
  if (q.to < q.from) throw new HttpError(400, 'The end date must be after the start date');
  if (q.from < addDays(q.to, -366)) throw new HttpError(400, 'Choose a period of a year or less');
  res.json(await powerReport(q.from, q.to));
}));
powerRouter.get('/config', acct, asyncHandler(async (_q, res) => res.json(await getPowerConfig())));
powerRouter.put('/config', acct, asyncHandler(async (req, res) => {
  const c = parse(z.object({ tolerancePct: z.coerce.number().min(0).max(100) }), req.body);
  await savePowerConfig(c);
  await audit(prisma, { userId: req.user!.id, action: 'POLICY_CHANGE', entity: 'Setting', entityId: 'power.config', meta: c });
  res.json(c);
}));
