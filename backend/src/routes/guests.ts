import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, clientIp, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { checkIn, checkOut, extendStay, runAutoExtension } from '../services/stays';
import { folioBalance } from '../services/folio';
import { consentData } from '../messaging/consent';
import { onCheckedOut } from '../messaging/triggers';
import { assertNotBlacklisted } from '../services/crm';

export const guestsRouter = Router();
const fd = requireRole('RECEPTIONIST');

const guestBody = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1), phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  address: z.string().optional(), idType: z.string().optional(), idNumber: z.string().optional(), nationality: z.string().optional(),
  whatsappOptIn: z.boolean().optional(),
});

/** "All Guests": search + status filter + pagination, with room/group/balance. */
guestsRouter.get('/', asyncHandler(async (req, res) => {
  const { skip, take, page: p } = page(req.query);
  const q = String(req.query.q ?? '').trim();
  const status = req.query.status as 'CHECKED_IN' | 'CHECKED_OUT' | undefined;
  const where: Prisma.GuestWhereInput = {
    ...(q ? { OR: [
      { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } },
      { stays: { some: { room: { number: { contains: q } } } } }, { stays: { some: { group: { name: { contains: q, mode: 'insensitive' } } } } },
    ] } : {}),
    ...(status ? { stays: { some: { status } } } : {}),
  };
  const [total, guests] = await Promise.all([
    prisma.guest.count({ where }),
    prisma.guest.findMany({ where, skip, take, orderBy: { createdAt: 'desc' },
      include: { stays: { orderBy: { checkInAt: 'desc' }, take: 1, include: { room: true, group: true, folio: true } } } }),
  ]);
  const rows = await Promise.all(guests.map(async (g) => {
    const s = g.stays[0];
    return { ...g, stays: undefined, room: s?.room.number, group: s?.group?.name ?? null, status: s?.status ?? null, stayId: s?.id, balance: s?.folio ? await folioBalance(s.folio.id) : D(0) };
  }));
  res.json({ total, page: p, rows });
}));

guestsRouter.post('/', fd, asyncHandler(async (req, res) => {
  const b = parse(guestBody, req.body);
  await assertNotBlacklisted(prisma, { phone: b.phone, idNumber: b.idNumber, email: b.email }, req.user!.id);
  res.status(201).json(await prisma.guest.create({ data: consentData(b) }));
}));
guestsRouter.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '');
  res.json(await prisma.guest.findMany({ where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }, take: 10 }));
}));

/** Guest detail page. */
guestsRouter.get('/:id', asyncHandler(async (req, res) => {
  const g = await prisma.guest.findUniqueOrThrow({ where: { id: req.params.id }, include: { stays: { orderBy: { checkInAt: 'desc' }, include: { room: true, group: true, folio: { include: { txs: { orderBy: { createdAt: 'desc' }, take: 10 } } } } } } });
  const cur = g.stays[0];
  res.json({ ...g, groupStatus: cur?.group ? 'Group' : 'Individual', checkInStatus: cur?.status ?? 'NEVER', recentTransactions: cur?.folio?.txs ?? [] });
}));
guestsRouter.put('/:id', fd, asyncHandler(async (req, res) => res.json(await prisma.guest.update({ where: { id: req.params.id }, data: consentData(parse(guestBody.partial(), req.body)) }))));

// Groups
export const groupsRouter = Router();
groupsRouter.get('/', asyncHandler(async (_q, res) => res.json(await prisma.group.findMany({ include: { _count: { select: { stays: true } } }, orderBy: { name: 'asc' } }))));
groupsRouter.post('/', fd, asyncHandler(async (req, res) => res.status(201).json(await prisma.group.create({ data: parse(z.object({ name: z.string().min(1), contact: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional() }), req.body) }))));

// Stays: check-in, in-house, checkout, extend, next-checkout, auto-extension
export const staysRouter = Router();

const ciBody = z.object({
  guestId: z.string().optional(),
  guest: guestBody.optional(),
  reservationId: z.string().optional(),
  roomId: z.string(),
  groupId: z.string().optional(),
  numGuests: z.coerce.number().int().min(1),
  expectedDeparture: z.coerce.date(),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  discountValue: z.coerce.number().min(0).default(0),
  discountReason: z.string().optional(),
  isComplimentary: z.boolean().default(false),
  complimentaryReason: z.string().optional(),
  authorizedBy: z.string().optional(),
  applyVat: z.boolean().default(false),
  applyServiceCharge: z.boolean().default(false),
  advancePayment: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']).optional(),
  specialRequests: z.string().optional(),
});

