import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, HttpError, page, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { daysUntilBirthday, guestStats, validBirthday } from '../services/crm';

/** Guest relationship tools: VIP flag, preferences, birthdays, repeat-guest history and the blacklist. */
export const crmRouter = Router();
const staff = requireRole('RECEPTIONIST'); // front desk and up
const manager = requireRole('MANAGER');    // the blacklist is a manager decision (admins pass too)

const row = (g: any, s: any) => ({
  id: g.id, name: `${g.firstName} ${g.lastName}`, phone: g.phone, email: g.email, isVip: g.isVip, isBlacklisted: g.isBlacklisted,
  birthMonth: g.birthMonth, birthDay: g.birthDay, visits: s?.visits ?? 0, nights: s?.nights ?? 0, totalBilled: s?.totalBilled ?? 0, lastStay: s?.lastStay ?? null,
});

/** The CRM list. filter: all | vip | blacklisted | repeat. */
crmRouter.get('/guests', staff, asyncHandler(async (req, res) => {
  const { filter, q } = parse(z.object({ filter: z.enum(['all', 'vip', 'blacklisted', 'repeat']).default('all'), q: z.string().trim().max(60).default('') }), req.query);
  const { skip, take, page: p } = page(req.query, 20);
  const and: Prisma.GuestWhereInput[] = [];
  if (q) and.push({ OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] });
  if (filter === 'vip') and.push({ isVip: true });
  if (filter === 'blacklisted') and.push({ isBlacklisted: true });
  if (filter === 'repeat') {
    const rep = await prisma.stay.groupBy({ by: ['guestId'], _count: { _all: true }, having: { guestId: { _count: { gte: 2 } } } });
    and.push({ id: { in: rep.map((r) => r.guestId) } });
  }
  const where: Prisma.GuestWhereInput = and.length ? { AND: and } : {};
  const [total, guests] = await Promise.all([prisma.guest.count({ where }), prisma.guest.findMany({ where, skip, take, orderBy: [{ isVip: 'desc' }, { createdAt: 'desc' }] })]);
  const stats = await guestStats(guests.map((g) => g.id));
  res.json({ total, page: p, rows: guests.map((g) => row(g, stats.get(g.id))) });
}));

crmRouter.get('/guests/:id', staff, asyncHandler(async (req, res) => {
  const g = await prisma.guest.findUnique({ where: { id: req.params.id }, include: { stays: { orderBy: { checkInAt: 'desc' }, take: 20, include: { room: { include: { roomType: true } } } } } });
  if (!g) throw new HttpError(404, 'Guest not found');
  const stats = (await guestStats([g.id])).get(g.id)!;
  const types = new Map<string, number>();
  for (const s of g.stays) types.set(s.room.roomType.name, (types.get(s.room.roomType.name) ?? 0) + 1);
  const fav = [...types.entries()].sort((a, b) => b[1] - a[1])[0];
  res.json({
    id: g.id, isVip: g.isVip, vipNote: g.vipNote, preferences: g.preferences, birthMonth: g.birthMonth, birthDay: g.birthDay,
    daysToBirthday: g.birthMonth && g.birthDay ? daysUntilBirthday(g.birthMonth, g.birthDay) : null,
    isBlacklisted: g.isBlacklisted, blacklistReason: g.blacklistReason, blacklistedAt: g.blacklistedAt,
    stats: { ...stats, favouriteRoomType: fav ? fav[0] : null, averageSpendPerVisit: stats.visits ? Math.round((stats.totalBilled / stats.visits) * 100) / 100 : 0 },
    history: g.stays.map((s) => ({ id: s.id, room: s.room.number, roomType: s.room.roomType.name, checkInAt: s.checkInAt, checkOutAt: s.checkOutAt, status: s.status })),
  });
}));

