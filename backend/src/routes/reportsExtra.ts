import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC } from '../services/accounting';
import { bounds, ymd } from '../services/period';

export const reportsExtraRouter = Router();

const finance = requireRole('ACCOUNTANT');
const frontDesk = requireRole('RECEPTIONIST');
const housekeepingView = requireRole('RECEPTIONIST', 'HOUSEKEEPING');

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: unknown) => Math.round(n(v) * 100) / 100;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const nightsBetween = (a: Date, b: Date) => Math.max(1, Math.ceil((b.getTime() - a.getTime()) / DAY));
const overlapNights = (a: Date, b: Date, from: Date, to: Date) =>
  Math.max(0, Math.ceil((Math.min(b.getTime(), to.getTime()) - Math.max(a.getTime(), from.getTime())) / DAY));
const rateOf = (r: { rateOverride: Prisma.Decimal | null; roomType: { nightlyRate: Prisma.Decimal } }) =>
  n(r.rateOverride ?? r.roomType.nightlyRate);
const fullName = (g: { firstName: string; lastName: string } | null | undefined) => (g ? `${g.firstName} ${g.lastName}` : null);
const userName = (u: { fullName: string | null; username: string } | null | undefined) => u?.fullName ?? u?.username ?? null;

const blank = (v: unknown) => (v === '' ? undefined : v);
const ymdField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const dateOpt = z.preprocess(blank, ymdField.optional());
const rangeQuery = z.object({ start: dateOpt, end: dateOpt });

/** Default start is the 1st of the month, or `daysBack` days ago when given. */
function rangeFrom(q: { start?: string; end?: string }, daysBack?: number) {
  const today = ymd(new Date());
  const endStr = q.end ?? today;
  let startStr = q.start;
  if (!startStr) {
    if (daysBack === undefined) startStr = `${today.slice(0, 7)}-01`;
    else { const d = new Date(); d.setDate(d.getDate() - daysBack); startStr = ymd(d); }
  }
  if (startStr > endStr) throw new HttpError(400, 'Start date must be on or before end date');
  const start = bounds(startStr).start;
  const end = bounds(endStr).end;
  return { startStr, endStr, start, end, days: nightsBetween(start, end) };
}

/** Net credit (revenue) of one account over [from, to). */
async function accNet(code: string, from: Date, to: Date) {
  const a = await prisma.journalLine.aggregate({
    where: { account: { code }, entry: { date: { gte: from, lt: to } } },
    _sum: { debit: true, credit: true },
  });
  return D(a._sum.credit ?? 0).minus(D(a._sum.debit ?? 0));
}

/** Room revenue per room type, from journals posted with reference STAY:<stayId>. */
async function roomRevenueByType(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ name: string; revenue: Prisma.Decimal }[]>`
    SELECT rt."name" AS name, COALESCE(SUM(l."credit" - l."debit"), 0) AS revenue
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "Account" a ON a."id" = l."accountId"
    JOIN "Stay" s ON s."id" = substring(e."reference" from 6)
    JOIN "Room" r ON r."id" = s."roomId"
    JOIN "RoomType" rt ON rt."id" = r."roomTypeId"
    WHERE a."code" = ${ACC.ROOM_REVENUE}
      AND e."reference" LIKE 'STAY:%'
      AND e."date" >= ${from} AND e."date" < ${to}
    GROUP BY rt."name"`;
  return new Map(rows.map((r) => [r.name, n(r.revenue)]));
}

/** Rooms occupied at the end of a business day (same rule as night audit). */
async function occupiedRoomIds(end: Date) {
  const stays = await prisma.stay.findMany({
    where: { checkInAt: { lt: end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: end } }] },
    select: { roomId: true },
  });
  return new Set(stays.map((s) => s.roomId));
}

// ───────────── Payments Shift Report ─────────────
const SHIFT_HOURS = { MORNING: [7, 14], AFTERNOON: [14, 22], NIGHT: [22, 31] } as const;
const isFrontdesk = (name: string) => /front\s*desk/i.test(name);

reportsExtraRouter.get('/payments-shift/sales-points', requireRole('RECEPTIONIST', 'ACCOUNTANT'), asyncHandler(async (_q, res) => {
  const rows = await prisma.salesPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, location: true } });
  res.json(rows.map((r) => ({ ...r, isFrontdesk: isFrontdesk(r.name) })));
}));


