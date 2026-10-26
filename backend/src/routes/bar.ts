import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { getFoodCostTarget } from '../services/policy';

export const barRouter = Router();
const manage = requireRole('MANAGER');            // ADMIN and MANAGER: change recipes
const stock = requireRole('STOREKEEPER');         // + STOREKEEPER: do stock counts

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

// ───────────── Recipes and food cost ─────────────
/** Every dish/shot that has a recipe: ingredient cost, food-cost %, margin and how many portions can be made now. */
barRouter.get('/recipes', asyncHandler(async (_q, res) => {
  const target = await getFoodCostTarget();
  const dishes = await prisma.inventoryItem.findMany({ where: { recipeLines: { some: {} } }, include: { category: true, salesPoint: true, recipeLines: { include: { ingredient: true } } }, orderBy: { name: 'asc' } });
  res.json({
    target,
    rows: dishes.map((d) => {
      const cost = d.recipeLines.reduce((s, l) => s.plus(D(l.quantity).times(l.ingredient.costPrice)), D(0));
      const price = D(d.sellPrice);
      const pct = price.gt(0) ? cost.div(price).times(100) : D(0);
      const portions = Math.min(...d.recipeLines.map((l) => (D(l.quantity).gt(0) ? Math.floor(D(l.ingredient.quantity).div(l.quantity).toNumber()) : Infinity)));
      return {
        id: d.id, name: d.name, category: d.category.name, salesPoint: d.salesPoint.name, sellPrice: num(price), cost: num(cost.toDecimalPlaces(2)),
        foodCostPct: Math.round(pct.toNumber() * 10) / 10, margin: num(price.minus(cost).toDecimalPlaces(2)), overTarget: pct.gt(target), portionsAvailable: Number.isFinite(portions) ? portions : 0,
        lines: d.recipeLines.map((l) => ({ ingredientId: l.ingredientId, ingredient: l.ingredient.name, quantity: num(l.quantity), unitCost: num(l.ingredient.costPrice), lineCost: num(D(l.quantity).times(l.ingredient.costPrice).toDecimalPlaces(2)) })),
      };
    }),
  });
}));

const recipeBody = z.object({ lines: z.array(z.object({ ingredientId: z.string(), quantity: z.coerce.number().positive().max(100000) })).max(30) });

/** Replace a dish's recipe. An empty list removes it (the item goes back to deducting itself). */
barRouter.put('/recipes/:dishId', manage, asyncHandler(async (req, res) => {
  const { lines } = parse(recipeBody, req.body);
  const dishId = req.params.dishId;
  const dish = await prisma.inventoryItem.findUnique({ where: { id: dishId } });
  if (!dish) throw new HttpError(404, 'Item not found');
  if (new Set(lines.map((l) => l.ingredientId)).size !== lines.length) throw new HttpError(400, 'Each ingredient can appear once');
  if (lines.some((l) => l.ingredientId === dishId)) throw new HttpError(400, 'An item cannot be its own ingredient');
  if (lines.length) {
    // One level only: ingredients must be plain stock items, and a stock item used elsewhere cannot become a dish.
    const nested = await prisma.recipeLine.findFirst({ where: { dishId: { in: lines.map((l) => l.ingredientId) } }, include: { dish: true } });
    if (nested) throw new HttpError(400, `${nested.dish.name} is itself a recipe, so it cannot be an ingredient`);
    const used = await prisma.recipeLine.findFirst({ where: { ingredientId: dishId }, include: { dish: true } });
    if (used) throw new HttpError(400, `${dish.name} is an ingredient of ${used.dish.name}, so it cannot have a recipe`);
    const found = await prisma.inventoryItem.count({ where: { id: { in: lines.map((l) => l.ingredientId) } } });
    if (found !== lines.length) throw new HttpError(404, 'An ingredient was not found');
  }
  const before = await prisma.recipeLine.count({ where: { dishId } });
  await prisma.$transaction(async (tx) => {
    await tx.recipeLine.deleteMany({ where: { dishId } });
    if (lines.length) await tx.recipeLine.createMany({ data: lines.map((l) => ({ dishId, ingredientId: l.ingredientId, quantity: l.quantity })) });
    await audit(tx, { userId: req.user!.id, action: 'RECIPE_EDIT', entity: 'InventoryItem', entityId: dishId, meta: { name: dish.name, linesBefore: before, linesAfter: lines.length } });
  });
  res.json({ ok: true, lines: lines.length });
}));

// ───────────── Variance: what the bottles say vs what was sold ─────────────
const IN_TYPES = new Set(['PURCHASE', 'OPENING', 'TRANSFER_IN', 'RETURN']);