const profileBody = z.object({
  isVip: z.boolean().optional(), vipNote: z.string().trim().max(200).nullable().optional(), preferences: z.string().trim().max(500).nullable().optional(),
  birthMonth: z.coerce.number().int().min(1).max(12).nullable().optional(), birthDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
});
crmRouter.put('/guests/:id/profile', staff, asyncHandler(async (req, res) => {
  const b = parse(profileBody, req.body);
  const before = await prisma.guest.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'Guest not found');
  const month = b.birthMonth === undefined ? before.birthMonth : b.birthMonth, day = b.birthDay === undefined ? before.birthDay : b.birthDay;
  if ((month === null) !== (day === null)) throw new HttpError(400, 'Give both the birthday month and day, or neither');
  if (month !== null && day !== null && !validBirthday(month, day)) throw new HttpError(400, 'That is not a real date');
  await prisma.guest.update({ where: { id: before.id }, data: { ...b, vipNote: b.isVip === false ? null : b.vipNote } });
  if (b.isVip !== undefined && b.isVip !== before.isVip) await audit(prisma, { userId: req.user!.id, action: 'GUEST_VIP_EDIT', entity: 'Guest', entityId: before.id, meta: { name: `${before.firstName} ${before.lastName}`, isVip: b.isVip } });
  res.json({ ok: true });
}));

crmRouter.post('/guests/:id/blacklist', manager, asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Give a clear, factual reason').max(300) }), req.body);
  const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
  if (!g) throw new HttpError(404, 'Guest not found');
  if (g.isBlacklisted) throw new HttpError(409, 'This guest is already blacklisted');
  await prisma.$transaction(async (tx) => {
    await tx.guest.update({ where: { id: g.id }, data: { isBlacklisted: true, blacklistReason: reason, blacklistedAt: new Date(), blacklistedById: req.user!.id, isVip: false, vipNote: null } });
    await tx.reservation.updateMany({ where: { guestId: g.id, status: { in: ['PENDING', 'CONFIRMED'] }, arrival: { gt: new Date() } }, data: { status: 'CANCELLED' } }); // future bookings are cancelled
    await audit(tx, { userId: req.user!.id, action: 'GUEST_BLACKLIST', entity: 'Guest', entityId: g.id, meta: { name: `${g.firstName} ${g.lastName}`, reason } });
  });
  res.json({ ok: true });
}));

crmRouter.post('/guests/:id/unblacklist', manager, asyncHandler(async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().max(300).optional() }), req.body);
  const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
  if (!g || !g.isBlacklisted) throw new HttpError(409, 'This guest is not blacklisted');
  await prisma.guest.update({ where: { id: g.id }, data: { isBlacklisted: false, blacklistReason: null, blacklistedAt: null, blacklistedById: null } });
  await audit(prisma, { userId: req.user!.id, action: 'GUEST_UNBLACKLIST', entity: 'Guest', entityId: g.id, meta: { name: `${g.firstName} ${g.lastName}`, previousReason: g.blacklistReason, note: note ?? null } });
  res.json({ ok: true });
}));

/** Guests with a birthday in the next N days, today first, and where they are now. */
crmRouter.get('/birthdays', staff, asyncHandler(async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(0).max(60).default(14) }), req.query);
  const guests = await prisma.guest.findMany({ where: { birthMonth: { not: null }, birthDay: { not: null }, isBlacklisted: false }, include: { stays: { where: { status: 'CHECKED_IN' }, take: 1, include: { room: true } } } });
  res.json(guests
    .map((g) => ({ g, away: daysUntilBirthday(g.birthMonth!, g.birthDay!) }))
    .filter((x) => x.away <= days).sort((a, b) => a.away - b.away)
    .map(({ g, away }) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, phone: g.phone, birthMonth: g.birthMonth, birthDay: g.birthDay, daysAway: away, isVip: g.isVip, whatsappOptIn: g.whatsappOptIn, inHouseRoom: g.stays[0]?.room.number ?? null })));
}));
