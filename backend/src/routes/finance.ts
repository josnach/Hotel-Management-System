import { Router } from 'express';

import { z } from 'zod';

import { AccountType } from '@prisma/client';

import { asyncHandler, HttpError, page, parse } from '../lib/http';

import { D, prisma } from '../lib/prisma';

import { requireRole } from '../middleware/auth';

import { ACC, balances, postJournal } from '../services/accounting';



export const financeRouter = Router();

financeRouter.use(requireRole('ACCOUNTANT'));

const acct = requireRole('ACCOUNTANT');



const range = (q: Record<string, unknown>) => ({

  from: q.start ? new Date(String(q.start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),

  to: q.end ? new Date(`${String(q.end)}T23:59:59.999`) : new Date(),

});



// Chart of accounts

const accountPrefix: Record<AccountType, string> = {
  ASSET: '1',
  LIABILITY: '2',
  EQUITY: '3',
  REVENUE: '4',
  EXPENSE: '5',
};

const accBody = z.object({
  code: z.string().regex(/^\d{6}$/, 'Use a 6-digit code'),
  name: z.string().trim().min(1).max(120),
  type: z.nativeEnum(AccountType),
  category: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean().optional(),
});

financeRouter.get('/accounts', asyncHandler(async (_q, res) => {
  const rows = await balances();

  res.json(
    rows
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        category: a.category,
        description: a.description,
        isActive: a.isActive,
        isSystem: a.isSystem,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        balance:
          a.type === 'ASSET' || a.type === 'EXPENSE'
            ? a.net
            : a.net.neg(),
      })),
  );
}));

financeRouter.get('/accounts/:id', asyncHandler(async (req, res) => {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      _count: { select: { lines: true } },
      lines: {
        take: 15,
        orderBy: { entry: { date: 'desc' } },
        include: { entry: true },
      },
    },
  });

  const accountBalance = (await balances()).find(
    (item) => item.id === account.id,
  );

  const balance = accountBalance
    ? account.type === 'ASSET' || account.type === 'EXPENSE'
      ? accountBalance.net
      : accountBalance.net.neg()
    : D(0);

  res.json({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    category: account.category,
    description: account.description,
    isActive: account.isActive,
    isSystem: account.isSystem,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    balance,
    hasEntries: account._count.lines > 0,
    entryCount: account._count.lines,
    recentEntries: account.lines.map((line) => ({
      id: line.id,
      date: line.entry.date,
      txnNo: line.entry.txnNo,
      reference: line.entry.reference,
      description: line.entry.description,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
    })),
  });
}));

financeRouter.post('/accounts', acct, asyncHandler(async (req, res) => {
  const body = parse(accBody, req.body);

  if (!body.code.startsWith(accountPrefix[body.type])) {
    throw new HttpError(
      400,
      `${body.type} accounts must start with ${accountPrefix[body.type]}`,
    );
  }

  const account = await prisma.account.create({
    data: body,
  });

  res.status(201).json(account);
}));

financeRouter.put('/accounts/:id', acct, asyncHandler(async (req, res) => {
  const body = parse(
    accBody.partial().omit({ code: true }),
    req.body,
  );

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  const entryCount = await prisma.journalLine.count({
    where: { accountId: account.id },
  });

  if (body.type && body.type !== account.type && entryCount > 0) {
    throw new HttpError(
      409,
      'An account with journal entries cannot be reclassified.',
    );
  }

  if (body.type && !account.code.startsWith(accountPrefix[body.type])) {
    throw new HttpError(
      400,
      `${body.type} accounts must start with ${accountPrefix[body.type]}`,
    );
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: body,
  });

  res.json(updated);
}));

financeRouter.post('/accounts/:id/toggle', acct, asyncHandler(async (req, res) => {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: { isActive: !account.isActive },
  });

  res.json(updated);
}));

financeRouter.delete('/accounts/:id', acct, asyncHandler(async (req, res) => {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  if (account.isSystem) {
    throw new HttpError(409, 'System accounts cannot be deleted');
  }

  const entryCount = await prisma.journalLine.count({
    where: { accountId: account.id },
  });

  if (entryCount > 0) {
    throw new HttpError(
      409,
      'Accounts with entries cannot be deleted. Deactivate it instead.',
    );
  }

  await prisma.account.delete({
    where: { id: account.id },
  });

  res.status(204).end();
}));


// Journal