reportsExtraRouter.get('/payments-shift', requireRole('RECEPTIONIST', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const q = parse(z.object({
    date: dateOpt,
    shift: z.preprocess(blank, z.enum(['MORNING', 'AFTERNOON', 'NIGHT']).optional()),
    salesPointId: z.preprocess(blank, z.string().optional()),
  }), req.query);

  const date = q.date ?? ymd(new Date());
  const dayStart = bounds(date).start;
  const [h0, h1] = q.shift ? SHIFT_HOURS[q.shift] : [0, 24];
  const from = new Date(dayStart.getTime() + h0 * 3_600_000);
  const to = new Date(dayStart.getTime() + h1 * 3_600_000);

  const sp = q.salesPointId
    ? await prisma.salesPoint.findUnique({ where: { id: q.salesPointId }, select: { id: true, name: true } })
    : null;
  if (q.salesPointId && !sp) throw new HttpError(404, 'Sales point not found');
  // Front-desk payments are posted without a sales point, so "Frontdesk" includes those too.
  const spWhere: Prisma.FolioTransactionWhereInput = !sp
    ? {}
    : isFrontdesk(sp.name) ? { OR: [{ salesPointId: sp.id }, { salesPointId: null }] } : { salesPointId: sp.id };

  const txs = await prisma.folioTransaction.findMany({
    where: {
      AND: [
        { createdAt: { gte: from, lt: to } },
        { OR: [{ payment: { gt: 0 } }, { bill: { gt: 0 }, description: { contains: 'refund', mode: 'insensitive' } }] },
        spWhere,
      ],
    },
    include: { folio: { include: { guest: true, stay: { include: { guest: true, room: true } } } }, salesPoint: true, user: { select: { fullName: true, username: true } } },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });

  const bucketOf = (m: string | null) => (m === 'CASH' ? 'cash' : m === 'CARD' ? 'posCard' : m === 'TRANSFER' ? 'transfer' : 'uncategorized');
  const methods = { cash: { amount: 0, count: 0 }, posCard: { amount: 0, count: 0 }, transfer: { amount: 0, count: 0 }, uncategorized: { amount: 0, count: 0 } };
  let payments = 0, paymentCount = 0, refunds = 0, refundCount = 0;

  const rows = txs.flatMap((t) => {
    const refund = /refund/i.test(t.description);
    const amount = refund ? n(t.bill) + n(t.payment) : n(t.payment);
    if (amount <= 0) return [];
    const m = methods[bucketOf(t.method)];
    if (refund) { refunds += amount; refundCount++; } else { payments += amount; paymentCount++; m.amount += amount; m.count++; }
    const g = t.folio.guest ?? t.folio.stay?.guest;
    return [{
      id: t.id, time: t.createdAt, guestName: fullName(g) ?? 'N/A', room: t.folio.stay?.room.number ?? null,
      folioNo: t.folio.folioNo, description: t.description, method: t.method, type: refund ? 'REFUND' : 'PAYMENT',
      salesPoint: t.salesPoint?.name ?? 'Frontdesk', amount: r2(amount), receivedBy: userName(t.user),
    }];
  });
  for (const k of Object.keys(methods) as (keyof typeof methods)[]) methods[k].amount = r2(methods[k].amount);

  res.json({
    date, shift: q.shift ?? null, salesPoint: sp,
    totals: { payments: { amount: r2(payments), count: paymentCount }, refunds: { amount: r2(refunds), count: refundCount }, net: r2(payments - refunds), transactions: paymentCount + refundCount },
    methods, rows,
  });
}));

// ───────────── Daily Financial Reconciliation ─────────────
reportsExtraRouter.get('/daily-financial', finance, asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateOpt }), req.query);
  const day = date ?? ymd(new Date());
  const { start, end } = bounds(day);
  const dayWhere = { createdAt: { gte: start, lt: end } };

  const [room, fnb, other, tx, advance, city, owing] = await Promise.all([
    accNet(ACC.ROOM_REVENUE, start, end), accNet(ACC.FNB_REVENUE, start, end), accNet(ACC.OTHER_REVENUE, start, end),
    prisma.folioTransaction.aggregate({ where: dayWhere, _count: { _all: true }, _sum: { bill: true, payment: true } }),
    prisma.folioTransaction.aggregate({
      where: { ...dayWhere, payment: { gt: 0 }, OR: [{ description: { contains: 'advance', mode: 'insensitive' } }, { description: { contains: 'deposit', mode: 'insensitive' } }] },
      _sum: { payment: true },
    }),
    prisma.cityLedgerEntry.groupBy({ by: ['type'], where: { transactionDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } }, _sum: { amount: true } }),
    prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folio: { status: 'ACTIVE' } }, _sum: { bill: true, payment: true } }),
  ]);

  const roomRev = n(room), otherRev = n(fnb) + n(other), total = roomRev + otherRev;
  const outstanding = owing.reduce((s, f) => s + Math.max(0, n(f._sum.bill) - n(f._sum.payment)), 0);
  const volume = n(tx._sum.bill) + n(tx._sum.payment);
  const count = tx._count._all;
  const credits = n(city.find((c) => c.type === 'CREDIT')?._sum.amount);
  const debits = n(city.find((c) => c.type === 'DEBIT')?._sum.amount);

  res.json({
    date: day,
    stats: { totalRevenue: r2(total), outstandingBalances: r2(outstanding), advancePayments: r2(advance._sum.payment), transactions: count },
    revenueBreakdown: [
      { category: 'Room Revenue', amount: r2(roomRev), percentage: pct(roomRev, total) },
      { category: 'Other Revenue', amount: r2(otherRev), percentage: pct(otherRev, total) },
    ],
    // Net movement follows the City Ledger page: debits (owed to the hotel) minus credits.
    cityLedger: { credits: r2(credits), debits: r2(debits), net: r2(debits - credits) },
    transactionSummary: { totalVolume: r2(volume), count, average: count ? r2(volume / count) : 0 },
  });
}));


