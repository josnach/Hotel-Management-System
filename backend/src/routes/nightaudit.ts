import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { queueDigestForAudit } from '../messaging/digest';
import { buildAuditReport, cashHandled, shiftFor } from '../services/nightaudit';
import { addDays, dbDate, lastClosedDate, ymd } from '../services/period';

const n = (v: unknown) => Number(v ?? 0);
const cashier = requireRole('RECEPTIONIST', 'WAITER', 'ACCOUNTANT'); // anyone who handles money (managers and admins pass too)
const supervisor = requireRole('MANAGER');
const isSupervisor = (role?: string) => role === 'ADMIN' || role === 'MANAGER';
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ───────────── Cash drawer shifts ─────────────
export const shiftsRouter = Router();

/** The caller's open shift, if any. The expected amount is never shown here: cashiers count blind. */
shiftsRouter.get('/current', cashier, asyncHandler(async (req, res) => {
  const s = await prisma.shiftSession.findFirst({ where: { cashierId: req.user!.id, status: 'OPEN' } });
  res.json(s ? { id: s.id, name: s.name, date: s.date, openedAt: s.openedAt, openingFloat: n(s.openingFloat) } : null);
}));

shiftsRouter.post('/open', cashier, asyncHandler(async (req, res) => {
  const b = parse(z.object({ openingFloat: z.coerce.number().min(0).max(100_000_000) }), req.body);
  if (await prisma.shiftSession.findFirst({ where: { cashierId: req.user!.id, status: 'OPEN' } })) throw new HttpError(409, 'You already have a shift open');
  const now = new Date();
  const { name, date } = shiftFor(now);
  const last = await lastClosedDate();
  if (last && date <= last) throw new HttpError(409, `The business date ${date} is already closed`);
  const s = await prisma.shiftSession.create({ data: { name, date: dbDate(date), cashierId: req.user!.id, openedAt: now, openingFloat: b.openingFloat } });
  await audit(prisma, { userId: req.user!.id, action: 'SHIFT_OPEN', entity: 'ShiftSession', entityId: s.id, meta: { name, openingFloat: b.openingFloat } });
  res.status(201).json({ id: s.id, name: s.name, date: s.date, openedAt: s.openedAt, openingFloat: n(s.openingFloat) });
}));

/** Close a shift: declare the cash counted; the system compares it with what the books expect. */
shiftsRouter.post('/:id/close', cashier, asyncHandler(async (req, res) => {
  const b = parse(z.object({ declaredCash: z.coerce.number().min(0).max(1_000_000_000), notes: z.string().trim().max(500).optional() }), req.body);
  const s = await prisma.shiftSession.findUnique({ where: { id: req.params.id }, include: { cashier: { select: { fullName: true, username: true } } } });
  if (!s) throw new HttpError(404, 'Shift not found');
  if (s.status !== 'OPEN') throw new HttpError(409, 'This shift is already closed');
  if (s.cashierId !== req.user!.id && !isSupervisor(req.user!.role)) throw new HttpError(403, 'Only the cashier or a manager can close this shift');
  const now = new Date();
  const c = await cashHandled(s.cashierId!, s.openedAt, now);
  const expected = D(s.openingFloat).plus(c.net);
  const over = D(b.declaredCash).minus(expected);
  if (over.abs().gte(1) && !b.notes) throw new HttpError(400, `The count is ${over.gt(0) ? 'over' : 'short'} by ₦${over.abs().toFixed(2)}. Explain the difference in the notes.`);
  const closed = await prisma.$transaction(async (tx) => {
    const u = await tx.shiftSession.update({ where: { id: s.id }, data: { status: 'CLOSED', closedAt: now, closedById: req.user!.id, expectedCash: expected, declaredCash: b.declaredCash, overShort: over, nonCashTotal: c.nonCash, notes: b.notes } });
    await audit(tx, { userId: req.user!.id, action: 'SHIFT_CLOSE', entity: 'ShiftSession', entityId: s.id, meta: { cashier: s.cashier?.fullName ?? s.cashier?.username, expected: n(expected), declared: b.declaredCash, overShort: n(over) } });
    if (over.abs().gte(1)) await audit(tx, { userId: req.user!.id, action: 'CASH_VARIANCE', entity: 'ShiftSession', entityId: s.id, meta: { cashier: s.cashier?.fullName ?? s.cashier?.username, overShort: n(over), notes: b.notes } });
    return u;
  });
  // The result is shown only now, after the count has been committed.
  res.json({ id: closed.id, openingFloat: n(closed.openingFloat), cashReceived: n(c.cashIn), cashPaidOut: n(c.cashOut), expectedCash: n(expected), declaredCash: b.declaredCash, overShort: n(over), cardAndTransfer: n(c.nonCash) });
}));