financeRouter.get(
  '/journal',
  asyncHandler(async (req, res) => {
    const { skip, take } = page(req.query, 50);

    const { start, end, accountId, type, txnNo } =
      req.query as Record<string, string | undefined>;

    const where = {
      entry: {
        ...(start || end
          ? {
              date: {
                gte: start ? new Date(start) : undefined,
                lte: end
                  ? new Date(`${end}T23:59:59.999`)
                  : undefined,
              },
            }
          : {}),
        ...(txnNo ? { txnNo: Number(txnNo) } : {}),
      },
      ...(accountId ? { accountId } : {}),
      ...(type === 'DEBIT'
        ? { debit: { gt: 0 } }
        : type === 'CREDIT'
          ? { credit: { gt: 0 } }
          : {}),
    };

    const [rows, total, sums] = await Promise.all([
      prisma.journalLine.findMany({
        where,
        skip,
        take,
        include: {
          entry: true,
          account: true,
        },
        orderBy: [
          { entry: { date: 'desc' } },
          { entryId: 'desc' },
        ],
      }),
      prisma.journalLine.count({ where }),
      prisma.journalLine.aggregate({
        where,
        _sum: {
          debit: true,
          credit: true,
        },
      }),
    ]);

    const dr = D(sums._sum.debit ?? 0);
    const cr = D(sums._sum.credit ?? 0);

    res.json({
      total,
      totalDebits: dr,
      totalCredits: cr,
      balanced: dr.equals(cr),
      difference: dr.minus(cr),
      rows: rows.map((line) => ({
        id: line.id,
        entryId: line.entryId,
        date: line.entry.date,
        txnNo: line.entry.txnNo,
        reference: line.entry.reference,
        account: line.account.name,
        accountCode: line.account.code,
        type: line.debit.gt(0) ? 'Debit' : 'Credit',
        description: line.entry.description,
        memo: line.memo,
        amount: line.debit.gt(0) ? line.debit : line.credit,
      })),
    });
  }),
);

// Full transaction details
financeRouter.get(
  '/journal/:id',
  asyncHandler(async (req, res) => {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: {
        lines: {
          include: {
            account: true,
          },
          orderBy: {
            account: {
              code: 'asc',
            },
          },
        },
      },
    });

    if (!entry) {
      throw new HttpError(404, 'Journal entry not found');
    }

    const totalDebits = entry.lines.reduce(
      (sum, line) => sum.plus(line.debit),
      D(0),
    );

    const totalCredits = entry.lines.reduce(
      (sum, line) => sum.plus(line.credit),
      D(0),
    );

    res.json({
      id: entry.id,
      txnNo: entry.txnNo,
      date: entry.date,
      reference: entry.reference,
      description: entry.description,
      createdAt: entry.createdAt,
      totalDebits,
      totalCredits,
      balanced: totalDebits.equals(totalCredits),
      lines: entry.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        code: line.account.code,
        account: line.account.name,
        type: line.debit.gt(0) ? 'Debit' : 'Credit',
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
      })),
    });
  }),
);

// Manual journal entry
financeRouter.post(
  '/journal',
  acct,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        date: z.coerce.date().optional(),
        reference: z.string().trim().max(120).optional().nullable(),
        description: z.string().trim().min(3).max(500),
        lines: z
          .array(
            z.object({
              code: z.string().trim().min(1),
              debit: z.coerce.number().min(0).optional(),
              credit: z.coerce.number().min(0).optional(),
              memo: z.string().trim().max(250).optional(),
            }),
          )
          .min(2),
      }),
      req.body,
    );

    const lines = b.lines;

    for (const [index, line] of lines.entries()) {
      const debit = D(line.debit ?? 0);
      const credit = D(line.credit ?? 0);

      if (debit.lt(0) || credit.lt(0)) {
        throw new HttpError(400, `Line ${index + 1}: amounts cannot be negative`);
      }

      if (debit.gt(0) === credit.gt(0)) {
        throw new HttpError(
          400,
          `Line ${index + 1}: enter an amount in either Debit or Credit, not both`,
        );
      }
    }

    const totalDebit = lines.reduce(
      (sum, line) => sum.plus(D(line.debit ?? 0)),
      D(0),
    );

    const totalCredit = lines.reduce(
      (sum, line) => sum.plus(D(line.credit ?? 0)),
      D(0),
    );

    if (totalDebit.lte(0) || totalCredit.lte(0)) {
      throw new HttpError(400, 'Journal entries must contain debit and credit amounts');
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new HttpError(
        400,
        `Journal is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`,
      );
    }

    const codes = [...new Set(lines.map((line) => line.code))];

    const accounts = await prisma.account.findMany({
      where: {
        code: { in: codes },
        isActive: true,
      },
      select: {
        code: true,
      },
    });

    const activeCodes = new Set(accounts.map((account) => account.code));
    const unavailable = codes.filter((code) => !activeCodes.has(code));

    if (unavailable.length) {
      throw new HttpError(
        400,
        `These accounts are missing or inactive: ${unavailable.join(', ')}`,
      );
    }

    const entry = await prisma.$transaction((tx) =>
      postJournal(tx, {
        ...b,
        reference: b.reference || undefined,
        userId: req.user!.id,
      }),
    );

    res.status(201).json(entry);
  }),
);