// ───────────── Revenue Breakdown by Department ─────────────
reportsExtraRouter.get('/revenue-department', finance, asyncHandler(async (req, res) => {
  const r = rangeFrom(parse(rangeQuery, req.query));

  const codes = [
    ACC.ROOM_REVENUE,
    ACC.FNB_REVENUE,
    ACC.OTHER_REVENUE,
    ACC.EVENT_REVENUE,
    ACC.EVENT_FACILITY_RENTAL_REVENUE,
  ];

  const lines = await prisma.$queryRaw<{
    day: Date;
    code: string;
    net: Prisma.Decimal;
  }[]>`
    SELECT
      date_trunc('day', e."date") AS day,
      a."code" AS code,
      COALESCE(SUM(l."credit" - l."debit"), 0) AS net
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "Account" a ON a."id" = l."accountId"
    WHERE a."code" IN (${Prisma.join(codes)})
      AND e."date" >= ${r.start}
      AND e."date" < ${r.end}
    GROUP BY 1, 2
    ORDER BY 1`;

  type DailyRevenue = {
    date: string;
    rooms: number;
    fnb: number;
    amenities: number;
    other: number;
    eventOther: number;
    eventFacilityRental: number;
    events: number;
    total: number;
  };

  const byDay = new Map<string, DailyRevenue>();

  let rooms = 0;
  let fnb = 0;
  let other = 0;
  let eventOther = 0;
  let eventFacilityRental = 0;

  for (const line of lines) {
    const key = ymd(new Date(line.day));

    const daily = byDay.get(key) ?? {
      date: key,
      rooms: 0,
      fnb: 0,
      amenities: 0,
      other: 0,
      eventOther: 0,
      eventFacilityRental: 0,
      events: 0,
      total: 0,
    };

    const amount = n(line.net);

    if (line.code === ACC.ROOM_REVENUE) {
      daily.rooms += amount;
      rooms += amount;
    } else if (line.code === ACC.FNB_REVENUE) {
      daily.fnb += amount;
      fnb += amount;
    } else if (line.code === ACC.OTHER_REVENUE) {
      daily.other += amount;
      other += amount;
    } else if (line.code === ACC.EVENT_REVENUE) {
      daily.eventOther += amount;
      eventOther += amount;
    } else if (line.code === ACC.EVENT_FACILITY_RENTAL_REVENUE) {
      daily.eventFacilityRental += amount;
      eventFacilityRental += amount;
    }

    daily.events = daily.eventOther + daily.eventFacilityRental;
    daily.total += amount;

    byDay.set(key, daily);
  }

  const events = eventOther + eventFacilityRental;
  const total = rooms + fnb + other + events;

  const row = (department: string, amount: number) => ({
    department,
    amount: r2(amount),
    percentage: pct(amount, total),
  });

  res.json({
    range: {
      start: r.startStr,
      end: r.endStr,
    },

    stats: {
      rooms: r2(rooms),
      fnb: r2(fnb),
      amenities: 0,
      other: r2(other),
      events: r2(events),
      eventOther: r2(eventOther),
      eventFacilityRental: r2(eventFacilityRental),
    },

    distribution: [
      row('Rooms', rooms),
      row('Food & Beverage', fnb),
      row('Amenities', 0),
      row('Other', other),
      row('Event Other Revenue', eventOther),
      row('Event Facility Rental', eventFacilityRental),
    ],

    total: r2(total),

    trend: [...byDay.values()].map((daily) => ({
      ...daily,
      rooms: r2(daily.rooms),
      fnb: r2(daily.fnb),
      other: r2(daily.other),
      eventOther: r2(daily.eventOther),
      eventFacilityRental: r2(daily.eventFacilityRental),
      events: r2(daily.events),
      total: r2(daily.total),
    })),
  });
}));


