import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, HttpError, page, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { DAY, SEV_RANK, invalidateCountCache, listFlags, loadThresholds, saveThresholds, scorecard, type Severity } from '../services/guard';

/** ADMIN always passes; a bare requireRole() is admin-only. */
const watch = requireRole('MANAGER');

const parseDay = (s: unknown): Date | null => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** from/to are inclusive calendar days; default is the last 7 days including today. */
function range(q: Record<string, unknown>) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const to = new Date((parseDay(q.to) ?? today).getTime() + DAY);
  const from = parseDay(q.from) ?? new Date(to.getTime() - 7 * DAY);
  if (from >= to) throw new HttpError(400, 'The start date must be before the end date');
  if (to.getTime() - from.getTime() > 366 * DAY) throw new HttpError(400, 'Choose a range of one year or less');
  return { from, to };
}

export const guardRouter = Router();

guardRouter.get('/flags', watch, asyncHandler(async (req, res) => {
  const { from, to } = range(req.query);
  const q = req.query as Record<string, string | undefined>;
  const minSeverity = (['HIGH', 'MEDIUM', 'LOW'].includes(q.minSeverity ?? '') ? q.minSeverity : 'MEDIUM') as Severity;
  const status = ['open', 'reviewed', 'all'].includes(q.status ?? '') ? (q.status as string) : 'open';

  const thresholds = await loadThresholds();
  const all = await listFlags(from, to, thresholds);
  const open = all.filter((f) => !f.review);
  const sum = (k: 'AT_RISK' | 'GIVEN_AWAY') => open.filter((f) => f.kind === k).reduce((s, f) => s + f.amount, 0);
  const summary = {
    high: open.filter((f) => f.severity === 'HIGH').length,
    medium: open.filter((f) => f.severity === 'MEDIUM').length,
    low: open.filter((f) => f.severity === 'LOW').length,
    atRisk: sum('AT_RISK'), givenAway: sum('GIVEN_AWAY'), open: open.length, reviewed: all.length - open.length,
  };

  const me = req.user!;
  const flags = all
    .filter((f) => SEV_RANK[f.severity] >= SEV_RANK[minSeverity])
    .filter((f) => status === 'all' || (status === 'open' ? !f.review : !!f.review))
    .map(({ involved, ...f }) => ({ ...f, canReview: me.role === 'ADMIN' || !involved.includes(me.id) }));

  res.json({ range: { from, to }, thresholds, summary, flags, scorecard: await scorecard(all, from, to) });
}));

const reviewBody = z.object({
  key: z.string().min(3).max(120),
  status: z.enum(['REVIEWED', 'DISMISSED', 'OPEN']),
  note: z.string().trim().max(500).optional(),
}).refine((b) => b.status !== 'DISMISSED' || (b.note?.length ?? 0) >= 3, { message: 'Add a short note explaining why this is being dismissed', path: ['note'] });

guardRouter.post('/flags/review', watch, asyncHandler(async (req, res) => {
  const b = parse(reviewBody, req.body);
  const me = req.user!;

  // Re-derive the flag on the server so the client can't review something that doesn't exist,
  // and so we know who was involved.
  const now = new Date();
  const flag = (await listFlags(new Date(now.getTime() - 400 * DAY), new Date(now.getTime() + DAY), undefined, now)).find((f) => f.key === b.key);
  if (!flag) throw new HttpError(404, 'This flag no longer exists');
  if (me.role !== 'ADMIN' && flag.involved.includes(me.id)) throw new HttpError(403, 'You cannot review activity that involves you. Ask another manager or the admin.');

  if (b.status === 'OPEN') await prisma.guardReview.deleteMany({ where: { flagKey: b.key } });
  else await prisma.guardReview.upsert({
    where: { flagKey: b.key }, update: { status: b.status, note: b.note ?? null, userId: me.id },
    create: { flagKey: b.key, status: b.status, note: b.note ?? null, userId: me.id },
  });
  await audit(prisma, { userId: me.id, action: 'GUARD_REVIEW', entity: flag.entity, entityId: flag.entityId, meta: { key: b.key, status: b.status, note: b.note ?? null, severity: flag.severity, amount: flag.amount } });
  invalidateCountCache();
  res.json({ ok: true });
}));

guardRouter.get('/settings', watch, asyncHandler(async (_req, res) => res.json(await loadThresholds())));

const num = z.coerce.number().min(0).max(1_000_000_000);
guardRouter.put('/settings', requireRole(), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    discountPct: num.max(100), discountFixed: num, compOrderValue: num, voidValue: num, adjustmentValue: num,
    agingDays: num.max(365), folioDays: num.max(365),
  }).partial(), req.body);
  const saved = await saveThresholds(b);
  await audit(prisma, { userId: req.user!.id, action: 'GUARD_SETTINGS', entity: 'Setting', meta: b });
  res.json(saved);
}));

// ───────────── Audit log viewer ─────────────
export const auditRouter = Router();

auditRouter.get('/', watch, asyncHandler(async (req, res) => {
  const { skip, take } = page(req.query, 25);
  const q = req.query as Record<string, string | undefined>;
  const from = parseDay(q.from);
  const to = parseDay(q.to);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: q.action } : {}),
    ...(q.entity ? { entity: { equals: q.entity.trim(), mode: 'insensitive' as const } } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(from || to ? { createdAt: { gte: from ?? undefined, lt: to ? new Date(to.getTime() + DAY) : undefined } } : {}),
  };
  const [total, rows, actions, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: { select: { username: true, fullName: true } } } }),
    prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
    prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: 'asc' } }),
  ]);
  res.json({ total, rows, actions: actions.map((a) => a.action), users });
}));