barRouter.get('/variance', asyncHandler(async (req, res) => {
  const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date(), salesPointId: z.string().optional() }), req.query);
  if (q.to <= q.from) throw new HttpError(400, 'The end date must be after the start date');
  // Stock items only (dishes with recipes hold no stock of their own).
  const items = await prisma.inventoryItem.findMany({ where: { recipeLines: { none: {} }, ...(q.salesPointId ? { salesPointId: q.salesPointId } : {}) }, include: { usedInRecipes: { include: { dish: { include: { recipeLines: true } } } } } });
  const ids = items.map((i) => i.id);
  const [moves, pending] = await Promise.all([
    prisma.stockMovement.findMany({ where: { itemId: { in: ids }, storeId: null, createdAt: { lt: q.to } }, orderBy: { createdAt: 'asc' } }),
    prisma.stockAdjustment.groupBy({ by: ['itemId'], where: { itemId: { in: ids }, status: 'PENDING', storeId: null }, _sum: { delta: true } }),
  ]);
  const byItem = new Map<string, typeof moves>();
  for (const m of moves) (byItem.get(m.itemId) ?? byItem.set(m.itemId, []).get(m.itemId)!).push(m);
  const pend = new Map(pending.map((p) => [p.itemId, num(p._sum.delta)]));

  const rows = items.flatMap((it) => {
    const all = byItem.get(it.id) ?? [];
    const before = all.filter((m) => m.createdAt < q.from);
    const inPeriod = all.filter((m) => m.createdAt >= q.from);
    if (!inPeriod.length && !pend.get(it.id)) return [];
    const opening = before.length ? num(before[before.length - 1].balance) : 0;
    const t = { received: 0, soldWhole: 0, usedInRecipes: 0, voidReturned: 0, adjIn: 0, adjOut: 0, other: 0 };
    for (const m of inPeriod) {
      const v = num(m.quantity);
      if (m.type === 'SALE') t.soldWhole -= v;
      else if (m.type === 'RECIPE_USE') t.usedInRecipes -= v;
      else if (m.type === 'VOID_RETURN') t.voidReturned += v;
      else if (IN_TYPES.has(m.type) || m.reference === 'STORE ISSUE') t.received += v;
      else if (m.reference?.startsWith('ADJ:')) (v >= 0 ? (t.adjIn += v) : (t.adjOut += -v));
      else t.other += v;
    }
    const closing = inPeriod.length ? num(inPeriod[inPeriod.length - 1].balance) : opening;
    const netAdj = t.adjIn - t.adjOut;
    // How many shots one unit makes: from the smallest single-ingredient recipe (e.g. 1/30 bottle = a shot).
    const portions = it.usedInRecipes.filter((l) => l.dish.recipeLines.length === 1).map((l) => num(l.quantity)).filter((x) => x > 0);
    const portion = portions.length ? Math.min(...portions) : null;
    const r6 = (x: number) => Math.round(x * 1e4) / 1e4;
    return [{
      itemId: it.id, name: it.name, unitCost: num(it.costPrice), opening: r6(opening), received: r6(t.received), soldWhole: r6(t.soldWhole), usedInRecipes: r6(t.usedInRecipes),
      voidReturned: r6(t.voidReturned), other: r6(t.other), adjustmentsIn: r6(t.adjIn), adjustmentsOut: r6(t.adjOut), closing: r6(closing),
      varianceQty: r6(netAdj), varianceValue: Math.round(netAdj * num(it.costPrice)), shotsEquivalent: portion ? Math.round(netAdj / portion) : null,
      pendingAdjustment: r6(pend.get(it.id) ?? 0),
    }];
  });
  rows.sort((a, b) => a.varianceValue - b.varianceValue); // biggest losses first
  res.json({ from: q.from, to: q.to, rows, totalVarianceValue: rows.reduce((s, r) => s + r.varianceValue, 0) });
}));

// ───────────── Stock count: enter what is physically there, get the variance ─────────────
/** The count sheet: stock items for one sales point with the system quantity. */
barRouter.get('/count-sheet', stock, asyncHandler(async (req, res) => {
  const { salesPointId } = parse(z.object({ salesPointId: z.string() }), req.query);
  const items = await prisma.inventoryItem.findMany({ where: { salesPointId, isActive: true, recipeLines: { none: {} } }, include: { category: true }, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }] });
  res.json(items.map((i) => ({ id: i.id, name: i.name, category: i.category.name, system: num(i.quantity), unitCost: num(i.costPrice) })));
}));

/** Counted quantities become PENDING stock adjustments, so the usual approval and Revenue Guard rules apply. */
barRouter.post('/counts', stock, asyncHandler(async (req, res) => {
  const { counts } = parse(z.object({ counts: z.array(z.object({ itemId: z.string(), counted: z.coerce.number().min(0) })).min(1).max(500) }), req.body);
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: counts.map((c) => c.itemId) } } });
  const pending = await prisma.stockAdjustment.findMany({ where: { itemId: { in: items.map((i) => i.id) }, status: 'PENDING', storeId: null, reason: { startsWith: 'Stock count' } }, select: { itemId: true } });
  const hasPending = new Set(pending.map((p) => p.itemId));
  const rows = [];
  for (const c of counts) {
    const it = items.find((i) => i.id === c.itemId);
    if (!it) continue;
    const delta = D(c.counted).minus(it.quantity).toDecimalPlaces(3);
    let created = false;
    if (!delta.isZero() && !hasPending.has(it.id)) {
      await prisma.stockAdjustment.create({ data: { itemId: it.id, delta, reason: `Stock count: counted ${c.counted}, system ${num(it.quantity)}`, requestedById: req.user!.id } });
      created = true;
    }
    rows.push({ itemId: it.id, name: it.name, system: num(it.quantity), counted: c.counted, variance: num(delta), varianceValue: Math.round(num(delta) * num(it.costPrice)), adjustmentRaised: created, alreadyPending: !delta.isZero() && !created });
  }
  await audit(prisma, { userId: req.user!.id, action: 'STOCK_COUNT', entity: 'InventoryItem', entityId: 'bulk', meta: { items: rows.length, withVariance: rows.filter((r) => r.variance !== 0).length, netValue: rows.reduce((s, r) => s + r.varianceValue, 0) } });
  res.json({ rows, netVarianceValue: rows.reduce((s, r) => s + r.varianceValue, 0) });
}));

/** Picker data for the recipe editor: every active item with its cost and whether it already has a recipe. */
barRouter.get('/items', asyncHandler(async (_q, res) => {
  const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, include: { salesPoint: true, _count: { select: { recipeLines: true } } }, orderBy: { name: 'asc' } });
  res.json(items.map((i) => ({ id: i.id, name: i.name, salesPoint: i.salesPoint.name, costPrice: num(i.costPrice), sellPrice: num(i.sellPrice), hasRecipe: i._count.recipeLines > 0 })));
}));
