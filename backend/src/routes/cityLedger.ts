import { Router } from 'express';
import { z } from 'zod';
import { CityLedgerStatus, Prisma } from '@prisma/client';
import { asyncHandler, clientIp, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC, postJournal } from '../services/accounting';
import { createLedgerEntry } from '../services/cityLedger';
import { cashAccountFor, postFolioCharge } from '../services/folio';

export const cityLedgerRouter = Router();
// ADMIN and MANAGER pass automatically (see requireRole).
cityLedgerRouter.use(requireRole('ACCOUNTANT'));

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d+(?:\.\d{1,2})?$/.test(v) && Number(v) > 0,
    'Amount must be positive with at most two decimal places',
  );

const nameOf = (e: {
  guest: { firstName: string; lastName: string } | null;
  group: { name: string } | null;
}) => (e.guest ? `${e.guest.firstName} ${e.guest.lastName}` : (e.group?.name ?? 'N/A'));

const include = { guest: true, group: true } as const;

/* ───────────── LIST + summary cards ───────────── */
cityLedgerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? 'ALL').toUpperCase();
    const where: Prisma.CityLedgerEntryWhereInput =
      status === 'ALL' ? {} : { status: status as CityLedgerStatus };

    const [rows, open] = await Promise.all([
      prisma.cityLedgerEntry.findMany({
        where,
        include,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: 1000,
      }),
      // The cards always show what is still open, whatever tab is selected.
      prisma.cityLedgerEntry.groupBy({
        by: ['type'],
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    const sum = (t: 'DEBIT' | 'CREDIT') => D(open.find((o) => o.type === t)?._sum.amount ?? 0);
    const receivables = sum('DEBIT');
    const payables = sum('CREDIT');

    res.json({
      summary: { receivables, payables, net: receivables.minus(payables) },
      rows: rows.map((e) => ({
        id: e.id,
        date: e.transactionDate,
        guestName: nameOf(e),
        description: e.description,
        type: e.type,
        amount: e.amount,
        status: e.status,
      })),
    });
  }),
);

/* ───────────── Dropdown sources ───────────── */

/** "Add Transaction" guest dropdown: `Name - phone` plus "(Checked In)" for in-house guests. */
cityLedgerRouter.get(
  '/guests',
  asyncHandler(async (_q, res) => {
    const guests = await prisma.guest.findMany({
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 2000,
      include: { stays: { where: { status: 'CHECKED_IN' }, select: { id: true }, take: 1 } },
    });
    res.json(
      guests.map((g) => ({
        id: g.id,
        label: `${g.firstName} ${g.lastName} - ${g.phone}${g.stays.length ? ' (Checked In)' : ''}`,
        checkedIn: g.stays.length > 0,
      })),
    );
  }),
);

/** "Post to Guest" dropdown: in-house guests as `Name (Room: 210)`. */
cityLedgerRouter.get(
  '/in-house',
  asyncHandler(async (_q, res) => {
    const stays = await prisma.stay.findMany({
      where: { status: 'CHECKED_IN', folio: { isNot: null } },
      include: { guest: true, room: true },
      orderBy: { checkInAt: 'desc' },
    });
    res.json(
      stays.map((s) => ({
        stayId: s.id,
        label: `${s.guest.firstName} ${s.guest.lastName} (Room: ${s.room.number})`,
        room: s.room.number,
      })),
    );
  }),
);

/* ───────────── ADD TRANSACTION ───────────── */
cityLedgerRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        guestId: z.string().min(1, 'Select a guest'),
        type: z.enum(['DEBIT', 'CREDIT']),
        amount: money,
        description: z.string().trim().min(1, 'Description is required').max(250),
        transactionDate: z.coerce.date().optional(),
      }),
      req.body,
    );

    const entry = await prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findUnique({ where: { id: b.guestId } });
      if (!guest) throw new HttpError(404, 'Guest not found');
      const stay = await tx.stay.findFirst({
        where: { guestId: guest.id },
        orderBy: { checkInAt: 'desc' },
        include: { folio: true },
      });

      const created = await createLedgerEntry(tx, {
        guestId: guest.id,
        stayId: stay?.id,
        folioId: stay?.folio?.id,
        type: b.type,
        amount: b.amount,
        description: b.description,
        date: b.transactionDate,
        userId: req.user!.id,
      });

      await audit(tx, {
        userId: req.user!.id,
        action: 'CITY_LEDGER_ADD',
        entity: 'CityLedgerEntry',
        entityId: created.id,
        ip: clientIp(req),
        meta: { type: b.type, amount: b.amount },
      });
      return created;
    });

    res.status(201).json(entry);
  }),
);

/* ───────────── PAY (debit entries) ───────────── */
cityLedgerRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        method: z.enum(['CASH', 'CARD', 'TRANSFER'], { message: 'Select a payment method' }),
        paymentDate: z.coerce.date().optional(),
        reference: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
      req.body,
    );

    await prisma.$transaction(async (tx) => {
      const e = await tx.cityLedgerEntry.findUnique({ where: { id: req.params.id }, include });
      if (!e) throw new HttpError(404, 'Transaction not found');
      if (e.type !== 'DEBIT') throw new HttpError(400, 'Only debit transactions can be paid');
      if (e.status !== 'COMPLETED') throw new HttpError(409, `This transaction is already ${e.status.toLowerCase()}`);

      await postJournal(tx, {
        date: b.paymentDate,
        description: `City ledger payment - ${nameOf(e)}`,
        reference: `CITYLEDGER:${e.id}:PAY`,
        userId: req.user!.id,
        lines: [
          { code: cashAccountFor(b.method), debit: e.amount },
          { code: ACC.AR_CITY, credit: e.amount },
        ],
      });

      await tx.cityLedgerEntry.update({
        where: { id: e.id },
        data: {
          status: 'PAID',
          settledAt: b.paymentDate ?? new Date(),
          settleMethod: b.method,
          settleReference: b.reference || null,
          settleNotes: b.notes || null,
        },
      });

      await audit(tx, {
        userId: req.user!.id,
        action: 'CITY_LEDGER_PAY',
        entity: 'CityLedgerEntry',
        entityId: e.id,
        ip: clientIp(req),
        meta: { amount: Number(e.amount), method: b.method, reference: b.reference ?? null },
      });
    }, SERIALIZABLE);

    res.json({ ok: true });
  }),
);