// ───────────── Occupancy Statistics & Room Revenue Analysis ─────────────
reportsExtraRouter.get('/occupancy-statistics', frontDesk, asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateOpt }), req.query);
  const day = date ?? ymd(new Date());
  const { start, end } = bounds(day);

  const [rooms, occupiedIds, roomRev, byType] = await Promise.all([
    prisma.room.findMany({ include: { roomType: true } }),
    occupiedRoomIds(end),
    accNet(ACC.ROOM_REVENUE, start, end),
    roomRevenueByType(start, end),
  ]);

  const total = rooms.length;
  const occupied = rooms.filter((r) => occupiedIds.has(r.id)).length;
  const count = (s: string) => rooms.filter((r) => r.status === s && !occupiedIds.has(r.id)).length;
  const reserved = count('RESERVED'), maintenance = count('MAINTENANCE'), cleaning = count('CLEANING'), available = count('AVAILABLE');
  const revenue = n(roomRev);

  const types = new Map<string, { roomType: string; total: number; occupied: number; available: number }>();
  for (const r of rooms) {
    const t = types.get(r.roomType.name) ?? { roomType: r.roomType.name, total: 0, occupied: 0, available: 0 };
    t.total++;
    if (occupiedIds.has(r.id)) t.occupied++;
    else if (r.status === 'AVAILABLE') t.available++;
    types.set(r.roomType.name, t);
  }
  const typeRows = [...types.values()].map((t) => ({ ...t, occupancy: pct(t.occupied, t.total), revenue: r2(byType.get(t.roomType) ?? 0) }));

  res.json({
    date: day,
    stats: { occupancyRate: pct(occupied, total), adr: occupied ? r2(revenue / occupied) : 0, revPar: total ? r2(revenue / total) : 0, roomRevenue: r2(revenue) },
    roomStatus: [
      { status: 'Occupied', count: occupied, percentage: pct(occupied, total) },
      { status: 'Available', count: available, percentage: pct(available, total) },
      { status: 'Reserved', count: reserved, percentage: pct(reserved, total) },
      { status: 'Maintenance', count: maintenance, percentage: pct(maintenance, total) },
      // Not shown in the original video, but needed for the rows to add up to the total.
      { status: 'Cleaning', count: cleaning, percentage: pct(cleaning, total) },
    ],
    totalRooms: total,
    roomTypes: typeRows,
    revenueByRoomType: typeRows.map((t) => ({
      roomType: t.roomType, occupiedRooms: t.occupied, totalRevenue: t.revenue,
      averageRate: t.occupied ? r2(t.revenue / t.occupied) : 0, revenueContribution: pct(t.revenue, revenue),
    })),
    revenueTotals: { occupiedRooms: occupied, totalRevenue: r2(revenue), averageRate: occupied ? r2(revenue / occupied) : 0 },
  });
}));

// ───────────── Room Status Dashboard ─────────────
reportsExtraRouter.get('/room-status', frontDesk, asyncHandler(async (_req, res) => {
  const rooms = await prisma.room.findMany({
    include: { roomType: true, stays: { where: { status: 'CHECKED_IN' }, include: { guest: true }, take: 1 } },
    orderBy: { number: 'asc' },
  });
  const rows = rooms.map((r) => {
    const stay = r.stays[0];
    return {
      id: r.id, number: r.number, floor: r.floor ?? (Number.parseInt(r.number.charAt(0), 10) || 1),
      type: r.roomType.name, status: r.status, rate: rateOf(r),
      guestName: stay ? fullName(stay.guest) : null, stayId: stay?.id ?? null, guestId: stay?.guestId ?? null,
      checkInAt: stay?.checkInAt ?? null, expectedDeparture: stay?.expectedDeparture ?? null,
    };
  });
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  res.json({
    counts: { occupied: c('OCCUPIED'), available: c('AVAILABLE'), reserved: c('RESERVED'), maintenance: c('MAINTENANCE'), cleaning: c('CLEANING') },
    rooms: rows,
  });
}));

// ───────────── Arrival / Departure Schedule ─────────────
reportsExtraRouter.get('/arrival-departure', frontDesk, asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateOpt }), req.query);
  const day = date ?? ymd(new Date());
  const { start, end } = bounds(day);
  const dayOver = end.getTime() <= Date.now();

  const [reservations, departing, checkedOutToday, extended] = await Promise.all([
    prisma.reservation.findMany({ where: { arrival: { gte: start, lt: end }, status: { not: 'CANCELLED' } }, include: { guest: true, room: true }, orderBy: { arrival: 'asc' } }),
    prisma.stay.findMany({ where: { status: 'CHECKED_IN', expectedDeparture: { gte: start, lt: end } }, include: { guest: true, room: true, folio: { select: { id: true } } }, orderBy: { expectedDeparture: 'asc' } }),
    prisma.stay.findMany({ where: { checkOutAt: { gte: start, lt: end } }, include: { guest: true, room: true } }),
    prisma.stay.findMany({ where: { status: 'CHECKED_IN', extensions: { some: {} } }, include: { guest: true, room: true, extensions: { select: { nights: true } } }, orderBy: { expectedDeparture: 'asc' } }),
  ]);

  const folioIds = departing.map((s) => s.folio?.id).filter((x): x is string => !!x);
  const sums = folioIds.length
    ? await prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folioId: { in: folioIds } }, _sum: { bill: true, payment: true } })
    : [];
  const due = new Map(sums.map((s) => [s.folioId, n(s._sum.bill) - n(s._sum.payment)]));

  const isNoShow = (r: (typeof reservations)[number]) => r.status === 'NO_SHOW' || (dayOver && (r.status === 'PENDING' || r.status === 'CONFIRMED'));
  const arrivals = reservations.filter((r) => !isNoShow(r));
  const noShows = reservations.filter(isNoShow);

  const early = checkedOutToday.filter((s) => s.checkOutAt && s.checkOutAt < bounds(ymd(s.expectedDeparture)).start);

  const out = {
    date: day,
    stats: { arrivals: arrivals.length, departures: departing.length, earlyCheckouts: early.length, noShows: noShows.length },
    arrivals: arrivals.map((r) => ({ id: r.id, reservationNumber: r.reservationNumber, guestName: fullName(r.guest), room: r.room.number, expectedCheckIn: r.arrival, nights: nightsBetween(r.arrival, r.departure), status: r.status })),
    departures: departing.map((s) => ({ stayId: s.id, guestId: s.guestId, guestName: fullName(s.guest), room: s.room.number, expectedCheckOut: s.expectedDeparture, nightsStayed: nightsBetween(s.checkInAt, new Date()), balanceDue: r2(s.folio ? due.get(s.folio.id) ?? 0 : 0) })),
    earlyCheckouts: early.map((s) => ({
      stayId: s.id, guestName: fullName(s.guest), room: s.room.number, actualCheckOut: s.checkOutAt, expectedCheckOut: s.expectedDeparture,
      earlyByDays: Math.max(1, Math.round((s.expectedDeparture.getTime() - s.checkOutAt!.getTime()) / DAY)),
    })),
    noShows: noShows.map((r) => ({ id: r.id, reservationNumber: r.reservationNumber, guestName: fullName(r.guest), room: r.room.number, expectedCheckIn: r.arrival, contact: r.guest.phone })),
    // "Extended by" is the nights added through extensions (the original showed a raw negative float).
    extendedStays: extended.map((s) => ({
      stayId: s.id, guestId: s.guestId, guestName: fullName(s.guest), room: s.room.number, expectedCheckOut: s.expectedDeparture,
      extendedNights: s.extensions.reduce((t, e) => t + e.nights, 0),
      overdueDays: Math.max(0, Math.floor((Date.now() - s.expectedDeparture.getTime()) / DAY)),
    })),
  };
  res.json(out);
}));