// Financial statements

financeRouter.get('/reports/trial-balance', asyncHandler(async (req, res) => {

  const { from, to } = range(req.query);

  const rows = (await balances(from, to)).filter((a) => !a.debit.equals(0) || !a.credit.equals(0)).sort((a, b) => a.code.localeCompare(b.code))

    .map((a) => ({ code: a.code, name: a.name, type: a.type, debit: a.net.gt(0) ? a.net : D(0), credit: a.net.lt(0) ? a.net.neg() : D(0) }));

  const totalDebit = rows.reduce((s, r) => s.plus(r.debit), D(0)), totalCredit = rows.reduce((s, r) => s.plus(r.credit), D(0));

  res.json({ from, to, rows, totalDebit, totalCredit, balanced: totalDebit.equals(totalCredit), difference: totalDebit.minus(totalCredit) });

}));

financeRouter.get('/reports/profit-loss', asyncHandler(async (req, res) => {

  const { from, to } = range(req.query);

  const b = await balances(from, to);

  const revenue = b.filter((a) => a.type === 'REVENUE' && !a.net.equals(0)).map((a) => ({ code: a.code, name: a.name, category: a.category, amount: a.net.neg() }));

  const expenses = b.filter((a) => a.type === 'EXPENSE' && !a.net.equals(0)).map((a) => ({ code: a.code, name: a.name, category: a.category, amount: a.net }));

  const totalRevenue = revenue.reduce((s, r) => s.plus(r.amount), D(0)), totalExpenses = expenses.reduce((s, r) => s.plus(r.amount), D(0));

  const net = totalRevenue.minus(totalExpenses);

  const salesByPoint = await prisma.order.groupBy({ by: ['salesPointId'], where: { createdAt: { gte: from, lte: to }, paymentStatus: { not: 'VOIDED' } }, _sum: { subtotal: true } });

  const sps = await prisma.salesPoint.findMany();

  res.json({ from, to, revenue, expenses, totalRevenue, totalExpenses, netProfit: net, margin: totalRevenue.gt(0) ? net.div(totalRevenue).times(100) : D(0), salesByPoint: salesByPoint.map((s) => ({ salesPoint: sps.find((p) => p.id === s.salesPointId)?.name, income: s._sum.subtotal })) });

}));

financeRouter.get('/reports/balance-sheet', asyncHandler(async (req, res) => {

  const asAt = req.query.asAt ? new Date(`${String(req.query.asAt)}T23:59:59`) : new Date();

  const b = await balances(undefined, asAt);

  const pick = (t: AccountType, sign: 1 | -1) => b.filter((a) => a.type === t && !a.net.equals(0)).map((a) => ({ code: a.code, name: a.name, amount: sign === 1 ? a.net : a.net.neg() }));

  const assets = pick('ASSET', 1), liabilities = pick('LIABILITY', -1), equity = pick('EQUITY', -1);

  const earnings = b.filter((a) => a.type === 'REVENUE').reduce((s, a) => s.plus(a.net.neg()), D(0)).minus(b.filter((a) => a.type === 'EXPENSE').reduce((s, a) => s.plus(a.net), D(0)));

  const sum = (x: { amount: any }[]) => x.reduce((s, r) => s.plus(r.amount), D(0));

  res.json({ asAt, assets, liabilities, equity, retainedEarnings: earnings, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equity).plus(earnings), balanced: sum(assets).equals(sum(liabilities).plus(sum(equity)).plus(earnings)) });

}));

/** Simplified (direct) cash flow: movement of cash & bank accounts for the period. */

financeRouter.get('/reports/cash-flow', asyncHandler(async (req, res) => {

  const { from, to } = range(req.query);

  const opening = (await balances(undefined, new Date(from.getTime() - 1))).filter((a) => [ACC.CASH, ACC.BANK].includes(a.code as any)).reduce((s, a) => s.plus(a.net), D(0));

  const period = (await balances(from, to)).filter((a) => [ACC.CASH, ACC.BANK].includes(a.code as any)).reduce((s, a) => s.plus(a.net), D(0));

  res.json({ from, to, cashAtBeginning: opening, operating: period, investing: D(0), financing: D(0), cashAtEnd: opening.plus(period), note: 'Operating includes all cash movements until investing/financing account tagging is configured.' });

}));



// Suppliers, purchase orders

financeRouter.get('/suppliers', asyncHandler(async (_q, res) => res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }))));