/* ───────────── REFUND (credit entries) ───────────── */
cityLedgerRouter.post(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        method: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_NOTE'], { message: 'Select a refund method' }),
        refundDate: z.coerce.date().optional(),
        reason: z.string().trim().max(500).optional(),
      }),
      req.body,
    );

    await prisma.$transaction(async (tx) => {
      const e = await tx.cityLedgerEntry.findUnique({ where: { id: req.params.id }, include });
      if (!e) throw new HttpError(404, 'Transaction not found');
      if (e.type !== 'CREDIT') throw new HttpError(400, 'Only credit transactions can be refunded');
      if (e.status !== 'COMPLETED') throw new HttpError(409, `This transaction is already ${e.status.toLowerCase()}`);

      // A credit note keeps the money in the hotel, so only cash and bank refunds move cash.
      if (b.method !== 'CREDIT_NOTE') {
        await postJournal(tx, {
          date: b.refundDate,
          description: `City ledger refund - ${nameOf(e)}`,
          reference: `CITYLEDGER:${e.id}:REFUND`,
          userId: req.user!.id,
          lines: [
            { code: ACC.GUEST_DEPOSITS, debit: e.amount },
            { code: b.method === 'CASH' ? ACC.CASH : ACC.BANK, credit: e.amount },
          ],
        });
      }

      await tx.cityLedgerEntry.update({
        where: { id: e.id },
        data: {
          status: 'REFUNDED',
          settledAt: b.refundDate ?? new Date(),
          settleMethod: b.method,
          settleNotes: b.reason || null,
        },
      });

      await audit(tx, {
        userId: req.user!.id,
        action: 'CITY_LEDGER_REFUND',
        entity: 'CityLedgerEntry',
        entityId: e.id,
        ip: clientIp(req),
        meta: { amount: Number(e.amount), method: b.method, reason: b.reason ?? null },
      });
    }, SERIALIZABLE);

    res.json({ ok: true });
  }),
);

/* ───────────── POST TO GUEST ACCOUNT ───────────── */
cityLedgerRouter.post(
  '/:id/post-to-guest',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        stayId: z.string().optional(),
        roomNumber: z.string().trim().optional(),
      }),
      req.body,
    );
    if (!b.stayId && !b.roomNumber) throw new HttpError(400, 'Select a guest or enter a room number');

    await prisma.$transaction(async (tx) => {
      const e = await tx.cityLedgerEntry.findUnique({ where: { id: req.params.id }, include });
      if (!e) throw new HttpError(404, 'Transaction not found');
      if (e.status !== 'COMPLETED') throw new HttpError(409, `This transaction is already ${e.status.toLowerCase()}`);

      const stay = await tx.stay.findFirst({
        where: {
          status: 'CHECKED_IN',
          ...(b.stayId ? { id: b.stayId } : { room: { number: b.roomNumber } }),
        },
        include: { folio: true, guest: true, room: true },
      });
      if (!stay || !stay.folio) {
        throw new HttpError(404, b.stayId ? 'That guest is not checked in' : `No checked-in guest found in room ${b.roomNumber}`);
      }

      const description = `City ledger: ${e.description}`;

      if (e.type === 'DEBIT') {
        // The guest now owes this amount on their own folio.
        await postFolioCharge(tx, {
          folioId: stay.folio.id,
          description,
          amount: e.amount,
          creditCode: ACC.AR_CITY,
          userId: req.user!.id,
          reference: `CITYLEDGER:${e.id}:POST`,
        });
      } else {
        // The hotel's credit is applied against what the guest owes.
        const journal = await postJournal(tx, {
          description,
          reference: `CITYLEDGER:${e.id}:POST`,
          userId: req.user!.id,
          lines: [
            { code: ACC.GUEST_DEPOSITS, debit: e.amount },
            { code: ACC.AR_GUEST, credit: e.amount },
          ],
        });
        await tx.folioTransaction.create({
          data: {
            folioId: stay.folio.id,
            type: 'CREDIT',
            description,
            payment: e.amount,
            method: 'CITY_LEDGER',
            journalId: journal?.id,
            userId: req.user!.id,
          },
        });
      }

      await tx.cityLedgerEntry.update({
        where: { id: e.id },
        data: {
          status: 'PAID',
          settledAt: new Date(),
          settleMethod: 'POSTED_TO_GUEST',
          postedToFolioId: stay.folio.id,
          postedAt: new Date(),
        },
      });

      await audit(tx, {
        userId: req.user!.id,
        action: 'CITY_LEDGER_POST_TO_GUEST',
        entity: 'CityLedgerEntry',
        entityId: e.id,
        ip: clientIp(req),
        meta: { amount: Number(e.amount), type: e.type, room: stay.room.number, folioId: stay.folio.id },
      });
    }, SERIALIZABLE);

    res.json({ ok: true });
  }),
);