// ───────────── Room Type Distribution & Performance ─────────────
reportsExtraRouter.get('/room-type-performance', frontDesk, asyncHandler(async (req, res) => {
  const r = rangeFrom(parse(rangeQuery, req.query));
  const horizon = new Date(r.end.getTime() + 30 * DAY);

  const [rooms, occupiedIds, stays, revenueByType, bookings] = await Promise.all([
    prisma.room.findMany({ include: { roomType: true } }),
    occupiedRoomIds(r.end),
    prisma.stay.findMany({
      where: { checkInAt: { lt: r.end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: r.start } }] },
      select: { checkInAt: true, checkOutAt: true, expectedDeparture: true, room: { select: { roomType: { select: { name: true } } } } },
    }),
    roomRevenueByType(r.start, r.end),
    prisma.reservation.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, arrival: { lt: horizon }, departure: { gt: r.end } },
      select: { roomId: true, room: { select: { roomType: { select: { name: true } } } } },
    }),
  ]);

  const nightsSold = new Map<string, number>();
  for (const s of stays) {
    const name = s.room.roomType.name;
    nightsSold.set(name, (nightsSold.get(name) ?? 0) + overlapNights(s.checkInAt, s.checkOutAt ?? s.expectedDeparture, r.start, r.end));
  }

  const types = new Map<string, { roomType: string; total: number; occupied: number; available: number; rateSum: number }>();
  for (const room of rooms) {
    const t = types.get(room.roomType.name) ?? { roomType: room.roomType.name, total: 0, occupied: 0, available: 0, rateSum: 0 };
    t.total++; t.rateSum += rateOf(room);
    if (occupiedIds.has(room.id)) t.occupied++; else if (room.status === 'AVAILABLE') t.available++;
    types.set(room.roomType.name, t);
  }
  const list = [...types.values()];
  const totalRooms = rooms.length;
  const totalRevenue = [...revenueByType.values()].reduce((a, b) => a + b, 0);
  const totalNights = [...nightsSold.values()].reduce((a, b) => a + b, 0);

  res.json({
    range: { start: r.startStr, end: r.endStr },
    inventory: list.map((t) => ({ roomType: t.roomType, totalRooms: t.total, occupied: t.occupied, available: t.available, occupancyRate: pct(t.occupied, t.total), averageRate: r2(t.rateSum / t.total) })),
    inventoryTotal: {
      totalRooms, occupied: occupiedIds.size, available: list.reduce((a, t) => a + t.available, 0),
      occupancyRate: pct(occupiedIds.size, totalRooms), averageRate: totalRooms ? r2(list.reduce((a, t) => a + t.rateSum, 0) / totalRooms) : 0,
    },
    metrics: list.map((t) => {
      const rev = revenueByType.get(t.roomType) ?? 0, nights = nightsSold.get(t.roomType) ?? 0;
      return { roomType: t.roomType, nightsSold: nights, totalRevenue: r2(rev), adr: nights ? r2(rev / nights) : 0, revPar: t.total ? r2(rev / (t.total * r.days)) : 0, revenueContribution: pct(rev, totalRevenue) };
    }),
    metricsTotal: { nightsSold: totalNights, totalRevenue: r2(totalRevenue), adr: totalNights ? r2(totalRevenue / totalNights) : 0, revPar: totalRooms ? r2(totalRevenue / (totalRooms * r.days)) : 0, revenueContribution: 100 },
    forecast: list.map((t) => {
      const mine = bookings.filter((b) => b.room.roomType.name === t.roomType);
      const unique = new Set(mine.map((b) => b.roomId)).size;
      return { roomType: t.roomType, totalBookings: mine.length, uniqueRoomsBooked: unique, bookingRate: pct(unique, t.total), availableRooms: Math.max(0, t.total - unique) };
    }),
  });
}));