/** Supervisor view: every shift for a date, with live expected cash for open ones. */
shiftsRouter.get('/', supervisor, asyncHandler(async (req, res) => {
  const date = parse(z.object({ date: dateStr.default(ymd(new Date())) }), req.query).date;
  const rows = await prisma.shiftSession.findMany({ where: { date: dbDate(date) }, include: { cashier: { select: { fullName: true, username: true } } }, orderBy: { openedAt: 'asc' } });
  res.json(await Promise.all(rows.map(async (s) => {
    const live = s.status === 'OPEN' ? D(s.openingFloat).plus((await cashHandled(s.cashierId!, s.openedAt, new Date())).net) : null;
    return { id: s.id, name: s.name, cashier: s.cashier?.fullName ?? s.cashier?.username ?? '—', status: s.status, openedAt: s.openedAt, closedAt: s.closedAt, openingFloat: n(s.openingFloat), expectedCash: n(s.expectedCash ?? live), declaredCash: s.declaredCash === null ? null : n(s.declaredCash), overShort: s.overShort === null ? null : n(s.overShort), nonCashTotal: n(s.nonCashTotal), notes: s.notes };
  })));
}));

// ───────────── Night audit ─────────────
export const nightAuditRouter = Router();
nightAuditRouter.use(supervisor);

nightAuditRouter.get('/status', asyncHandler(async (_q, res) => {
  const last = await lastClosedDate();
  const next = last ? addDays(last, 1) : addDays(ymd(new Date()), -1);
  res.json({ lastClosed: last, nextToClose: next, businessDate: last ? addDays(last, 1) : ymd(new Date()) });
}));

nightAuditRouter.get('/preview', asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateStr }), req.query);
  res.json(await buildAuditReport(date));
}));

/** Close a business date: stores the report, locks the date against backdated postings, and sends the owner digest if enabled. */
nightAuditRouter.post('/close', asyncHandler(async (req, res) => {
  const b = parse(z.object({ date: dateStr, notes: z.string().trim().max(1000).optional() }), req.body);
  const report = await buildAuditReport(b.date);
  if (!report.canClose) throw new HttpError(409, report.blockers.join(' '));
  const row = await prisma.$transaction(async (tx) => {
    const a = await tx.nightAudit.create({ data: { date: dbDate(b.date), closedById: req.user!.id, report: report as any, notes: b.notes } });
    await audit(tx, { userId: req.user!.id, action: 'NIGHT_AUDIT_CLOSE', entity: 'NightAudit', entityId: a.id, meta: { date: b.date, revenue: report.revenue.total, cashOverShort: report.cashOverShort, warnings: report.warnings.length } });
    return a;
  });
  void queueDigestForAudit(b.date); // no-op unless DIGEST_ON_AUDIT=true
  res.status(201).json({ id: row.id, date: b.date, report });
}));

nightAuditRouter.get('/history', asyncHandler(async (_q, res) => {
  const rows = await prisma.nightAudit.findMany({ orderBy: { date: 'desc' }, take: 60 });
  res.json(rows.map((a) => { const r = a.report as any; return { date: a.date.toISOString().slice(0, 10), closedAt: a.closedAt, notes: a.notes, revenue: r.revenue?.total ?? 0, occupancyPct: r.rooms?.occupancyPct ?? 0, cashOverShort: r.cashOverShort ?? 0 }; }));
}));

nightAuditRouter.get('/report/:date', asyncHandler(async (req, res) => {
  const a = await prisma.nightAudit.findUnique({ where: { date: dbDate(parse(z.object({ date: dateStr }), { date: req.params.date }).date) } });
  if (!a) throw new HttpError(404, 'That date has not been closed');
  res.json({ closedAt: a.closedAt, notes: a.notes, report: a.report });
}));
