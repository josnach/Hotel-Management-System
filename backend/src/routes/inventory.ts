import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, HttpError, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';

export const inventoryRouter = Router();
const inv = requireRole('STOREKEEPER');
/** Anything that sets what an item sells for: ADMIN and MANAGER only (requireRole('MANAGER') lets ADMIN through too). */
const pricing = requireRole('MANAGER');
const canSetPrice = (role?: string) => role === 'ADMIN' || role === 'MANAGER';

const status = (qty: Prisma.Decimal, min: Prisma.Decimal) => (qty.lte(0) ? 'OUT' : qty.lte(min) ? 'LOW' : 'IN');

inventoryRouter.get('/categories', asyncHandler(async (_q, res) => res.json(await prisma.inventoryCategory.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: 'asc' } }))));
inventoryRouter.post('/categories', inv, asyncHandler(async (req, res) => res.status(201).json(await prisma.inventoryCategory.create({ data: parse(z.object({ name: z.string().min(1) }), req.body) }))));

inventoryRouter.get('/items', asyncHandler(async (req, res) => {
  const { skip, take } = page(req.query, 10);
  const { q, categoryId, salesPointId } = req.query as Record<string, string | undefined>;
  const where: Prisma.InventoryItemWhereInput = { ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}), ...(categoryId ? { categoryId } : {}), ...(salesPointId ? { salesPointId } : {}) };
  const [total, rows] = await Promise.all([prisma.inventoryItem.count({ where }), prisma.inventoryItem.findMany({ where, skip, take, include: { category: true, salesPoint: true }, orderBy: { name: 'asc' } })]);
  res.json({ total, rows: rows.map((r) => ({ ...r, status: status(r.quantity, r.minLevel), stockValue: r.quantity.times(r.costPrice) })) });
}));
const itemBody = z.object({ name: z.string().min(1), description: z.string().optional(), categoryId: z.string(), salesPointId: z.string(), sellPrice: z.coerce.number().min(0), costPrice: z.coerce.number().min(0).default(0), quantity: z.coerce.number().min(0).default(0), minLevel: z.coerce.number().min(0).default(5) });
inventoryRouter.post('/items', pricing, asyncHandler(async (req, res) => {
  const b = parse(itemBody, req.body);
  const it = await prisma.inventoryItem.create({ data: b });
  if (b.quantity > 0) await prisma.stockMovement.create({ data: { itemId: it.id, type: 'OPENING', quantity: b.quantity, balance: b.quantity, userId: req.user!.id } });
  res.status(201).json(it);
}));
inventoryRouter.put('/items/:id', inv, asyncHandler(async (req, res) => {
  const { quantity, ...rest } = parse(itemBody.partial(), req.body); void quantity;
  const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: req.params.id } });
  // Storekeepers may still fix names, categories and reorder levels, but never prices.
  if (!canSetPrice(req.user!.role) && ((rest.sellPrice !== undefined && !before.sellPrice.equals(rest.sellPrice)) || (rest.costPrice !== undefined && !before.costPrice.equals(rest.costPrice))))
    throw new HttpError(403, 'Only an admin or manager can change prices');
  const updated = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: rest });
  // Record what changed, especially prices: price edits are where till disputes start
  const plain = (v: unknown) => (v instanceof Prisma.Decimal ? Number(v) : v);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['name', 'sellPrice', 'costPrice', 'categoryId', 'salesPointId', 'minLevel'] as const)
    if (String(before[k]) !== String(updated[k])) changes[k] = { from: plain(before[k]), to: plain(updated[k]) };
  if (Object.keys(changes).length)
    await audit(prisma, { userId: req.user!.id, action: 'sellPrice' in changes || 'costPrice' in changes ? 'PRICE_CHANGE' : 'ITEM_UPDATE', entity: 'InventoryItem', entityId: updated.id, meta: { item: updated.name, changes } as Prisma.InputJsonValue });
  res.json(updated);
}));
inventoryRouter.delete('/items/:id', pricing, asyncHandler(async (req, res) => {
  const it = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { isActive: false } });
  await audit(prisma, { userId: req.user!.id, action: 'ITEM_DEACTIVATE', entity: 'InventoryItem', entityId: it.id, meta: { item: it.name } });
  res.status(204).end();
}));

