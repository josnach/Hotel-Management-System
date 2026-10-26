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

financeRouter.get('/accounts', asyncHandler(async (_q, res) => {

  const b = await balances();

  res.json(b.sort((a, c) => a.code.localeCompare(c.code)).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, category: a.category, isActive: a.isActive, isSystem: a.isSystem, balance: a.type === 'ASSET' || a.type === 'EXPENSE' ? a.net : a.net.neg() })));

}));

const accBody = z.object({ code: z.string().regex(/^\d{6}$/, 'Use a 6-digit code'), name: z.string().min(1), type: z.nativeEnum(AccountType), category: z.string().optional() });

financeRouter.post('/accounts', acct, asyncHandler(async (req, res) => {

  const b = parse(accBody, req.body);

  const expected = { ASSET: '1', LIABILITY: '2', EQUITY: '3', REVENUE: '4', EXPENSE: '5' }[b.type];

  if (!b.code.startsWith(expected)) throw new HttpError(400, `${b.type} accounts must start with ${expected}`);

  res.status(201).json(await prisma.account.create({ data: b }));

}));

financeRouter.put('/accounts/:id', acct, asyncHandler(async (req, res) => res.json(await prisma.account.update({ where: { id: req.params.id }, data: parse(accBody.partial().omit({ code: true }), req.body) }))));

financeRouter.post('/accounts/:id/toggle', acct, asyncHandler(async (req, res) => { const a = await prisma.account.findUniqueOrThrow({ where: { id: req.params.id } }); res.json(await prisma.account.update({ where: { id: a.id }, data: { isActive: !a.isActive } })); }));

financeRouter.delete('/accounts/:id', acct, asyncHandler(async (req, res) => {

  const a = await prisma.account.findUniqueOrThrow({ where: { id: req.params.id } });

  if (a.isSystem) throw new HttpError(409, 'System accounts cannot be deleted');

  if (await prisma.journalLine.count({ where: { accountId: a.id } })) throw new HttpError(409, 'Accounts with entries cannot be deleted. Deactivate it instead.');

  await prisma.account.delete({ where: { id: a.id } }); res.status(204).end();

}));



// Journal

financeRouter.get('/journal', asyncHandler(async (req, res) => {

  const { skip, take } = page(req.query, 50);

  const { start, end, accountId, type, txnNo } = req.query as Record<string, string | undefined>;

  const where = {

    entry: { ...(start || end ? { date: { gte: start ? new Date(start) : undefined, lte: end ? new Date(`${end}T23:59:59`) : undefined } } : {}), ...(txnNo ? { txnNo: Number(txnNo) } : {}) },

    ...(accountId ? { accountId } : {}),

    ...(type === 'DEBIT' ? { debit: { gt: 0 } } : type === 'CREDIT' ? { credit: { gt: 0 } } : {}),

  };

  const [rows, total, sums] = await Promise.all([

    prisma.journalLine.findMany({ where, skip, take, include: { entry: true, account: true }, orderBy: { entry: { date: 'desc' } } }),

    prisma.journalLine.count({ where }), prisma.journalLine.aggregate({ where, _sum: { debit: true, credit: true } }),

  ]);

  const dr = D(sums._sum.debit ?? 0), cr = D(sums._sum.credit ?? 0);

  res.json({ total, totalDebits: dr, totalCredits: cr, balanced: dr.equals(cr), difference: dr.minus(cr), rows: rows.map((l) => ({ id: l.id, date: l.entry.date, txnNo: l.entry.txnNo, account: l.account.name, accountCode: l.account.code, type: l.debit.gt(0) ? 'Debit' : 'Credit', description: l.entry.description, amount: l.debit.gt(0) ? l.debit : l.credit })) });

}));

financeRouter.post('/journal', acct, asyncHandler(async (req, res) => {

  const b = parse(z.object({ date: z.coerce.date().optional(), description: z.string().min(3), lines: z.array(z.object({ code: z.string(), debit: z.coerce.number().min(0).optional(), credit: z.coerce.number().min(0).optional() })).min(2) }), req.body);

  res.status(201).json(await prisma.$transaction((tx) => postJournal(tx, { ...b, userId: req.user!.id })));

}));



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