staysRouter.post('/check-in', fd, asyncHandler(async (req, res) => res.status(201).json(await checkIn(parse(ciBody, req.body), req.user!.id, req.user!.role))));

staysRouter.get('/in-house', asyncHandler(async (_q, res) => {
  const stays = await prisma.stay.findMany({ where: { status: 'CHECKED_IN' }, include: { guest: true, room: true, group: true, folio: true }, orderBy: { checkInAt: 'desc' } });
  res.json(await Promise.all(stays.map(async (s) => ({ ...s, balance: s.folio ? await folioBalance(s.folio.id) : D(0) }))));
}));

/** Guests Due for Checkout: ?hours=14 (default 14). Overdue rows carry overdueDays. */
staysRouter.get('/next-checkout', asyncHandler(async (req, res) => {
  const hours = Number(req.query.hours ?? 14);
  const now = new Date();
  const horizon = new Date(now.getTime() + hours * 3_600_000);
  const stays = await prisma.stay.findMany({ where: { status: 'CHECKED_IN', expectedDeparture: { lte: horizon } }, include: { guest: true, room: true, group: true }, orderBy: { expectedDeparture: 'asc' } });
  const rows = stays.map((s) => {
    const diff = s.expectedDeparture.getTime() - now.getTime();
    return { ...s, overdue: diff < 0, overdueDays: diff < 0 ? Math.floor(-diff / 86_400_000) : 0, hoursLeft: diff / 3_600_000 };
  });
  res.json({
    total: rows.length,
    withinTwoHours: rows.filter((r) => r.hoursLeft <= 2).length,
    today: rows.filter((r) => r.expectedDeparture.toDateString() === now.toDateString() && !r.overdue).length,
    timeFrameHours: hours, rows,
  });
}));
staysRouter.get('/due-count', asyncHandler(async (_q, res) => res.json({ count: await prisma.stay.count({ where: { status: 'CHECKED_IN', expectedDeparture: { lte: new Date(Date.now() + 14 * 3_600_000) } } }) })));

staysRouter.post('/:id/check-out', fd, asyncHandler(async (req, res) => {
  const b = parse(z.object({ payment: z.object({ amount: z.coerce.number().positive(), method: z.enum(['CASH', 'CARD', 'TRANSFER']) }).optional(), moveToCityLedger: z.boolean().default(false) }), req.body);
  const result = await checkOut(req.params.id, req.user!.id, b.payment, b.moveToCityLedger);
  void onCheckedOut(req.params.id); // after commit; never blocks or fails the checkout
  res.json(result);
}));
staysRouter.post('/:id/extend', fd, asyncHandler(async (req, res) => {
  const { nights } = parse(z.object({ nights: z.coerce.number().int().min(1).max(60) }), req.body);
  res.json(await extendStay(req.params.id, nights, req.user!.id));
}));

// Auto extension stats / logs / manual run
staysRouter.get('/auto-extension/stats', asyncHandler(async (_q, res) => {
  const due = await prisma.stay.findMany({ where: { status: 'CHECKED_IN' }, include: { room: { include: { roomType: true } } } });
  const potential = due.reduce((s, x) => s.plus(D(x.nightlyRate)), D(0));
  const last = await prisma.autoExtensionLog.findFirst({ where: { action: 'AUTO_RUN' }, orderBy: { createdAt: 'desc' } });
  const next = new Date(); next.setHours(14, 0, 0, 0); if (next < new Date()) next.setDate(next.getDate() + 1);
  res.json({ eligible: due.length, individual: due.filter((d) => !d.groupId).length, group: due.filter((d) => d.groupId).length, potentialRevenue: potential, nextRun: next, lastRun: last?.createdAt ?? null });
}));
staysRouter.get('/auto-extension/logs', asyncHandler(async (_q, res) => res.json(await prisma.autoExtensionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }))));
staysRouter.post('/auto-extension/run', requireRole(), asyncHandler(async (req, res) => res.json(await runAutoExtension(req.user!.id, clientIp(req), 'MANUAL_RUN'))));