financeRouter.post('/suppliers', acct, asyncHandler(async (req, res) => res.status(201).json(await prisma.supplier.create({ data: parse(z.object({ name: z.string().min(1), phone: z.string().optional(), email: z.string().email().optional() }), req.body) }))));

financeRouter.get('/purchase-orders', asyncHandler(async (req, res) => {

  const { status, supplierId, q, start, end } = req.query as Record<string, string | undefined>;

  const rows = await prisma.purchaseOrder.findMany({ where: { ...(status ? { status: status as any } : {}), ...(supplierId ? { supplierId } : {}), ...(q ? { OR: [{ poNo: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] } : {}), ...(start || end ? { createdAt: { gte: start ? new Date(start) : undefined, lte: end ? new Date(`${end}T23:59:59`) : undefined } } : {}) }, include: { supplier: true, items: { include: { item: true } } }, orderBy: { createdAt: 'desc' } });

  const grouped = await prisma.purchaseOrder.groupBy({ by: ['status'], _count: true });

  res.json({ summary: { total: grouped.reduce((s, g) => s + g._count, 0), ...Object.fromEntries(grouped.map((g) => [g.status, g._count])) }, rows });

}));

financeRouter.post('/purchase-orders', acct, asyncHandler(async (req, res) => {

  const b = parse(z.object({ supplierId: z.string(), notes: z.string().optional(), items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().min(0) })).min(1) }), req.body);

  const total = b.items.reduce((s, i) => s.plus(D(i.quantity).times(i.unitCost)), D(0));

  res.status(201).json(await prisma.purchaseOrder.create({ data: { poNo: `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`, supplierId: b.supplierId, notes: b.notes, total, status: 'DRAFT', items: { create: b.items } } }));

}));

financeRouter.post('/purchase-orders/:id/status', acct, asyncHandler(async (req, res) => {

  const { status } = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'CANCELLED']) }), req.body);

  res.json(await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status } }));

}));

/** Receiving stock increases item stock and posts Dr Inventory / Cr Accounts Payable-equivalent (Cash/Bank on receipt is configurable). */

financeRouter.post('/purchase-orders/:id/receive', acct, asyncHandler(async (req, res) => {

  const { paid } = parse(z.object({ paid: z.boolean().default(true) }), req.body ?? {});

  res.json(await prisma.$transaction(async (tx) => {

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true } });

    if (po.status !== 'APPROVED') throw new HttpError(409, 'Only approved purchase orders can be received');

    for (const li of po.items) {

      const it = await tx.inventoryItem.update({ where: { id: li.itemId }, data: { quantity: { increment: li.quantity }, costPrice: li.unitCost } });

      await tx.stockMovement.create({ data: { itemId: li.itemId, type: 'PURCHASE', quantity: li.quantity, balance: it.quantity, reference: po.poNo, userId: req.user!.id } });

    }

    await postJournal(tx, { description: `Goods received ${po.poNo}`, reference: po.poNo, userId: req.user!.id, lines: [{ code: ACC.INVENTORY, debit: po.total }, { code: paid ? ACC.BANK : ACC.SALARIES_PAYABLE, credit: po.total }] });

    return tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED', receivedAt: new Date() } });

  }));

}));



// Ledgers

financeRouter.get('/ledgers/city', asyncHandler(async (_q, res) => {

  const groups = await prisma.group.findMany({ include: { folios: { include: { txs: true } } } });

  res.json(groups.map((g) => ({ id: g.id, name: g.name, balance: g.folios.flatMap((f) => f.txs).reduce((s, t) => s.plus(t.bill).minus(t.payment), D(0)) })));

}));

financeRouter.get('/ledgers/guest', asyncHandler(async (_q, res) => {

  const stays = await prisma.stay.findMany({ where: { status: 'CHECKED_IN' }, include: { guest: true, room: true, folio: { include: { txs: true } } } });

  res.json(stays.map((s) => ({ guest: `${s.guest.firstName} ${s.guest.lastName}`, room: s.room.number, balance: (s.folio?.txs ?? []).reduce((a, t) => a.plus(t.bill).minus(t.payment), D(0)) })));

}));

financeRouter.get('/payments', asyncHandler(async (req, res) => {

  const { start, end } = req.query as Record<string, string | undefined>;

  res.json(await prisma.folioTransaction.findMany({ where: { type: 'CREDIT', ...(start || end ? { createdAt: { gte: start ? new Date(start) : undefined, lte: end ? new Date(`${end}T23:59:59`) : undefined } } : {}) }, include: { folio: { include: { guest: true, group: true } } }, orderBy: { createdAt: 'desc' }, take: 300 }));

}));
