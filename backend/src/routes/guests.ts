import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, clientIp, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { checkIn, checkOut, extendStay, runAutoExtension } from '../services/stays';
import { folioBalance, postFolioPayment } from '../services/folio';
import { consentData } from '../messaging/consent';
import { onCheckedOut } from '../messaging/triggers';
import { assertNotBlacklisted } from '../services/crm';
import { HttpError } from '../lib/http';            // merge with the existing lib/http import
import { audit } from '../lib/audit';
import { renderRegistrationCard } from '../pdf/registrationCardPdf';



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

/**
 * Complete guest stay and folio history.
 * Financial history is restricted to roles with existing folio/report access.
 */
guestsRouter.get(
  '/:id/history',
  requireRole('MANAGER', 'RECEPTIONIST', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: {
        stays: {
          orderBy: {
            checkInAt: 'desc',
          },
          include: {
            room: {
              select: {
                number: true,
              },
            },
            group: {
              select: {
                name: true,
              },
            },
            folio: {
              select: {
                id: true,
                folioNo: true,
                status: true,
                txs: {
                  select: {
                    bill: true,
                    payment: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!guest) {
      throw new HttpError(404, 'Guest not found');
    }

    const stays = guest.stays.map((stay) => {
      const folioBalance = stay.folio
        ? stay.folio.txs.reduce(
            (balance, transaction) =>
              balance +
              Number(transaction.bill ?? 0) -
              Number(transaction.payment ?? 0),
            0,
          )
        : 0;

      return {
        id: stay.id,
        room: stay.room?.number ?? '—',
        checkInAt: stay.checkInAt,
        checkOutAt: stay.checkOutAt,
        expectedDeparture: stay.expectedDeparture,
        numGuests: stay.numGuests,
        specialRequests: stay.specialRequests,
        status: stay.status,
        group: stay.group?.name ?? null,
        folioId: stay.folio?.id ?? null,
        folioNo: stay.folio?.folioNo ?? null,

        // Guest History displays the inverse of the accounting balance.
        balance: -folioBalance,
      };
    });



    const totalBalance = stays.reduce(
      (total, stay) => total + stay.balance,
      0,
    );

    const currentStatus = stays.some(
      (stay) => stay.status === 'CHECKED_IN',
    )
      ? 'CHECKED_IN'
      : 'CHECKED_OUT';

    const memberOfGroup =
      stays.find((stay) => stay.group)?.group ?? null;

    res.json({
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone,
        address: guest.address,
      },
      statistics: {
        totalStays: stays.length,
        currentStatus,
        memberOfGroup,
        totalBalance,
      },
      stays,
      recentCheckIns: stays,
    });
  }),
);

/** Guest detail page. */
guestsRouter.get('/:id', asyncHandler(async (req, res) => {
  const g = await prisma.guest.findUniqueOrThrow({ where: { id: req.params.id }, include: { stays: { orderBy: { checkInAt: 'desc' }, include: { room: true, group: true, folio: { include: { txs: { orderBy: { createdAt: 'desc' }, take: 10 } } } } } } });
  const cur = g.stays[0];
  res.json({ ...g, groupStatus: cur?.group ? 'Group' : 'Individual', checkInStatus: cur?.status ?? 'NEVER', recentTransactions: cur?.folio?.txs ?? [] });
}));
guestsRouter.put('/:id', fd, asyncHandler(async (req, res) => res.json(await prisma.guest.update({ where: { id: req.params.id }, data: consentData(parse(guestBody.partial(), req.body)) }))));

// ───────────── Groups ─────────────
export const groupsRouter = Router();
const finRead = requireRole('MANAGER', 'RECEPTIONIST', 'ACCOUNTANT');

const groupBody = z.object({
  name: z.string().trim().min(1, 'Group name is required'),
  contact: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().optional(),
});
const orNull = (v?: string) => (v ? v : null);
const groupData = (b: z.infer<typeof groupBody>) => ({
  name: b.name, contact: orNull(b.contact), phone: orNull(b.phone), email: orNull(b.email), notes: orNull(b.notes),
});
const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Payments minus bills on group-billed transactions. Negative = the group owes the hotel. */
async function groupBalance(db: Prisma.TransactionClient, groupId: string) {
  const a = await db.folioTransaction.aggregate({
    where: { folio: { groupId } },
    _sum: { bill: true, payment: true },
  });
  return D(a._sum.payment ?? 0).minus(a._sum.bill ?? 0);
}

/** LIST: Groups Management table (still an array with id + name, so the check-in dropdown keeps working). */
groupsRouter.get('/', asyncHandler(async (_q, res) => {
  const [groups, balances, members] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: 'asc' } }),
    prisma.$queryRaw<{ groupId: string; balance: Prisma.Decimal }[]>`
      SELECT f."groupId", COALESCE(SUM(t."payment" - t."bill"), 0) AS balance
      FROM "FolioTransaction" t JOIN "Folio" f ON f.id = t."folioId"
      WHERE f."groupId" IS NOT NULL AND t."type" IN ('DEBIT_GROUP', 'CREDIT')
      GROUP BY f."groupId"`,
    prisma.stay.groupBy({ by: ['groupId'], where: { status: 'CHECKED_IN', groupId: { not: null } }, _count: { _all: true } }),
  ]);
  const bal = new Map(balances.map((b) => [b.groupId, b.balance]));
  const cnt = new Map(members.map((m) => [m.groupId!, m._count._all]));
  res.json(groups.map((g) => {
    const n = cnt.get(g.id) ?? 0;
    return { ...g, members: n, status: n > 0 ? 'CHECKED_IN' : 'NOT_CHECKED_IN', balance: bal.get(g.id) ?? D(0) };
  }));
}));

