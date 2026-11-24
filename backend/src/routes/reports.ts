import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, dayRange, HttpError, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { folioBalance } from '../services/folio';
import { openHighCount } from '../services/guard';
import { bounds, ymd } from '../services/period';

import {
  getSalesOverview,
  getDetailedSalesReport,
  getControlSheet,
  getSalesSummaryReport,
  getItemSalesSummary,
  getDetailedSalesSummary,
} from '../services/salesReports';


export const reportsRouter = Router();


reportsRouter.get(
  '/sales-reports/overview',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getSalesOverview(req.query));
  }),
);

reportsRouter.get(
  '/sales-reports/detailed',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getDetailedSalesReport(req.query));
  }),
);

reportsRouter.get(
  '/sales-reports/control-sheet',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getControlSheet(req.query));
  }),
);

reportsRouter.get(
  '/sales-reports/summary',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getSalesSummaryReport(req.query));
  }),
);

reportsRouter.get(
  '/sales-reports/items',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getItemSalesSummary(req.query));
  }),
);

reportsRouter.get(
  '/sales-reports/detailed-summary',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    res.json(await getDetailedSalesSummary(req.query));
  }),
);


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

reportsRouter.get(
  '/complimentary',
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string | undefined>;

    const now = new Date();
    const today = ymd(now);

    const defaultStart = `${today.slice(0, 7)}-01`;
    const startDate = query.start || defaultStart;
    const endDate = query.end || today;

    const validateDate = (value: string, label: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new HttpError(400, `${label} must use YYYY-MM-DD format.`);
      }

      const parsed = new Date(`${value}T00:00:00`);

      if (Number.isNaN(parsed.getTime()) || ymd(parsed) !== value) {
        throw new HttpError(400, `${label} is not a valid date.`);
      }
    };

    validateDate(startDate, 'Start date');
    validateDate(endDate, 'End date');

    if (startDate > endDate) {
      throw new HttpError(400, 'Start date cannot be after end date.');
    }

    const start = bounds(startDate).start;
    const end = bounds(endDate).end;

    const stays = await prisma.stay.findMany({
      where: {
        isComplimentary: true,
        checkInAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        guest: true,
        room: true,
      },
      orderBy: {
        checkInAt: 'asc',
      },
    });

    const references = stays.map((stay) => `STAY:${stay.id}`);

    // The complimentary expense is recorded against account 580000.
    // Include both debit and credit lines so reversal entries reduce
    // the original complimentary value.
    const journalEntries = references.length
      ? await prisma.journalEntry.findMany({
          where: {
            reference: {
              in: references,
            },
          },
          include: {
            lines: {
              include: {
                account: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const valuesByReference = new Map<
      string,
      { value: Prisma.Decimal; found: boolean }
    >();

    for (const entry of journalEntries) {
      if (!entry.reference) continue;

      for (const line of entry.lines) {
        if (line.account.code !== '580000') continue;

        const current = valuesByReference.get(entry.reference) ?? {
          value: D(0),
          found: false,
        };

        current.value = current.value
          .plus(line.debit)
          .minus(line.credit);
        current.found = true;

        valuesByReference.set(entry.reference, current);
      }
    }

    const rows = stays.map((stay) => {
      const reference = `STAY:${stay.id}`;
      const posting = valuesByReference.get(reference);

      return {
        ...stay,
        reference,
        compValue: posting?.found ? posting.value : null,
        valueStatus: posting?.found ? 'POSTED' : 'NOT_POSTED',
      };
    });

    const totalValue = rows.reduce(
      (total, row) =>
        row.compValue === null ? total : total.plus(row.compValue),
      D(0),
    );

    const valuedStays = rows.filter(
      (row) => row.compValue !== null,
    ).length;

    const tally = (
      key: (stay: (typeof stays)[number]) => string,
    ) =>
      Object.entries(
        stays.reduce<Record<string, number>>((counts, stay) => {
          const name = key(stay).trim() || 'Unspecified';
          counts[name] = (counts[name] ?? 0) + 1;
          return counts;
        }, {}),
      )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    res.json({
      // Existing response fields retained for compatibility.
      totalStays: stays.length,
      totalValue,
      averageValue: valuedStays
        ? totalValue.div(valuedStays)
        : D(0),
      byReason: tally((stay) => stay.complimentaryReason ?? ''),
      byAuthorizer: tally((stay) => stay.authorizedBy ?? ''),
      rows,

      // Additional accounting transparency fields.
      valuedStays,
      unpostedCount: stays.length - valuedStays,
      startDate,
      endDate,
    });
  }),
);

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

// ───────────── Easy-Security Report ─────────────
const HIGH_VALUE = 50_000;
const LOOKBACK_DAYS = 30; // high-value table + "without ID" panel look back this far from the end date
const blankToUndef = (v: unknown) => (v === '' ? undefined : v);
const ymdField = z.preprocess(blankToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional());
const easyQuery = z.object({
  start: ymdField,
  end: ymdField,
  guestStatus: z.preprocess(blankToUndef, z.enum(['CHECKED_IN', 'CHECKED_OUT']).optional()),
  securityStatus: z.preprocess(blankToUndef, z.enum(['PENDING', 'VERIFIED', 'FLAGGED']).optional()),
});

securityRouter.get('/easy-report', asyncHandler(async (req, res) => {
  const q = parse(easyQuery, req.query);

  const endDay = q.end ? new Date(`${q.end}T00:00:00`) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const from = q.start ? new Date(`${q.start}T00:00:00`) : (() => { const d = new Date(endDay); d.setDate(d.getDate() - 7); return d; })();
  const to = new Date(endDay);
  to.setHours(23, 59, 59, 999);
  if (from > to) throw new HttpError(400, 'Start date must be on or before end date');

  // A guest is in the report when any of their stays overlaps the range (so long-stay in-house guests are included).
  const overlap: Prisma.StayWhereInput = {
    checkInAt: { lte: to },
    OR: [{ checkOutAt: null }, { checkOutAt: { gte: from } }],
  };
  const and: Prisma.GuestWhereInput[] = [{ stays: { some: overlap } }];
  if (q.guestStatus === 'CHECKED_IN') and.push({ stays: { some: { ...overlap, status: 'CHECKED_IN' } } });
  if (q.guestStatus === 'CHECKED_OUT') and.push({ stays: { none: { status: 'CHECKED_IN' } } });
  if (q.securityStatus) and.push({ securityStatus: q.securityStatus });

  const lookbackFrom = new Date(Math.min(from.getTime(), to.getTime() - LOOKBACK_DAYS * 86_400_000));

  const [guests, noIdGuests, highValue, me] = await Promise.all([
    prisma.guest.findMany({
      where: { AND: and },
      include: {
        stays: {
          where: overlap,
          orderBy: { checkInAt: 'desc' },
          include: { room: true, group: true, folio: { select: { id: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.guest.findMany({
      where: {
        OR: [{ idNumber: null }, { idNumber: '' }],
        stays: { some: { checkInAt: { gte: lookbackFrom, lte: to } } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.folioTransaction.findMany({
      where: { bill: { gte: HIGH_VALUE }, createdAt: { gte: lookbackFrom, lte: to } },
      include: { folio: { include: { guest: true, stay: { include: { guest: true } } } } },
      orderBy: [{ bill: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { fullName: true, username: true } }),
  ]);

  // Transaction count/volume inside the range, and the folio's lifetime balance, in two grouped queries.
  const current = (g: (typeof guests)[number]) => g.stays.find((s) => s.status === 'CHECKED_IN') ?? g.stays[0];
  const folioIds = guests.map((g) => current(g)?.folio?.id).filter((x): x is string => !!x);
  const [inRange, lifetime] = await Promise.all([
    prisma.folioTransaction.groupBy({
      by: ['folioId'],
      where: { folioId: { in: folioIds }, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { bill: true, payment: true },
    }),
    prisma.folioTransaction.groupBy({
      by: ['folioId'],
      where: { folioId: { in: folioIds } },
      _sum: { bill: true, payment: true },
    }),
  ]);
  const rangeBy = new Map(inRange.map((r) => [r.folioId, r]));
  const lifeBy = new Map(lifetime.map((r) => [r.folioId, r]));

  const noId = (g: { idNumber: string | null }) => !g.idNumber?.trim();

  res.json({
    range: { start: from, end: endDay },
    generatedAt: new Date(),
    generatedBy: me?.fullName || me?.username || 'Hotel Admin',
    stats: {
      totalGuests: guests.length,
      currentlyCheckedIn: guests.filter((g) => g.stays.some((s) => s.status === 'CHECKED_IN')).length,
      foreignGuests: guests.filter((g) => g.nationality && !/nigeria/i.test(g.nationality)).length,
      withoutId: guests.filter(noId).length,
    },
    suspicious: {
      guestsWithoutId: noIdGuests.map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}` })),
    },
    highValue: {
      threshold: HIGH_VALUE,
      rows: highValue.map((t) => {
        const g = t.folio.guest ?? t.folio.stay?.guest;
        return {
          id: t.id,
          guestId: g?.id ?? null,
          guestName: g ? `${g.firstName} ${g.lastName}` : 'N/A',
          idNumber: g?.idNumber || 'N/A',
          amount: t.bill,
          description: t.description,
          date: t.createdAt,
          folioNo: t.folio.folioNo,
        };
      }),
    },
    guests: guests.map((g) => {
      const s = current(g);
      const fid = s?.folio?.id;
      const r = fid ? rangeBy.get(fid) : undefined;
      const l = fid ? lifeBy.get(fid) : undefined;
      return {
        id: g.id,
        name: `${g.firstName} ${g.lastName}`,
        phone: g.phone,
        stayStatus: s?.status ?? null,
        stayDate: s ? (s.status === 'CHECKED_IN' ? s.checkInAt : (s.checkOutAt ?? s.checkInAt)) : null,
        room: s?.room.number ?? null,
        group: s?.group?.name ?? null,
        hasId: !noId(g),
        txCount: r?._count._all ?? 0,
        txTotal: D(r?._sum.bill ?? 0).plus(r?._sum.payment ?? 0),
        // payments minus bills, same sign convention as Groups: negative = the guest owes the hotel
        balance: D(l?._sum.payment ?? 0).minus(l?._sum.bill ?? 0),
        securityStatus: g.securityStatus,
        securityNote: g.securityNote,
      };
    }),
  });
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
dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const now = new Date();
  const { start: today, end: tomorrow } = dayRange();

  const role = req.user?.role;

  const canViewFinancial =
    role === 'ADMIN' ||
    role === 'MANAGER' ||
    role === 'ACCOUNTANT';

  const weekStart = new Date(today);

  weekStart.setDate(
    today.getDate() - ((today.getDay() + 6) % 7),
  );

  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  // Operational metrics available to authenticated dashboard users.
  const [
    checkInsToday,
    checkOutsToday,
    rooms,
    occupied,
    inHouseGuests,
  ] = await Promise.all([
    prisma.stay.count({
      where: {
        checkInAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    }),

    prisma.stay.count({
      where: {
        checkOutAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    }),

    prisma.room.count(),

    prisma.room.count({
      where: {
        status: 'OCCUPIED',
      },
    }),

    prisma.stay.count({
      where: {
        status: 'CHECKED_IN',
      },
    }),
  ]);

  const operationalData = {
    checkInsToday,
    checkOutsToday,
    inHouseGuests,
    occupancyRate: rooms
      ? (occupied / rooms) * 100
      : 0,
    occupied,
    totalRooms: rooms,
    updatedAt: now,
  };

  // Do not calculate or return financial information
  // to roles that are not authorized to view it.
  if (!canViewFinancial) {
    return res.json(operationalData);
  }

  const revenue = async (from: Date) => {
    const aggregate = await prisma.journalLine.aggregate({
      where: {
        account: {
          type: 'REVENUE',
        },
        entry: {
          date: {
            gte: from,
          },
        },
      },
      _sum: {
        credit: true,
        debit: true,
      },
    });

    return D(aggregate._sum.credit ?? 0).minus(
      D(aggregate._sum.debit ?? 0),
    );
  };

  const [
    dayRevenue,
    weekRevenue,
    monthRevenue,
    expenseAggregate,
    inHouseFolios,
    cityTransactions,
    cityPayments,
    unpaidOrders,
  ] = await Promise.all([
    revenue(today),
    revenue(weekStart),
    revenue(monthStart),

    prisma.journalLine.aggregate({
      where: {
        account: {
          type: 'EXPENSE',
        },
        entry: {
          date: {
            gte: monthStart,
          },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    }),

    prisma.folio.findMany({
      where: {
        stay: {
          status: 'CHECKED_IN',
        },
      },
      select: {
        id: true,
      },
    }),

    prisma.folioTransaction.aggregate({
      where: {
        type: 'DEBIT_GROUP',
      },
      _sum: {
        bill: true,
      },
    }),

    prisma.folioTransaction.aggregate({
      where: {
        folio: {
          groupId: {
            not: null,
          },
        },
        type: 'CREDIT',
      },
      _sum: {
        payment: true,
      },
    }),

    prisma.order.aggregate({
      where: {
        paymentStatus: 'UNPAID',
      },
      _sum: {
        total: true,
      },
    }),
  ]);

  let inHouseOutstanding = D(0);

  for (const folio of inHouseFolios) {
    inHouseOutstanding = inHouseOutstanding.plus(
      await folioBalance(folio.id),
    );
  }

  const cityLedgerOutstanding = D(
    cityTransactions._sum.bill ?? 0,
  )
    .minus(cityPayments._sum.payment ?? 0)
    .plus(unpaidOrders._sum.total ?? 0);

  const expenses = D(
    expenseAggregate._sum.debit ?? 0,
  ).minus(
    D(expenseAggregate._sum.credit ?? 0),
  );

  const profitMargin = monthRevenue.gt(0)
    ? monthRevenue.minus(expenses)
        .div(monthRevenue)
        .times(100)
    : D(0);

  return res.json({
    ...operationalData,

    todayRevenue: dayRevenue,
    weekRevenue,
    monthRevenue,

    profitMargin,
    grossProfit: monthRevenue.minus(expenses),

    inHouseOutstanding,
    cityLedgerOutstanding,
  });
}));
dashboardRouter.get('/notifications', asyncHandler(async (req, res) => {
  const role = req.user?.role ?? '';

  const canViewFrontDeskAlerts = [
    'ADMIN',
    'MANAGER',
    'RECEPTIONIST',
  ].includes(role);

  const canViewPosAlerts = [
    'ADMIN',
    'MANAGER',
    'WAITER',
    'ACCOUNTANT',
  ].includes(role);

  const canViewStockAlerts = [
    'ADMIN',
    'MANAGER',
    'STOREKEEPER',
    'CHEF',
  ].includes(role);

  const canViewAdjustmentAlerts = [
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
    'STOREKEEPER',
  ].includes(role);

  const canViewGuardAlerts = [
    'ADMIN',
    'MANAGER',
  ].includes(role);

  const [
    overdue,
    unpaid,
    pendingAdjustments,
    lowStock,
    guardHigh,
  ] = await Promise.all([
    canViewFrontDeskAlerts
      ? prisma.stay.count({
          where: {
            status: 'CHECKED_IN',
            expectedDeparture: {
              lt: new Date(),
            },
          },
        })
      : 0,

    canViewPosAlerts
      ? prisma.order.count({
          where: {
            paymentStatus: 'UNPAID',
          },
        })
      : 0,

    canViewAdjustmentAlerts
      ? prisma.stockAdjustment.count({
          where: {
            status: 'PENDING',
          },
        })
      : 0,

    canViewStockAlerts
      ? prisma.$queryRaw<{ c: bigint }[]>`
          SELECT COUNT(*)::bigint AS c
          FROM "InventoryItem"
          WHERE "isActive" = true
          AND "quantity" <= "minLevel"
        `
      : [],

    canViewGuardAlerts
      ? openHighCount().catch(() => 0)
      : 0,
  ]);

  const low = Number(lowStock[0]?.c ?? 0);

  res.json({
    total:
      overdue +
      unpaid +
      pendingAdjustments +
      low +
      guardHigh,

    overdueCheckouts: overdue,
    unpaidBills: unpaid,
    pendingAdjustments,
    lowStock: low,
    guardHigh,
  });
}));