// ───────────── Guest Movement Report ─────────────
reportsExtraRouter.get('/guest-movement', frontDesk, asyncHandler(async (req, res) => {
  const r = rangeFrom(parse(rangeQuery, req.query), 3);
  const include = { guest: true, room: true } as const;
  const [ins, outs] = await Promise.all([
    prisma.stay.findMany({ where: { checkInAt: { gte: r.start, lt: r.end } }, include, orderBy: { checkInAt: 'asc' } }),
    prisma.stay.findMany({ where: { checkOutAt: { gte: r.start, lt: r.end } }, include, orderBy: { checkOutAt: 'asc' } }),
  ]);

  const timeline = (stays: typeof ins, at: (s: (typeof ins)[number]) => Date) => {
    const m = new Map<string, { date: string; count: number; guests: { name: string | null; room: string; time: Date }[] }>();
    for (const s of stays) {
      const t = at(s), key = ymd(t);
      const d = m.get(key) ?? { date: key, count: 0, guests: [] };
      d.count++; d.guests.push({ name: fullName(s.guest), room: s.room.number, time: t });
      m.set(key, d);
    }
    return [...m.values()];
  };

  // Whole nights, never fractions (the original showed values like 178.7754...).
  const durations = outs.map((s) => ({ guestName: fullName(s.guest), checkIn: s.checkInAt, checkOut: s.checkOutAt!, nights: nightsBetween(s.checkInAt, s.checkOutAt!) }));
  const totalNights = durations.reduce((t, d) => t + d.nights, 0);

  const guests = new Map<string, string>();
  for (const s of [...ins, ...outs]) guests.set(s.guestId, s.guest.nationality?.trim() || 'Not Specified');
  const nat = new Map<string, number>();
  for (const v of guests.values()) nat.set(v, (nat.get(v) ?? 0) + 1);

  res.json({
    range: { start: r.startStr, end: r.endStr },
    stats: { totalCheckIns: ins.length, totalCheckOuts: outs.length, completedStays: outs.length, nationalities: nat.size },
    checkIns: timeline(ins, (s) => s.checkInAt),
    checkOuts: timeline(outs, (s) => s.checkOutAt!),
    stayDurations: durations,
    nationalities: [...nat.entries()].map(([nationality, count]) => ({ nationality, guests: count, percentage: pct(count, guests.size) })),
    nationalityTotal: guests.size,
    durationStats: {
      average: durations.length ? Math.round((totalNights / durations.length) * 10) / 10 : 0,
      longest: durations.length ? Math.max(...durations.map((d) => d.nights)) : 0,
      shortest: durations.length ? Math.min(...durations.map((d) => d.nights)) : 0,
      totalRoomNights: totalNights,
    },
  });
}));