/** CREATE */
groupsRouter.post('/', fd, asyncHandler(async (req, res) => {
  const b = parse(groupBody, req.body);
  try { res.status(201).json(await prisma.group.create({ data: groupData(b) })); }
  catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'A group with this name already exists'); throw e; }
}));

/** EDIT */
groupsRouter.put('/:id', fd, asyncHandler(async (req, res) => {
  const b = parse(groupBody, req.body);
  try { res.json(await prisma.group.update({ where: { id: req.params.id }, data: groupData(b) })); }
  catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'A group with this name already exists'); throw e; }
}));

/** DELETE: only a group with no history at all. */
groupsRouter.delete('/:id', requireRole(), asyncHandler(async (req, res) => {
  const id = req.params.id;
  // Serializable so a check-in can't attach a stay between the checks and the delete.
  const name = await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id } });
    if (!group) throw new HttpError(404, 'Group not found');
    const [stays, folios, orders, reservations, events] = await Promise.all([
      tx.stay.count({ where: { groupId: id } }),
      tx.folio.count({ where: { groupId: id } }),
      tx.order.count({ where: { groupId: id } }),
      tx.reservation.count({ where: { groupId: id } }),
      tx.eventBooking.count({ where: { groupId: id } }),
    ]);
    const used = [
      stays && `${stays} stay(s)`, folios && `${folios} folio(s)`, orders && `${orders} order(s)`,
      reservations && `${reservations} reservation(s)`, events && `${events} event(s)`,
    ].filter(Boolean);
    if (used.length) throw new HttpError(409, `Cannot delete "${group.name}": it has ${used.join(', ')}. Groups with history are kept for the records.`);
    await tx.group.delete({ where: { id } });
    return group.name;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await audit(prisma, { userId: req.user!.id, action: 'GROUP_DELETED', entity: 'Group', entityId: id, ip: clientIp(req), meta: { name } });
  res.json({ ok: true });
}));

