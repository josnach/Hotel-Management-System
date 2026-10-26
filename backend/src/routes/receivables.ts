import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { age, agingReport, getReceivablesConfig, groupLines, saveReceivablesConfig } from '../services/receivables';

export const receivablesRouter = Router();
receivablesRouter.use(requireRole('ACCOUNTANT'));

receivablesRouter.get('/aging', asyncHandler(async (_q, res) => res.json(await agingReport())));

receivablesRouter.get('/groups/:id/statement', asyncHandler(async (req, res) => {
  const g = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!g) throw new HttpError(404, 'Company not found');
  const cfg = await getReceivablesConfig();
  const terms = g.paymentTermsDays ?? cfg.defaultTermsDays;
  const lines = await groupLines(g.id);
  let run = 0;
  res.json({
    company: { id: g.id, name: g.name, contact: g.contact, phone: g.phone, email: g.email }, termsDays: terms, creditLimit: g.creditLimit !== null ? Number(g.creditLimit) : cfg.defaultCreditLimit, asAt: new Date(),
    lines: lines.map((l) => { run = Math.round((run + l.charge - l.payment) * 100) / 100; return { ...l, balance: run }; }),
    aging: age(lines, terms),
  });
}));

/** Set one company's own limit and terms. Empty values mean "use the hotel-wide default". */
receivablesRouter.put('/groups/:id/terms', asyncHandler(async (req, res) => {
  const b = parse(z.object({ creditLimit: z.coerce.number().min(0).nullable(), paymentTermsDays: z.coerce.number().int().min(0).max(365).nullable() }), req.body);
  const before = await prisma.group.findUniqueOrThrow({ where: { id: req.params.id } });
  const g = await prisma.group.update({ where: { id: req.params.id }, data: b });
  await audit(prisma, { userId: req.user!.id, action: 'CREDIT_TERMS_EDIT', entity: 'Group', entityId: g.id, meta: { company: g.name, limitFrom: before.creditLimit === null ? null : Number(before.creditLimit), limitTo: b.creditLimit, termsFrom: before.paymentTermsDays, termsTo: b.paymentTermsDays } });
  res.json({ ok: true });
}));

const cfgBody = z.object({ defaultTermsDays: z.coerce.number().int().min(0).max(365), defaultCreditLimit: z.coerce.number().min(0).nullable(), overLimitMode: z.enum(['OFF', 'WARN', 'BLOCK']) });
receivablesRouter.get('/config', asyncHandler(async (_q, res) => res.json(await getReceivablesConfig())));
receivablesRouter.put('/config', asyncHandler(async (req, res) => {
  const c = parse(cfgBody, req.body);
  const before = await getReceivablesConfig();
  await saveReceivablesConfig(c);
  await audit(prisma, { userId: req.user!.id, action: 'CREDIT_POLICY_CHANGE', entity: 'Setting', entityId: 'receivables.config', meta: { before, after: c } as any });
  res.json(c);
}));
