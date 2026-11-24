import { Router } from 'express';
import { z } from 'zod';
import { PaymentVoucherStatus, Prisma } from '@prisma/client';
import { asyncHandler, clientIp, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma, Tx } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { postJournal } from '../services/accounting';

export const paymentVouchersRouter = Router();

// ADMIN and MANAGER pass automatically (see requireRole).
paymentVouchersRouter.use(requireRole('ACCOUNTANT'));
// requireRole('MANAGER') lets in ADMIN and MANAGER only.
const approver = requireRole('MANAGER');

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export const PAYEE_TYPES = ['SUPPLIER', 'EMPLOYEE', 'CONTRACTOR', 'UTILITY', 'OTHER'] as const;
export const PAY_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD'] as const;

const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d+(?:\.\d{1,2})?$/.test(v) && Number(v) > 0,
    'Amounts must be positive with at most two decimal places',
  );

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** PV-YYYY-MM-NNNN, counting up within the month. */
async function nextVoucherNo(db: Tx | typeof prisma, now = new Date()) {
  const prefix = `PV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const last = await db.paymentVoucher.findFirst({
    where: { voucherNo: { startsWith: prefix } },
    orderBy: { voucherNo: 'desc' },
    select: { voucherNo: true },
  });
  const parsed = Number(last?.voucherNo.slice(prefix.length));
  const n = Number.isFinite(parsed) ? parsed + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/* ───────────── Dropdown sources ───────────── */

paymentVouchersRouter.get(
  '/next-number',
  asyncHandler(async (_q, res) => res.json({ voucherNo: await nextVoucherNo(prisma) })),
);

/**
 * Debit dropdown: active expense accounts.
 * Credit dropdown: active asset accounts whose name mentions cash or bank.
 */
paymentVouchersRouter.get(
  '/accounts',
  asyncHandler(async (_q, res) => {
    const accounts = await prisma.account.findMany({
      where: { isActive: true, type: { in: ['EXPENSE', 'ASSET'] } },
      orderBy: { code: 'asc' },
    });
    const opt = (a: { id: string; code: string; name: string }) => ({
      id: a.id,
      label: `${a.code} - ${a.name}`,
    });
    res.json({
      expense: accounts.filter((a) => a.type === 'EXPENSE').map(opt),
      cash: accounts.filter((a) => a.type === 'ASSET' && /cash|bank/i.test(a.name)).map(opt),
    });
  }),
);

/* ───────────── LIST + stat cards ───────────── */

paymentVouchersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, status, payeeType, from, to } = req.query as Record<string, string | undefined>;

    const where: Prisma.PaymentVoucherWhereInput = {
      ...(status ? { status: status as PaymentVoucherStatus } : {}),
      ...(payeeType ? { payeeType } : {}),
      ...(q
        ? {
            OR: [
              { voucherNo: { contains: q, mode: 'insensitive' } },
              { payeeName: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(from || to
        ? {
            transactionDate: {
              gte: from ? new Date(from) : undefined,
              lte: to ? new Date(`${to}T23:59:59.999`) : undefined,
            },
          }
        : {}),
    };

    const [rows, total, pending, approved, sum] = await Promise.all([
      prisma.paymentVoucher.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      prisma.paymentVoucher.count({ where }),
      prisma.paymentVoucher.count({ where: { AND: [where, { status: 'SUBMITTED' }] } }),
      prisma.paymentVoucher.count({ where: { AND: [where, { status: 'APPROVED' }] } }),
      prisma.paymentVoucher.aggregate({
        where: { AND: [where, { status: { not: 'CANCELLED' } }] },
        _sum: { amount: true },
      }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } },
      select: { id: true, fullName: true, username: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.fullName ?? u.username]));

    res.json({
      summary: { total, pending, approved, totalAmount: sum._sum.amount ?? 0 },
      rows: rows.map((v) => ({
        id: v.id,
        voucherNo: v.voucherNo,
        payeeName: v.payeeName,
        payeeType: v.payeeType,
        amount: v.amount,
        status: v.status,
        date: v.transactionDate,
        createdBy: nameOf.get(v.createdById) ?? '—',
      })),
    });
  }),
);

/* ───────────── CREATE (Save Draft / Save & Submit) ───────────── */

paymentVouchersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        transactionDate: z.coerce.date(),
        payeeType: z.enum(PAYEE_TYPES, { message: 'Select a payee type' }),
        payeeName: z.string().trim().min(1, 'Payee name is required').max(160),
        description: z.string().trim().min(1, 'Description is required').max(500),
        amount: money.optional(),
        debitAccountId: z.string().min(1, 'Select an expense account'),
        creditAccountId: z.string().min(1, 'Select a cash/bank account'),
        paymentMethod: z.enum(PAY_METHODS, { message: 'Select a payment method' }),
        items: z
          .array(
            z.object({
              description: z.string().trim().min(1, 'Every item needs a description').max(250),
              amount: money,
              accountCode: z.string().trim().max(20).optional(),
            }),
          )
          .default([]),
        submit: z.boolean().default(false),
      }),
      req.body,
    );

    // With itemised lines the total is their sum; otherwise it is the Amount field.
    const total = b.items.length
      ? b.items.reduce((s, i) => s.plus(D(i.amount)), D(0))
      : D(b.amount ?? 0);
    if (total.lte(0)) throw new HttpError(400, 'Enter an amount greater than zero');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const voucher = await prisma.$transaction(async (tx) => {
          const [debit, credit] = await Promise.all([
            tx.account.findUnique({ where: { id: b.debitAccountId } }),
            tx.account.findUnique({ where: { id: b.creditAccountId } }),
          ]);
          if (!debit || !debit.isActive || debit.type !== 'EXPENSE') {
            throw new HttpError(400, 'Choose an active expense account to debit');
          }
          if (!credit || !credit.isActive || credit.type !== 'ASSET') {
            throw new HttpError(400, 'Choose an active cash or bank account to credit');
          }

          const created = await tx.paymentVoucher.create({
            data: {
              voucherNo: await nextVoucherNo(tx),
              transactionDate: b.transactionDate,
              payeeType: b.payeeType,
              payeeName: b.payeeName,
              description: b.description,
              amount: total,
              paymentMethod: b.paymentMethod,
              debitAccountId: debit.id,
              creditAccountId: credit.id,
              status: b.submit ? 'SUBMITTED' : 'DRAFT',
              submittedAt: b.submit ? new Date() : null,
              createdById: req.user!.id,
              items: {
                create: b.items.map((i) => ({
                  description: i.description,
                  amount: i.amount,
                  accountCode: i.accountCode || null,
                })),
              },
            },
          });

          await audit(tx, {
            userId: req.user!.id,
            action: b.submit ? 'VOUCHER_SUBMIT' : 'VOUCHER_DRAFT',
            entity: 'PaymentVoucher',
            entityId: created.id,
            ip: clientIp(req),
            meta: { voucherNo: created.voucherNo, amount: Number(total) },
          });
          return created;
        });
        return res.status(201).json(voucher);
      } catch (e) {
        // Two people saving at the same moment can pick the same number: try the next one.
        if (isUnique(e) && attempt < 2) continue;
        throw e;
      }
    }
  }),
);

/* ───────────── Workflow: submit → approve → pay, or cancel ───────────── */

paymentVouchersRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.paymentVoucher.findUnique({ where: { id: req.params.id } });
      if (!v) throw new HttpError(404, 'Voucher not found');
      if (v.status !== 'DRAFT') throw new HttpError(409, `This voucher is already ${v.status.toLowerCase()}`);
      await tx.paymentVoucher.update({
        where: { id: v.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      await audit(tx, {
        userId: req.user!.id, action: 'VOUCHER_SUBMIT', entity: 'PaymentVoucher',
        entityId: v.id, ip: clientIp(req), meta: { voucherNo: v.voucherNo },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

paymentVouchersRouter.post(
  '/:id/approve',
  approver,
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.paymentVoucher.findUnique({ where: { id: req.params.id } });
      if (!v) throw new HttpError(404, 'Voucher not found');
      if (v.status !== 'SUBMITTED') throw new HttpError(409, 'Only submitted vouchers can be approved');
      // Whoever raised the voucher cannot also approve it (an admin can).
      if (v.createdById === req.user!.id && req.user!.role !== 'ADMIN') {
        throw new HttpError(403, 'You cannot approve a voucher you created');
      }
      await tx.paymentVoucher.update({
        where: { id: v.id },
        data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
      });
      await audit(tx, {
        userId: req.user!.id, action: 'VOUCHER_APPROVE', entity: 'PaymentVoucher',
        entityId: v.id, ip: clientIp(req), meta: { voucherNo: v.voucherNo, amount: Number(v.amount) },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

/** Paying posts the journal: Dr expense account / Cr cash or bank account. */
paymentVouchersRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.paymentVoucher.findUnique({
        where: { id: req.params.id },
        include: { debitAccount: true, creditAccount: true },
      });
      if (!v) throw new HttpError(404, 'Voucher not found');
      if (v.status !== 'APPROVED') throw new HttpError(409, 'Only approved vouchers can be paid');

      const journal = await postJournal(tx, {
        description: `Payment voucher ${v.voucherNo} - ${v.payeeName}`,
        reference: `PV:${v.voucherNo}`,
        userId: req.user!.id,
        lines: [
          { code: v.debitAccount.code, debit: v.amount },
          { code: v.creditAccount.code, credit: v.amount },
        ],
      });

      await tx.paymentVoucher.update({
        where: { id: v.id },
        data: { status: 'PAID', paidById: req.user!.id, paidAt: new Date(), journalId: journal?.id },
      });
      await audit(tx, {
        userId: req.user!.id, action: 'VOUCHER_PAID', entity: 'PaymentVoucher',
        entityId: v.id, ip: clientIp(req), meta: { voucherNo: v.voucherNo, amount: Number(v.amount) },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

paymentVouchersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().max(500).optional() }), req.body ?? {});
    await prisma.$transaction(async (tx) => {
      const v = await tx.paymentVoucher.findUnique({ where: { id: req.params.id } });
      if (!v) throw new HttpError(404, 'Voucher not found');
      if (v.status === 'PAID') throw new HttpError(409, 'A paid voucher cannot be cancelled');
      if (v.status === 'CANCELLED') throw new HttpError(409, 'This voucher is already cancelled');
      await tx.paymentVoucher.update({
        where: { id: v.id },
        data: { status: 'CANCELLED', cancelReason: reason || null },
      });
      await audit(tx, {
        userId: req.user!.id, action: 'VOUCHER_CANCEL', entity: 'PaymentVoucher',
        entityId: v.id, ip: clientIp(req), meta: { voucherNo: v.voucherNo, reason: reason ?? null },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);