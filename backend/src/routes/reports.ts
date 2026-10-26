import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, dayRange, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { folioBalance } from '../services/folio';
import { openHighCount } from '../services/guard';
import { nightsBetween } from '../services/stayNights';

export const reportsRouter = Router();

const bucket = (d: Date) => { const h = d.getHours(); return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };

reportsRouter.get('/check-in', asyncHandler(async (req, res) => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const stays = await prisma.stay.findMany({ where: { checkInAt: { gte: start, lt: end } }, include: { guest: true, room: true, group: true }, orderBy: { checkInAt: 'asc' } });
  const dist = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  stays.forEach((s) => { dist[bucket(s.checkInAt)]++; });
  res.json({ date: start, totalCheckIns: stays.length, individual: stays.filter((s) => !s.groupId).length, group: stays.filter((s) => s.groupId).length, totalGuests: stays.reduce((n, s) => n + s.numGuests, 0), distribution: dist, rows: stays });
}));

reportsRouter.get('/check-out', asyncHandler(async (req, res) => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const stays = await prisma.stay.findMany({ where: { checkOutAt: { gte: start, lt: end } }, include: { guest: true, room: true, group: true, folio: { include: { txs: true } } } });
  const dist = { earlyMorning: 0, morning: 0, afternoon: 0, evening: 0 };
  stays.forEach((s) => { const h = s.checkOutAt!.getHours(); dist[h < 6 ? 'earlyMorning' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening']++; });
  const txs = stays.flatMap((s) => s.folio?.txs ?? []);
  const revenue = txs.reduce((s, t) => s.plus(t.bill), D(0)), payments = txs.reduce((s, t) => s.plus(t.payment), D(0));
  res.json({ date: start, totalCheckOuts: stays.length, individual: stays.filter((s) => !s.groupId).length, group: stays.filter((s) => s.groupId).length, roomsVacated: stays.length, distribution: dist, financial: { totalRevenue: revenue, totalPayments: payments, netBalance: revenue.minus(payments) }, rows: stays });
}));

reportsRouter.get('/occupancy', asyncHandler(async (req, res) => {
  const rooms = await prisma.room.findMany({ include: { roomType: true } });
  const by = (s: string) => rooms.filter((r) => r.status === s).length;
  const occupied = by('OCCUPIED');
  const stays = await prisma.stay.findMany({ where: { status: 'CHECKED_IN' } });
  const revenue = stays.reduce((s, x) => s.plus(x.nightlyRate), D(0));
  const types = new Map<string, { roomType: string; total: number; occupied: number; available: number; rateSum: Prisma.Decimal }>();
  rooms.forEach((r) => { const t = types.get(r.roomType.name) ?? { roomType: r.roomType.name, total: 0, occupied: 0, available: 0, rateSum: D(0) }; t.total++; if (r.status === 'OCCUPIED') { t.occupied++; t.rateSum = t.rateSum.plus(r.rateOverride ?? r.roomType.nightlyRate); } if (r.status === 'AVAILABLE') t.available++; types.set(r.roomType.name, t); });
  res.json({
    occupancyRate: rooms.length ? (occupied / rooms.length) * 100 : 0, occupied, totalRooms: rooms.length,
    adr: occupied ? revenue.div(occupied) : D(0), revPar: rooms.length ? revenue.div(rooms.length) : D(0), totalRevenue: revenue,
    status: { total: rooms.length, occupied, available: by('AVAILABLE'), reserved: by('RESERVED'), maintenance: by('MAINTENANCE'), cleaning: by('CLEANING') },
    byRoomType: [...types.values()].map((t) => ({ ...t, occupancyRate: (t.occupied / t.total) * 100, averageRate: t.occupied ? t.rateSum.div(t.occupied) : D(0) })),
  });
}));

/** Detailed Sales Summary: ?start&end&salesPointIds=a,b&method=CASH&userId= */
reportsRouter.get('/sales-summary', requireRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const { start, end, salesPointIds, method, userId } = req.query as Record<string, string | undefined>;
  const day = dayRange();
  const where: Prisma.OrderWhereInput = {
    paymentStatus: { not: 'VOIDED' },
    createdAt: { gte: start ? new Date(start) : day.start, lte: end ? new Date(`${end}T23:59:59`) : day.end },
    ...(salesPointIds ? { salesPointId: { in: salesPointIds.split(',') } } : {}), ...(method ? { paymentMethod: method as any } : {}), ...(userId ? { staffId: userId } : {}),
  };
  const orders = await prisma.order.findMany({ where, include: { salesPoint: true, staff: { select: { username: true } }, items: { include: { item: true } } }, orderBy: { createdAt: 'asc' } });
  const groups = new Map<string, any>();
  orders.forEach((o) => { const g = groups.get(o.salesPoint.name) ?? { salesPoint: o.salesPoint.name, total: D(0), orders: [] }; g.total = g.total.plus(o.total); g.orders.push(o); groups.set(o.salesPoint.name, g); });
  res.json({ grandTotal: orders.reduce((s, o) => s.plus(o.total), D(0)), groups: [...groups.values()] });
}));