// ───────────── Group Performance Report ─────────────
reportsExtraRouter.get('/group-performance', finance, asyncHandler(async (req, res) => {
  const r = rangeFrom(parse(rangeQuery, req.query));

  const [groups, byGroup, totals, members, groupStays, bookings] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.$queryRaw<{ groupId: string; revenue: Prisma.Decimal }[]>`
      SELECT f."groupId" AS "groupId", COALESCE(SUM(t."bill"), 0) AS revenue
      FROM "FolioTransaction" t JOIN "Folio" f ON f."id" = t."folioId"
      WHERE t."type" = 'DEBIT_GROUP' AND f."groupId" IS NOT NULL
        AND t."createdAt" >= ${r.start} AND t."createdAt" < ${r.end}
      GROUP BY f."groupId"`,
    prisma.folioTransaction.groupBy({ by: ['type'], where: { type: { in: ['DEBIT_GROUP', 'DEBIT_PERSONAL'] }, createdAt: { gte: r.start, lt: r.end } }, _sum: { bill: true } }),
    prisma.stay.groupBy({ by: ['groupId'], where: { groupId: { not: null } }, _count: { _all: true } }),
    prisma.stay.findMany({
      where: { groupId: { not: null }, checkInAt: { lt: r.end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: r.start } }] },
      select: { groupId: true, roomId: true, checkInAt: true, checkOutAt: true, expectedDeparture: true },
    }),
    prisma.reservation.groupBy({ by: ['groupId'], where: { groupId: { not: null }, arrival: { gte: r.start, lt: r.end } }, _count: { _all: true } }),
  ]);

  const groupRevenue = n(totals.find((t) => t.type === 'DEBIT_GROUP')?._sum.bill);
  const individualRevenue = n(totals.find((t) => t.type === 'DEBIT_PERSONAL')?._sum.bill);
  const revOf = new Map(byGroup.map((g) => [g.groupId, n(g.revenue)]));
  const memberOf = new Map(members.map((m) => [m.groupId!, m._count._all]));
  const bookingOf = new Map(bookings.map((b) => [b.groupId!, b._count._all]));

  const rows = groups.map((g) => {
    const revenue = revOf.get(g.id) ?? 0, memberCount = memberOf.get(g.id) ?? 0;
    const mine = groupStays.filter((s) => s.groupId === g.id);
    const memberNights = mine.reduce((t, s) => t + overlapNights(s.checkInAt, s.checkOutAt ?? s.expectedDeparture, r.start, r.end), 0);
    const roomCount = new Set(mine.map((s) => s.roomId)).size;
    return {
      id: g.id, name: g.name, totalRevenue: r2(revenue), memberCount,
      averagePerMember: memberCount ? r2(revenue / memberCount) : 0,
      revenuePerMemberNight: memberNights ? r2(revenue / memberNights) : 0,
      bookingCount: bookingOf.get(g.id) ?? 0, totalRooms: roomCount,
      averageStayDays: mine.length ? Math.round((mine.reduce((t, s) => t + nightsBetween(s.checkInAt, s.checkOutAt ?? s.expectedDeparture), 0) / mine.length) * 10) / 10 : 0,
      roomUtilization: roomCount ? Math.min(100, pct(memberNights, roomCount * r.days)) : 0,
    };
  });

  const totalMembers = rows.reduce((t, g) => t + g.memberCount, 0);
  const activeGroups = rows.filter((g) => g.memberCount > 0).length;
  const avg = (f: (g: (typeof rows)[number]) => number) => (rows.length ? r2(rows.reduce((t, g) => t + f(g), 0) / rows.length) : 0);

  res.json({
    range: { start: r.startStr, end: r.endStr },
    stats: {
      groupRevenue: r2(groupRevenue), individualRevenue: r2(individualRevenue),
      groupRevenueShare: pct(groupRevenue, groupRevenue + individualRevenue),
      avgGroupSpend: activeGroups ? r2(groupRevenue / activeGroups) : 0,
      avgPerMember: totalMembers ? r2(groupRevenue / totalMembers) : 0,
    },
    folioAnalysis: rows.map(({ id, name, totalRevenue, memberCount, averagePerMember, revenuePerMemberNight }) => ({ id, name, totalRevenue, memberCount, averagePerMember, revenuePerMemberNight })),
    folioAverage: { totalRevenue: avg((g) => g.totalRevenue), memberCount: rows.length ? Math.round((totalMembers / rows.length) * 10) / 10 : 0, averagePerMember: avg((g) => g.averagePerMember), revenuePerMemberNight: avg((g) => g.revenuePerMemberNight) },
    bookingPatterns: rows.filter((g) => g.bookingCount > 0 || g.totalRooms > 0).map(({ name, bookingCount, totalRooms, averageStayDays, roomUtilization }) => ({ name, bookingCount, totalRooms, averageStayDays, roomUtilization })),
  });
}));