/** DETAIL: header, members, transactions with running balance, print totals. */
groupsRouter.get('/:id', finRead, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const group = await prisma.group.findUniqueOrThrow({ where: { id } });
  const [stays, txs] = await Promise.all([
    prisma.stay.findMany({ where: { groupId: id, status: 'CHECKED_IN' }, include: { guest: true, room: true, folio: true } }),
    prisma.folioTransaction.findMany({
      where: { type: { in: ['DEBIT_GROUP', 'CREDIT'] }, folio: { groupId: id } },
      include: { folio: { include: { guest: true } }, salesPoint: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  let run = D(0), debits = D(0), credits = D(0);
  const transactions = txs.map((t) => {
    run = run.plus(t.payment).minus(t.bill);
    debits = debits.plus(t.bill);
    credits = credits.plus(t.payment);
    const g = t.folio.guest;
    return {
      id: t.id, date: t.createdAt, guestName: g ? `${g.firstName} ${g.lastName}` : null, // null shows "N/A"
      description: t.description, source: t.salesPoint?.name ?? 'Frontdesk',
      type: t.type === 'CREDIT' ? 'Credit' : 'Debit', bill: t.bill, payment: t.payment, balance: run,
    };
  });

  const members = await Promise.all(stays.map(async (s) => ({
    stayId: s.id, name: `${s.guest.firstName} ${s.guest.lastName}`, phone: s.guest.phone, room: s.room.number,
    balance: s.folio ? D(0).minus(await folioBalance(s.folio.id)) : D(0),
  })));

  res.json({
    group, balance: run, status: stays.length ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
    members, transactions, totals: { debits, credits, balance: run },
  });
}));

/** "Add Checked-in Guests to Group": searchable in-house guests who aren't in a group yet. */
groupsRouter.get('/:id/available-guests', finRead, asyncHandler(async (req, res) => {
  const q = String(req.query.search ?? '').trim();
  const stays = await prisma.stay.findMany({
    where: {
      status: 'CHECKED_IN', groupId: null,
      ...(q ? { OR: [
        { guest: { firstName: { contains: q, mode: 'insensitive' } } },
        { guest: { lastName: { contains: q, mode: 'insensitive' } } },
        { guest: { phone: { contains: q } } },
        { room: { number: { contains: q } } },
      ] } : {}),
    },
    include: { guest: true, room: true }, orderBy: { checkInAt: 'desc' }, take: 50,
  });
  res.json(stays.map((s) => ({ stayId: s.id, name: `${s.guest.firstName} ${s.guest.lastName}`, phone: s.guest.phone, room: s.room.number })));
}));

/** ADD MEMBER */
groupsRouter.post('/:id/members', fd, asyncHandler(async (req, res) => {
  const { stayId } = parse(z.object({ stayId: z.string().min(1) }), req.body);
  await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw new HttpError(404, 'Group not found');
    const stay = await tx.stay.findUnique({ where: { id: stayId } });
    if (!stay || stay.status !== 'CHECKED_IN') throw new HttpError(400, 'Guest is not currently checked in');
    if (stay.groupId) throw new HttpError(409, 'Guest already belongs to a group');
    await tx.stay.update({ where: { id: stayId }, data: { groupId: group.id } });
    await tx.folio.updateMany({ where: { stayId }, data: { groupId: group.id } });
  });
  res.status(201).json({ ok: true });
}));

/** REMOVE MEMBER: blocked once any of the guest's charges were billed to the group. */
groupsRouter.delete('/:id/members/:stayId', fd, asyncHandler(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const stay = await tx.stay.findFirst({ where: { id: req.params.stayId, groupId: req.params.id }, include: { folio: true } });
    if (!stay) throw new HttpError(404, 'This guest is not a member of the group');
    if (stay.status !== 'CHECKED_IN') throw new HttpError(409, 'Only checked-in guests can be removed from a group');
    if (stay.folio) {
      const billed = await tx.folioTransaction.count({ where: { folioId: stay.folio.id, type: 'DEBIT_GROUP' } });
      if (billed > 0) throw new HttpError(409, `${billed} charge(s) on this guest's folio were billed to the group, so they cannot be removed.`);
      await tx.folio.update({ where: { id: stay.folio.id }, data: { groupId: null } });
    }
    await tx.stay.update({ where: { id: stay.id }, data: { groupId: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await audit(prisma, { userId: req.user!.id, action: 'GROUP_MEMBER_REMOVED', entity: 'Group', entityId: req.params.id, ip: clientIp(req), meta: { stayId: req.params.stayId } });
  res.json({ ok: true });
}));

/** "Add Payment to Group Account": lands on the group's own account folio. */
/** "Add Payment to Group Account": lands on the group's own account folio. */
groupsRouter.post('/:id/payments', fd, asyncHandler(async (req, res) => {
  const b = parse(z.object({
    amount: z.union([z.string(), z.number()]).transform(String)
      .refine((v) => /^\d+(?:\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Amount must be positive with at most two decimals'),
    method: z.enum(['CASH', 'CARD', 'TRANSFER']),
    description: z.string().trim().min(1, 'Description is required').max(250),
  }), req.body);

  const balance = await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUniqueOrThrow({ where: { id: req.params.id } });
    const folioNo = `GRP-${group.id}`;
    const account = await tx.folio.upsert({
      where: { folioNo }, update: {}, create: { folioNo, groupId: group.id, isGroupAccount: true },
    });

    // ── NEW: replaces the old postFolioPayment call ──
    const label = { CASH: 'Cash', CARD: 'Card', TRANSFER: 'Transfer' }[b.method];
    await postFolioPayment(tx, {
      folioId: account.id, amount: b.amount, method: b.method,
      description: `${b.description} - Payment via ${label}`,
      userId: req.user!.id, groupFolio: true,
    });
    // ─────────────────────────────────────────────────

    return groupBalance(tx, group.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  res.status(201).json({ balance });
}));

/** HISTORY page */
groupsRouter.get('/:id/history', finRead, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { skip, take, page: p } = page(req.query, 10);
  const group = await prisma.group.findUniqueOrThrow({ where: { id } });
  const where = { groupId: id, isGroupAccount: false };

  const [total, folios, byStatus, checkedIn, balance, sums] = await Promise.all([   // NEW: added `sums`
    prisma.folio.count({ where }),
    prisma.folio.findMany({ where, skip, take, orderBy: { openedAt: 'desc' }, include: { guest: true, stay: { include: { room: true, guest: true } } } }),
    prisma.folio.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.stay.count({ where: { groupId: id, status: 'CHECKED_IN' } }),
    groupBalance(prisma, id),
    prisma.folioTransaction.aggregate({                                              // NEW: the 6th query
      where: { folio: { groupId: id } },
      _sum: { bill: true, payment: true },
    }),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;

  res.json({
    group,
    stats: { totalMembers: checkedIn, checkedInMembers: checkedIn, totalFolios: total, balance, status: checkedIn ? 'Active' : 'Inactive' },
    folios: await Promise.all(folios.map(async (f) => {
      const g = f.guest ?? f.stay?.guest;
      return {
        id: f.id, folioNo: f.folioNo, guestId: g?.id ?? null, guestName: g ? `${g.firstName} ${g.lastName}` : null,
        room: f.stay?.room.number ?? null, checkIn: f.stay?.checkInAt ?? null, checkOut: f.stay?.checkOutAt ?? null,
        balance: D(0).minus(await folioBalance(f.id)), status: f.status,
      };
    })),
    pagination: { page: p, pageSize: take, total, pages: Math.ceil(total / take) },
    statusDistribution: { CHECKED_IN: n('ACTIVE'), CHECKED_OUT: n('CHECKED_OUT'), SETTLED: n('SETTLED') },
    totals: { billed: sums._sum.bill ?? 0, paid: sums._sum.payment ?? 0, balance },   // NEW: the response field
  });
}));
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
    registrationDetails: z.object({
    placeOfIssue: z.string().trim().max(200).optional(),
    purposeOfVisit: z.string().trim().max(200).optional(),
    vehicleRegistration: z.string().trim().max(100).optional(),
    emergencyContactName: z.string().trim().max(200).optional(),
    emergencyContactPhone: z.string().trim().max(50).optional(),
    emergencyContactRelationship: z.string().trim().max(100).optional(),
  }).optional(),
});

staysRouter.post('/check-in', fd, asyncHandler(async (req, res) => res.status(201).json(await checkIn(parse(ciBody, req.body), req.user!.id, req.user!.role))));

staysRouter.get(
  '/:id/registration-card.pdf',
  fd,
  asyncHandler(async (req, res) => {
    const pdf = await renderRegistrationCard(
      req.params.id,
      req.user!.username,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.buffer.length),
      'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${pdf.filename}"`,
      'Cache-Control': 'no-store',
    });

    res.end(pdf.buffer);
  }),
);
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
  const { nights } = parse(
    z.object({
      nights: z.coerce.number().int().min(1).max(60),
    }),
    req.body,
  );

  const idempotencyKey = req.get('Idempotency-Key');

  if (
    !idempotencyKey ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)
  ) {
    throw new HttpError(
      400,
      'A valid Idempotency-Key header (16–128 characters) is required.',
    );
  }

  res.json(
    await extendStay(
      req.params.id,
      nights,
      req.user!.id,
      false,
      idempotencyKey,
    ),
  );
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