reportsRouter.get('/complimentary', asyncHandler(async (req, res) => {
  const { start, end } = req.query as Record<string, string | undefined>;
  const stays = await prisma.stay.findMany({ where: { isComplimentary: true, checkInAt: { gte: start ? new Date(start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1), lte: end ? new Date(`${end}T23:59:59`) : new Date() } }, include: { guest: true, room: true } });
 const value = (s: (typeof stays)[number]) =>
  s.nightlyRate.times(
    nightsBetween(
      s.checkInAt,
      s.checkOutAt ?? s.expectedDeparture,
    ),
  );
  const total = stays.reduce((a, s) => a.plus(value(s)), D(0));
  const tally = (key: (s: (typeof stays)[number]) => string) => Object.entries(stays.reduce<Record<string, number>>((m, s) => { const k = key(s) || 'Unspecified'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count }));
  res.json({ totalStays: stays.length, totalValue: total, averageValue: stays.length ? total.div(stays.length) : D(0), byReason: tally((s) => s.complimentaryReason ?? ''), byAuthorizer: tally((s) => s.authorizedBy ?? ''), rows: stays });
}));

/** Shift report for a date. Shifts: MORNING 07-15, AFTERNOON 15-22, NIGHT 22-07. */
const SHIFTS = [{ name: 'MORNING', from: 7, to: 15, label: '7:00 - 15:00' }, { name: 'AFTERNOON', from: 15, to: 22, label: '15:00 - 22:00' }, { name: 'NIGHT', from: 22, to: 31, label: '22:00 - 7:00' }];
reportsRouter.get('/shifts', asyncHandler(async (req, res) => {
  const { start } = dayRange(req.query.date as string | undefined);
  const out = [];
  for (const s of SHIFTS) {
    const from = new Date(start.getTime() + s.from * 3_600_000), to = new Date(start.getTime() + s.to * 3_600_000);
    const txs = await prisma.folioTransaction.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { folio: { include: { guest: true, stay: { include: { room: true } } } } }, orderBy: { createdAt: 'asc' } });
    const billings = txs.reduce((a, t) => a.plus(t.bill), D(0)), payments = txs.reduce((a, t) => a.plus(t.payment), D(0));
    out.push({ ...s, billings, payments, collectionRate: billings.gt(0) ? payments.div(billings).times(100) : D(0), transactions: txs.length, averageTransaction: txs.length ? billings.plus(payments).div(txs.length) : D(0), rows: txs });
  }
  res.json({ date: start, shifts: out, combined: { billings: out.reduce((a, s) => a.plus(s.billings), D(0)), payments: out.reduce((a, s) => a.plus(s.payments), D(0)), transactions: out.reduce((n, s) => n + s.transactions, 0) } });
}));

// Security / DSS
export const securityRouter = Router();
securityRouter.use(requireRole('RECEPTIONIST'));
securityRouter.get('/dss', asyncHandler(async (req, res) => {
  const { start, end, guestStatus, securityStatus } = req.query as Record<string, string | undefined>;
  const where: Prisma.GuestWhereInput = {
    ...(start || end ? { createdAt: { gte: start ? new Date(start) : undefined, lte: end ? new Date(`${end}T23:59:59`) : undefined } } : {}),
    ...(guestStatus === 'CHECKED_IN' ? { stays: { some: { status: 'CHECKED_IN' } } } : guestStatus === 'CHECKED_OUT' ? { stays: { none: { status: 'CHECKED_IN' } } } : {}),
    ...(securityStatus ? { securityStatus: securityStatus as any } : {}),
  };
  const guests = await prisma.guest.findMany({ where, include: { stays: { where: { status: 'CHECKED_IN' }, take: 1, include: { room: true } } } });
  res.json({ totalGuests: guests.length, currentlyCheckedIn: guests.filter((g) => g.stays.length).length, foreignGuests: guests.filter((g) => g.nationality && !/nigeria/i.test(g.nationality)).length, withoutId: guests.filter((g) => !g.idNumber).length, rows: guests });
}));
securityRouter.get('/guests-info', asyncHandler(async (req, res) => {
  const { skip, take } = page(req.query, 20);
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.GuestWhereInput = q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {};
  const [total, rows] = await Promise.all([prisma.guest.count({ where }), prisma.guest.findMany({ where, skip, take, include: { stays: { where: { status: 'CHECKED_IN' }, take: 1 } }, orderBy: { firstName: 'asc' } })]);
  res.json({ total, rows: rows.map((g) => ({ ...g, checkedIn: g.stays.length > 0, stays: undefined })) });
}));
securityRouter.post('/guests/:id/report', requireRole('RECEPTIONIST'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['VERIFIED', 'FLAGGED', 'PENDING']), note: z.string().optional() }), req.body);
  res.json(await prisma.guest.update({ where: { id: req.params.id }, data: { securityStatus: b.status, securityNote: b.note, securityAt: new Date() } }));
}));