// ───────────── Housekeeping Status Report ─────────────
reportsExtraRouter.get('/housekeeping-status', housekeepingView, asyncHandler(async (_req, res) => {
  const todayStart = bounds(ymd(new Date())).start;
  const OPEN = ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION'] as const;

  const [rooms, open, latest, inspectedToday, tickets, recent] = await Promise.all([
    prisma.room.findMany({ include: { roomType: true, stays: { where: { status: 'CHECKED_IN' }, include: { guest: true }, take: 1 } }, orderBy: { number: 'asc' } }),
    prisma.housekeepingTask.findMany({ where: { status: { in: [...OPEN] } }, select: { roomId: true, status: true } }),
    prisma.housekeepingTask.groupBy({ by: ['roomId'], _max: { createdAt: true, startedAt: true, finishedAt: true, inspectedAt: true } }),
    prisma.housekeepingTask.count({ where: { status: 'DONE', inspectedAt: { gte: todayStart } } }),
    prisma.maintenanceTicket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, include: { room: { include: { roomType: true } }, reportedBy: { select: { fullName: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.housekeepingTask.findMany({ where: { status: 'DONE' }, include: { room: { include: { roomType: true } }, assignedTo: { select: { fullName: true, username: true } } }, orderBy: { finishedAt: 'desc' }, take: 15 }),
  ]);

  const openOf = new Map<string, string>();
  for (const t of open) openOf.set(t.roomId, t.status === 'PENDING' ? 'PENDING' : openOf.get(t.roomId) === 'IN_PROGRESS' ? 'IN_PROGRESS' : t.status);
  const lastOf = new Map(latest.map((l) => [l.roomId, [l._max.createdAt, l._max.startedAt, l._max.finishedAt, l._max.inspectedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null]));

  const cleaningStatus = (roomId: string, roomStatus: string) => {
    const t = openOf.get(roomId);
    if (t === 'IN_PROGRESS') return 'IN_PROGRESS';
    if (t === 'READY_FOR_INSPECTION') return 'AWAITING_INSPECTION';
    if (t === 'PENDING' || roomStatus === 'CLEANING') return 'DIRTY';
    return 'CLEAN';
  };

  const rows = rooms.map((rm) => ({
    roomId: rm.id, number: rm.number, roomType: rm.roomType.name, roomStatus: rm.status,
    cleaningStatus: cleaningStatus(rm.id, rm.status), guestName: rm.stays[0] ? fullName(rm.stays[0].guest) : null, lastUpdated: lastOf.get(rm.id) ?? null,
  }));
  const count = (s: string) => rows.filter((x) => x.cleaningStatus === s).length;
  const clean = count('CLEAN');

  res.json({
    stats: { cleanAndReady: clean, dirty: count('DIRTY'), inProgress: count('IN_PROGRESS') + count('AWAITING_INSPECTION'), inspected: inspectedToday },
    rooms: rows,
    maintenance: tickets.map((t) => ({ id: t.id, ticketNo: t.ticketNo, room: t.room?.number ?? null, roomType: t.room?.roomType.name ?? null, issueType: t.category, title: t.title, reportedBy: t.reportedByName ?? userName(t.reportedBy), reportedAt: t.createdAt, status: t.status })),
    recentlyCleaned: recent.map((t) => ({ id: t.id, room: t.room.number, roomType: t.room.roomType.name, cleaningStatus: 'CLEAN', cleanedBy: userName(t.assignedTo) ?? 'Housekeeping Staff', lastUpdated: t.finishedAt ?? t.createdAt, roomStatus: t.room.status })),
    progress: { totalRooms: rooms.length, completionRate: pct(clean, rooms.length), pendingMaintenance: tickets.length },
  });
}));

// ───────────── All Shifts Combined Report ─────────────
const COMBINED_SHIFTS = [
  { key: 'MORNING', name: 'Morning Shift', from: 7, to: 14, label: '7:00 - 14:00', color: 'blue' },
  { key: 'AFTERNOON', name: 'Afternoon Shift', from: 14, to: 22, label: '14:00 - 22:00', color: 'purple' },
  { key: 'NIGHT', name: 'Night Shift', from: 22, to: 31, label: '22:00 - 7:00', color: 'green' },
] as const;

reportsExtraRouter.get('/shifts/combined', requireRole('RECEPTIONIST', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const q = parse(z.object({ date: dateOpt, shift: z.preprocess(blank, z.enum(['MORNING', 'AFTERNOON', 'NIGHT']).optional()) }), req.query);
  const date = q.date ?? ymd(new Date());
  const dayStart = bounds(date).start;
  const picked = COMBINED_SHIFTS.filter((s) => !q.shift || s.key === q.shift);

  const [recentRows, perShift] = await Promise.all([
    prisma.folioTransaction.findMany({ select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3000 }),
    Promise.all(picked.map((s) => prisma.folioTransaction.findMany({
      where: { createdAt: { gte: new Date(dayStart.getTime() + s.from * 3_600_000), lt: new Date(dayStart.getTime() + s.to * 3_600_000) } },
      include: { folio: { include: { guest: true, stay: { include: { room: true, guest: true } } } }, user: { select: { fullName: true, username: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }))),
  ]);

  const recentDates: string[] = [];
  for (const r of recentRows) {
    const k = ymd(r.createdAt);
    if (!recentDates.includes(k)) { recentDates.push(k); if (recentDates.length === 30) break; }
  }

  const shifts = picked.map((s, i) => {
    const txs = perShift[i];
    const billings = txs.reduce((a, t) => a + n(t.bill), 0);
    const payments = txs.reduce((a, t) => a + n(t.payment), 0);
    return {
      key: s.key, name: s.name, label: s.label, color: s.color, date,
      billings: r2(billings), billingCount: txs.filter((t) => n(t.bill) > 0).length,
      payments: r2(payments), paymentCount: txs.filter((t) => n(t.payment) > 0).length,
      collectionRate: billings > 0 ? Math.round((payments / billings) * 1000) / 10 : 0,
      avgTransaction: txs.length ? r2((billings + payments) / txs.length) : 0,
      transactions: txs.length,
      balance: r2(payments - billings),
      rows: txs.map((t) => {
        const g = t.folio.guest ?? t.folio.stay?.guest;
        return { id: t.id, time: t.createdAt, guestName: fullName(g) ?? 'N/A', room: t.folio.stay?.room.number ?? null, description: t.description, method: t.method, bill: n(t.bill), payment: n(t.payment), staff: userName(t.user) };
      }),
    };
  });
  const total = (f: (s: (typeof shifts)[number]) => number) => shifts.reduce((a, s) => a + f(s), 0);

  res.json({
    date, shift: q.shift ?? null, recentDates,
    summary: { transactions: total((s) => s.transactions), billings: r2(total((s) => s.billings)), payments: r2(total((s) => s.payments)), netBalance: r2(total((s) => s.balance)), shifts: shifts.length },
    shifts,
    comparison: { revenue: shifts.map((s) => ({ name: s.name, value: s.billings })), collection: shifts.map((s) => ({ name: s.name, value: s.payments })) },
  });
}));