inventoryRouter.get('/items/:id/bin-card', asyncHandler(async (req, res) => {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ item, movements: await prisma.stockMovement.findMany({ where: { itemId: item.id }, orderBy: { createdAt: 'asc' } }) });
}));

// Adjustments need approval
inventoryRouter.post('/items/:id/adjust', inv, asyncHandler(async (req, res) => {
  const b = parse(z.object({ delta: z.coerce.number().refine((n) => n !== 0), reason: z.string().min(3) }), req.body);
  res.status(201).json(await prisma.stockAdjustment.create({ data: { itemId: req.params.id, delta: b.delta, reason: b.reason, requestedById: req.user!.id } }));
}));
inventoryRouter.get('/adjustments', asyncHandler(async (req, res) => res.json(await prisma.stockAdjustment.findMany({ where: { status: (req.query.status as 'PENDING') ?? undefined }, include: { item: true, requestedBy: { select: { username: true } }, store: true }, orderBy: { createdAt: 'desc' } }))));
inventoryRouter.post('/adjustments/:id/decide', requireRole('ACCOUNTANT', 'STOREKEEPER'), asyncHandler(async (req, res) => {
  const { approve } = parse(z.object({ approve: z.boolean() }), req.body);
  res.json(await prisma.$transaction(async (tx) => {
    const a = await tx.stockAdjustment.findUniqueOrThrow({ where: { id: req.params.id } });
    if (a.status !== 'PENDING') throw new HttpError(409, 'Already decided');
    // Four-eyes rule: whoever asked for a stock change cannot approve it (the admin can, and it is flagged by Revenue Guard)
    if (approve && a.requestedById === req.user!.id && req.user!.role !== 'ADMIN') throw new HttpError(403, 'You cannot approve your own stock adjustment');
    if (approve) {
      if (a.storeId) {
        const si = await tx.storeItem.upsert({ where: { storeId_itemId: { storeId: a.storeId, itemId: a.itemId } }, update: { quantity: { increment: a.delta } }, create: { storeId: a.storeId, itemId: a.itemId, quantity: a.delta } });
        await tx.stockMovement.create({ data: { itemId: a.itemId, storeId: a.storeId, type: a.delta.gt(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', quantity: a.delta, balance: si.quantity, reference: `ADJ:${a.id}`, userId: req.user!.id } });
      } else {
        const it = await tx.inventoryItem.update({ where: { id: a.itemId }, data: { quantity: { increment: a.delta } } });
        if (it.quantity.lt(0)) throw new HttpError(409, 'Adjustment would make stock negative');
        await tx.stockMovement.create({ data: { itemId: a.itemId, type: a.delta.gt(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', quantity: a.delta, balance: it.quantity, reference: `ADJ:${a.id}`, userId: req.user!.id } });
      }
    }
    const decided = await tx.stockAdjustment.update({ where: { id: a.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: req.user!.id, decidedAt: new Date() } });
    await audit(tx, { userId: req.user!.id, action: approve ? 'ADJUSTMENT_APPROVED' : 'ADJUSTMENT_REJECTED', entity: 'StockAdjustment', entityId: a.id, meta: { itemId: a.itemId, delta: Number(a.delta), reason: a.reason, requestedById: a.requestedById } });
    return decided;
  }));
}));

/** Stock Position Report: grouped by category with totals. */
inventoryRouter.get('/stock-position', asyncHandler(async (req, res) => {
  const { categoryId, salesPointId, q } = req.query as Record<string, string | undefined>;
  const items = await prisma.inventoryItem.findMany({ where: { isActive: true, ...(categoryId ? { categoryId } : {}), ...(salesPointId ? { salesPointId } : {}), ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) }, include: { category: true, salesPoint: true }, orderBy: [{ categoryId: 'asc' }, { code: 'asc' }] });
  const groups = new Map<string, any>();
  items.forEach((i) => { const g = groups.get(i.category.name) ?? { category: i.category.name, items: [], stockValue: D(0) }; g.items.push({ ...i, status: status(i.quantity, i.minLevel), value: i.quantity.times(i.costPrice) }); g.stockValue = g.stockValue.plus(i.quantity.times(i.costPrice)); groups.set(i.category.name, g); });
  res.json({
    totals: { items: items.length, stockValue: items.reduce((s, i) => s.plus(i.quantity.times(i.costPrice)), D(0)), sellingValue: items.reduce((s, i) => s.plus(i.quantity.times(i.sellPrice)), D(0)), lowStock: items.filter((i) => status(i.quantity, i.minLevel) === 'LOW').length, outOfStock: items.filter((i) => status(i.quantity, i.minLevel) === 'OUT').length },
    groups: [...groups.values()],
  });
}));

// ───── Stores (bulk) ─────
export const storesRouter = Router();
storesRouter.get('/', asyncHandler(async (_q, res) => res.json(await prisma.store.findMany({ orderBy: { name: 'asc' } }))));
storesRouter.post('/', inv, asyncHandler(async (req, res) => res.status(201).json(await prisma.store.create({ data: parse(z.object({ name: z.string().min(1) }), req.body) }))));
storesRouter.get('/items', asyncHandler(async (req, res) => {
  const { storeId, q } = req.query as Record<string, string | undefined>;
  const rows = await prisma.storeItem.findMany({ where: { ...(storeId ? { storeId } : {}), ...(q ? { item: { name: { contains: q, mode: 'insensitive' } } } : {}) }, include: { store: true, item: { include: { category: true } } } });
  res.json(rows.map((r) => ({ ...r, status: status(r.quantity, r.minLevel) })));
}));
storesRouter.get('/bin-card', asyncHandler(async (req, res) => res.json(await prisma.stockMovement.findMany({ where: { storeId: String(req.query.storeId), itemId: String(req.query.itemId) }, orderBy: { createdAt: 'asc' } }))));
storesRouter.post('/adjust', inv, asyncHandler(async (req, res) => {
  const b = parse(z.object({ storeId: z.string(), itemId: z.string(), delta: z.coerce.number().refine((n) => n !== 0), reason: z.string().min(3) }), req.body);
  res.status(201).json(await prisma.stockAdjustment.create({ data: { ...b, requestedById: req.user!.id } }));
}));
storesRouter.post('/transfers', inv, asyncHandler(async (req, res) => {
  const b = parse(z.object({ fromStoreId: z.string(), toStoreId: z.string(), itemId: z.string(), quantity: z.coerce.number().positive() }), req.body);
  if (b.fromStoreId === b.toStoreId) throw new HttpError(400, 'Choose two different stores');
  res.status(201).json(await prisma.$transaction(async (tx) => {
    const from = await tx.storeItem.findUnique({ where: { storeId_itemId: { storeId: b.fromStoreId, itemId: b.itemId } } });
    if (!from || from.quantity.lt(b.quantity)) throw new HttpError(409, 'Not enough stock in the source store');
    const f = await tx.storeItem.update({ where: { id: from.id }, data: { quantity: { decrement: b.quantity } } });
    const t = await tx.storeItem.upsert({ where: { storeId_itemId: { storeId: b.toStoreId, itemId: b.itemId } }, update: { quantity: { increment: b.quantity } }, create: { storeId: b.toStoreId, itemId: b.itemId, quantity: b.quantity } });
    await tx.stockMovement.createMany({ data: [
      { itemId: b.itemId, storeId: b.fromStoreId, type: 'TRANSFER_OUT', quantity: D(b.quantity).neg(), balance: f.quantity, userId: req.user!.id },
      { itemId: b.itemId, storeId: b.toStoreId, type: 'TRANSFER_IN', quantity: b.quantity, balance: t.quantity, userId: req.user!.id } ] });
    return tx.stockTransfer.create({ data: b });
  }));
}));
/** Issue from store to a sales point (adds to the sellable item's stock). */
storesRouter.post('/issues', inv, asyncHandler(async (req, res) => {
  const b = parse(z.object({ storeId: z.string(), itemId: z.string(), salesPointId: z.string(), quantity: z.coerce.number().positive() }), req.body);
  res.status(201).json(await prisma.$transaction(async (tx) => {
    const si = await tx.storeItem.findUnique({ where: { storeId_itemId: { storeId: b.storeId, itemId: b.itemId } } });
    if (!si || si.quantity.lt(b.quantity)) throw new HttpError(409, 'Not enough stock in the store');
    const s = await tx.storeItem.update({ where: { id: si.id }, data: { quantity: { decrement: b.quantity } } });
    const it = await tx.inventoryItem.update({ where: { id: b.itemId }, data: { quantity: { increment: b.quantity } } });
    await tx.stockMovement.createMany({ data: [
      { itemId: b.itemId, storeId: b.storeId, type: 'ISSUE', quantity: D(b.quantity).neg(), balance: s.quantity, userId: req.user!.id },
      { itemId: b.itemId, type: 'ADJUSTMENT_IN', quantity: b.quantity, balance: it.quantity, reference: 'STORE ISSUE', userId: req.user!.id } ] });
    return tx.stockIssue.create({ data: b });
  }));
}));
storesRouter.get('/issues', asyncHandler(async (_q, res) => res.json(await prisma.stockIssue.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }))));
storesRouter.get('/transfers', asyncHandler(async (_q, res) => res.json(await prisma.stockTransfer.findMany({ include: { from: true, to: true }, orderBy: { createdAt: 'desc' }, take: 200 }))));
storesRouter.get('/returns', asyncHandler(async (req, res) => res.json(await prisma.stockReturn.findMany({ where: { status: (req.query.status as string) || undefined }, include: { item: true, salesPoint: true }, orderBy: { createdAt: 'desc' } }))));
storesRouter.post('/returns', inv, asyncHandler(async (req, res) => {
  const b = parse(z.object({ itemId: z.string(), salesPointId: z.string(), quantity: z.coerce.number().positive(), disposition: z.enum(['RESTOCK', 'DAMAGED', 'EXPIRED']) }), req.body);
  const it = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: b.itemId } });
  res.status(201).json(await prisma.stockReturn.create({ data: { ...b, returnNo: `RET-${Date.now().toString(36).toUpperCase()}`, amount: it.costPrice.times(b.quantity) } }));
}));
storesRouter.get('/stock-position', asyncHandler(async (_req, res) => {
  const rows = await prisma.storeItem.findMany({ include: { store: true, item: { include: { category: true } } } });
  const g = new Map<string, any>();
  rows.forEach((r) => { const x = g.get(r.item.category.name) ?? { category: r.item.category.name, items: [], stockValue: D(0) }; const value = r.quantity.times(r.item.costPrice); x.items.push({ ...r, value, status: status(r.quantity, r.minLevel) }); x.stockValue = x.stockValue.plus(value); g.set(r.item.category.name, x); });
  res.json({ totals: { items: rows.length, stockValue: rows.reduce((s, r) => s.plus(r.quantity.times(r.item.costPrice)), D(0)), sellingValue: rows.reduce((s, r) => s.plus(r.quantity.times(r.item.sellPrice)), D(0)), lowStock: rows.filter((r) => status(r.quantity, r.minLevel) === 'LOW').length, outOfStock: rows.filter((r) => status(r.quantity, r.minLevel) === 'OUT').length }, groups: [...g.values()] });
}));