// Dashboard + notifications
export const dashboardRouter = Router();
dashboardRouter.get('/', asyncHandler(async (_req, res) => {
  const now = new Date();
  const { start: today, end: tomorrow } = dayRange();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const revenue = async (from: Date) => {
    const a = await prisma.journalLine.aggregate({ where: { account: { type: 'REVENUE' }, entry: { date: { gte: from } } }, _sum: { credit: true, debit: true } });
    return D(a._sum.credit ?? 0).minus(D(a._sum.debit ?? 0));
  };
  const expenseAgg = await prisma.journalLine.aggregate({ where: { account: { type: 'EXPENSE' }, entry: { date: { gte: monthStart } } }, _sum: { debit: true, credit: true } });
  const [dayRev, weekRev, monthRev, ciToday, coToday, rooms, occupied, inHouse] = await Promise.all([
    revenue(today), revenue(weekStart), revenue(monthStart),
    prisma.stay.count({ where: { checkInAt: { gte: today, lt: tomorrow } } }), prisma.stay.count({ where: { checkOutAt: { gte: today, lt: tomorrow } } }),
    prisma.room.count(), prisma.room.count({ where: { status: 'OCCUPIED' } }),
    prisma.stay.findMany({ where: { status: 'CHECKED_IN' }, include: { folio: true } }),
  ]);
  let outstanding = D(0);
  for (const s of inHouse) if (s.folio) outstanding = outstanding.plus(await folioBalance(s.folio.id));
  const cityTx = await prisma.folioTransaction.aggregate({ where: { type: 'DEBIT_GROUP' }, _sum: { bill: true } });
  const cityPaid = await prisma.folioTransaction.aggregate({ where: { folio: { groupId: { not: null } }, type: 'CREDIT' }, _sum: { payment: true } });
  const unpaid = await prisma.order.aggregate({ where: { paymentStatus: 'UNPAID' }, _sum: { total: true } });
  const exp = D(expenseAgg._sum.debit ?? 0).minus(D(expenseAgg._sum.credit ?? 0));
  res.json({
    todayRevenue: dayRev, weekRevenue: weekRev, monthRevenue: monthRev,
    profitMargin: monthRev.gt(0) ? monthRev.minus(exp).div(monthRev).times(100) : D(0), grossProfit: monthRev.minus(exp),
    checkInsToday: ciToday, inHouseGuests: inHouse.length, checkOutsToday: coToday,
    occupancyRate: rooms ? (occupied / rooms) * 100 : 0, occupied, totalRooms: rooms,
    inHouseOutstanding: outstanding, cityLedgerOutstanding: D(cityTx._sum.bill ?? 0).minus(D(cityPaid._sum.payment ?? 0)).plus(D(unpaid._sum.total ?? 0)), updatedAt: now,
  });
}));
dashboardRouter.get('/notifications', asyncHandler(async (req, res) => {
  const [overdue, unpaid, pendingAdj, lowStock] = await Promise.all([
    prisma.stay.count({ where: { status: 'CHECKED_IN', expectedDeparture: { lt: new Date() } } }),
    prisma.order.count({ where: { paymentStatus: 'UNPAID' } }), prisma.stockAdjustment.count({ where: { status: 'PENDING' } }),
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "InventoryItem" WHERE "isActive" = true AND "quantity" <= "minLevel"`,
  ]);
  const low = Number(lowStock[0]?.c ?? 0);
  const guardHigh = ['ADMIN', 'MANAGER'].includes(req.user?.role ?? '') ? await openHighCount().catch(() => 0) : 0;
  res.json({ total: overdue + unpaid + pendingAdj + low + guardHigh, overdueCheckouts: overdue, unpaidBills: unpaid, pendingAdjustments: pendingAdj, lowStock: low, guardHigh });
}));
