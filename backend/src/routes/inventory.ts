import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { asyncHandler, HttpError, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { config } from '../config';
import { nextAdjustmentNumber } from '../lib/adjustment-number';

export const inventoryRouter = Router();

const inv = requireRole('STOREKEEPER');

/** Anything that sets what an item sells for: ADMIN and MANAGER only. */
const pricing = requireRole('MANAGER');

const canSetPrice = (role?: string) =>
  role === 'ADMIN' || role === 'MANAGER';

/** Only these roles may see what stock costs and sells for. */
const canSeeCost = (role?: string) =>
  role === 'ADMIN' || role === 'MANAGER' || role === 'ACCOUNTANT';

/** Removes cost and selling price from an inventory item. */
function stripPrices<T extends { costPrice?: unknown; sellPrice?: unknown }>(
  item: T,
) {
  const { costPrice, sellPrice, ...safe } = item;
  void costPrice;
  void sellPrice;
  return safe;
}

const status = (qty: Prisma.Decimal, min: Prisma.Decimal) =>
  qty.lte(0) ? 'OUT' : qty.lte(min) ? 'LOW' : 'IN';


/**
 * Central menu catalogue.
 *
 * MenuProduct owns the shared name, category and selling price.
 * InventoryItem remains the sales-point-specific stock record.
 * Existing InventoryItem rows are linked in place; they are never recreated.
 */
async function ensureLegacyMenuProducts() {
  // FIX 1: skip the transaction entirely when nothing needs linking.
  const pending = await prisma.inventoryItem.count({
    where: { menuProductId: null },
  });
  if (pending === 0) return;

  await prisma.$transaction(
    async (tx) => {
      const legacyItems = await tx.inventoryItem.findMany({
        where: { menuProductId: null },
        include: { category: true },
        orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
      });

      const groups = new Map<string, typeof legacyItems>();

      for (const item of legacyItems) {
        const key = `${item.categoryId}::${item.name.trim().toLocaleLowerCase()}`;
        const group = groups.get(key) ?? [];

        group.push(item);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        const first = group[0];

        const product = await tx.menuProduct.create({
          data: {
            name: first.name.trim(),
            description: first.description,
            categoryId: first.categoryId,
            sellPrice: first.sellPrice,
            isActive: group.some((item) => item.isActive),
          },
        });

        await tx.inventoryItem.updateMany({
          where: {
            id: { in: group.map((item) => item.id) },
            menuProductId: null,
          },
          data: { menuProductId: product.id },
        });
      }
    },
    { maxWait: 20000, timeout: 120000 },
  );
}

inventoryRouter.get(
  '/menu',
  inv,
  asyncHandler(async (_req, res) => {
    await ensureLegacyMenuProducts();

    const products = await prisma.menuProduct.findMany({
      include: {
        category: true,
        items: {
          include: { salesPoint: true },
          orderBy: { salesPoint: { name: 'asc' } },
        },
        availability: {
          include: { salesPoint: true },
        },
      },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });

    const result = products.map((product) => {
      const prices = new Set(
        product.items.map((item) => item.sellPrice.toString()),
      );

      const availabilityBySalesPoint = new Map(
        product.availability.map((entry) => [
          entry.salesPointId,
          entry.isAvailable,
        ]),
      );

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        category: product.category,
        sellPrice: product.sellPrice,
        isActive: product.isActive,
        priceConflict: prices.size > 1,
        salesPoints: product.items.map((item) => ({
          id: item.salesPointId,
          name: item.salesPoint.name,
          inventoryItemId: item.id,
          available:
            availabilityBySalesPoint.get(item.salesPointId) ??
            item.isActive,
        })),
      };
    });

    res.json(result);
  }),
);

inventoryRouter.post(
  '/menu',
  pricing,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1),
        description: z.string().trim().optional(),
        categoryId: z.string(),
        sellPrice: z.coerce.number().min(0),
      }),
      req.body,
    );

    const category = await prisma.inventoryCategory.findUnique({
      where: { id: b.categoryId },
    });

    if (!category || !category.isActive) {
      throw new HttpError(400, 'Choose an active category');
    }

    const duplicate = await prisma.menuProduct.findFirst({
      where: {
        categoryId: b.categoryId,
        name: { equals: b.name, mode: 'insensitive' },
      },
    });

    if (duplicate) {
      throw new HttpError(
        409,
        'A menu item with this name already exists in this category',
      );
    }

    // FIX 2: batch inserts instead of two queries per sales point.
    const product = await prisma.$transaction(
      async (tx) => {
        const created = await tx.menuProduct.create({
          data: {
            name: b.name,
            description: b.description,
            categoryId: b.categoryId,
            sellPrice: b.sellPrice,
          },
        });

        const salesPoints = await tx.salesPoint.findMany({
          where: { isActive: true },
        });

        await tx.inventoryItem.createMany({
          data: salesPoints.map((salesPoint) => ({
            name: created.name,
            description: created.description,
            categoryId: created.categoryId,
            salesPointId: salesPoint.id,
            menuProductId: created.id,
            sellPrice: created.sellPrice,
            costPrice: 0,
            quantity: 0,
            minLevel: 5,
            isActive: true,
          })),
        });

        await tx.salesPointMenuAvailability.createMany({
          data: salesPoints.map((salesPoint) => ({
            salesPointId: salesPoint.id,
            menuProductId: created.id,
            isAvailable: true,
          })),
        });

        return created;
      },
      { maxWait: 20000, timeout: 60000 },
    );

    await audit(prisma, {
      userId: req.user!.id,
      action: 'MENU_ITEM_CREATE',
      entity: 'MenuProduct',
      entityId: product.id,
      meta: {
        name: product.name,
        categoryId: product.categoryId,
        sellPrice: Number(product.sellPrice),
      } as Prisma.InputJsonValue,
    });

    res.status(201).json(product);
  }),
);

inventoryRouter.put(
  '/menu/:id',
  pricing,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional(),
        categoryId: z.string().optional(),
        sellPrice: z.coerce.number().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );

    const current = await prisma.menuProduct.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    const nextName = b.name ?? current.name;
    const nextCategoryId = b.categoryId ?? current.categoryId;

    const duplicate = await prisma.menuProduct.findFirst({
      where: {
        id: { not: current.id },
        categoryId: nextCategoryId,
        name: { equals: nextName, mode: 'insensitive' },
      },
    });

    if (duplicate) {
      throw new HttpError(
        409,
        'A menu item with this name already exists in the selected category',
      );
    }

    if (b.categoryId) {
      const category = await prisma.inventoryCategory.findUnique({
        where: { id: b.categoryId },
      });

      if (!category || !category.isActive) {
        throw new HttpError(400, 'Choose an active category');
      }
    }

    // FIX 3: longer timeout for slow database connections.
    await prisma.$transaction(
      async (tx) => {
        const updated = await tx.menuProduct.update({
          where: { id: current.id },
          data: b,
        });

        // Synchronize shared product details with existing inventory records.
        // Stock quantities and movement history remain untouched.
        await tx.inventoryItem.updateMany({
          where: { menuProductId: current.id },
          data: {
            name: updated.name,
            description: updated.description,
            categoryId: updated.categoryId,
            sellPrice: updated.sellPrice,
            isActive: updated.isActive,
          },
        });
      },
      { maxWait: 20000, timeout: 60000 },
    );

    await audit(prisma, {
      userId: req.user!.id,
      action: b.sellPrice !== undefined ? 'PRICE_CHANGE' : 'MENU_ITEM_UPDATE',
      entity: 'MenuProduct',
      entityId: current.id,
      meta: {
        previousName: current.name,
        name: nextName,
        categoryId: nextCategoryId,
        sellPrice: b.sellPrice,
        isActive: b.isActive,
      } as Prisma.InputJsonValue,
    });

    res.json({ ok: true });
  }),
);

inventoryRouter.patch(
  '/menu/:id/availability',
  pricing,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        salesPointId: z.string(),
        available: z.boolean(),
      }),
      req.body,
    );

    const product = await prisma.menuProduct.findUnique({
      where: { id: req.params.id },
    });

    if (!product) {
      throw new HttpError(404, 'Menu product not found');
    }

    const salesPoint = await prisma.salesPoint.findUnique({
      where: { id: b.salesPointId },
    });

    if (!salesPoint) {
      throw new HttpError(404, 'Sales point not found');
    }

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        menuProductId: product.id,
        salesPointId: salesPoint.id,
      },
    });

    if (!inventoryItem) {
      throw new HttpError(
        404,
        'This product has no inventory record at that sales point',
      );
    }

    await prisma.salesPointMenuAvailability.upsert({
      where: {
        salesPointId_menuProductId: {
          salesPointId: b.salesPointId,
          menuProductId: product.id,
        },
      },
      update: { isAvailable: b.available },
      create: {
        salesPointId: b.salesPointId,
        menuProductId: product.id,
        isAvailable: b.available,
      },
    });

    res.json({
      ok: true,
      salesPointId: b.salesPointId,
      available: b.available && product.isActive,
    });
  }),
);

// ───── Categories ─────

inventoryRouter.get(
  '/categories',
  inv,
  asyncHandler(async (_q, res) =>
    res.json(
      await prisma.inventoryCategory.findMany({
        include: { _count: { select: { items: true } } },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ),
  ),
);

inventoryRouter.post(
  '/categories',
  inv,
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({
        name: z.string().trim().min(1),
        section: z.enum(['FOOD', 'DRINKS', 'PASTRIES']),
      }),
      req.body,
    );

    const exists = await prisma.inventoryCategory.findFirst({
      where: {
        section: data.section,
        name: { equals: data.name, mode: 'insensitive' },
      },
    });

    if (exists) {
      return res
        .status(409)
        .json({ message: `"${data.name}" already exists in this section` });
    }

    const last = await prisma.inventoryCategory.aggregate({
      where: { section: data.section },
      _max: { sortOrder: true },
    });

    res.status(201).json(
      await prisma.inventoryCategory.create({
        data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      }),
    );
  }),
);


inventoryRouter.put(
  '/categories/:id',
  inv,
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({
        name: z.string().trim().min(1),
        section: z.enum(['FOOD', 'DRINKS', 'PASTRIES']),
      }),
      req.body,
    );

    const category = await prisma.inventoryCategory.findUnique({
      where: { id: req.params.id },
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const duplicate = await prisma.inventoryCategory.findFirst({
      where: {
        id: { not: req.params.id },
        section: data.section,
        name: { equals: data.name, mode: 'insensitive' },
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: `"${data.name}" already exists in this section`,
      });
    }

    const updated = await prisma.inventoryCategory.update({
      where: { id: req.params.id },
      data,
      include: {
        _count: {
          select: {
            items: true,
            products: true,
          },
        },
      },
    });

    return res.json(updated);
  }),
);

inventoryRouter.delete(
  '/categories/:id',
  inv,
  asyncHandler(async (req, res) => {
    const category = await prisma.inventoryCategory.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            items: true,
            products: true,
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (category._count.items > 0 || category._count.products > 0) {
      return res.status(409).json({
        message:
          'This category cannot be deleted because it contains inventory items or menu products.',
        itemCount: category._count.items,
        productCount: category._count.products,
      });
    }

    await prisma.inventoryCategory.delete({
      where: { id: req.params.id },
    });

    return res.json({ message: 'Category deleted successfully' });
  }),
);


// ───── Inventory Items ─────

inventoryRouter.get(
  '/items',
  inv,
  asyncHandler(async (req, res) => {
    const { skip, take } = page(req.query, 10);
    const { q, categoryId, salesPointId } = req.query as Record<
      string,
      string | undefined
    >;

    const where: Prisma.InventoryItemWhereInput = {
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(salesPointId ? { salesPointId } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
        skip,
        take,
        include: { category: true, salesPoint: true },
        orderBy: [
          { category: { section: 'asc' } },
          { category: { sortOrder: 'asc' } },
          { name: 'asc' },
        ],
      }),
    ]);

    const seeCost = canSeeCost(req.user?.role);

    res.json({
      total,
      rows: rows.map((r) => ({
        ...(seeCost ? r : stripPrices(r)),
        status: status(r.quantity, r.minLevel),
        ...(seeCost ? { stockValue: r.quantity.times(r.costPrice) } : {}),
      })),
    });
  }),
);

const itemBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string(),
  salesPointId: z.string(),
  sellPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().min(0).default(0),
  minLevel: z.coerce.number().min(0).default(5),
});

inventoryRouter.post(
  '/items',
  pricing,
  asyncHandler(async (req, res) => {
    const b = parse(itemBody, req.body);
    const it = await prisma.inventoryItem.create({ data: b });

    if (b.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          itemId: it.id,
          type: 'OPENING',
          quantity: b.quantity,
          balance: b.quantity,
          userId: req.user!.id,
        },
      });
    }

    res.status(201).json(it);
  }),
);

inventoryRouter.put(
  '/items/:id',
  inv,
  asyncHandler(async (req, res) => {
    const { quantity, ...rest } = parse(itemBody.partial(), req.body);
    void quantity;

    const before = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    // Storekeepers may fix inventory details but cannot change prices.
    if (
      !canSetPrice(req.user!.role) &&
      ((rest.sellPrice !== undefined &&
        !before.sellPrice.equals(rest.sellPrice)) ||
        (rest.costPrice !== undefined &&
          !before.costPrice.equals(rest.costPrice)))
    ) {
      throw new HttpError(403, 'Only an admin or manager can change prices');
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: rest,
    });

    const plain = (v: unknown) =>
      v instanceof Prisma.Decimal ? Number(v) : v;

    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const k of [
      'name',
      'sellPrice',
      'costPrice',
      'categoryId',
      'salesPointId',
      'minLevel',
    ] as const) {
      if (String(before[k]) !== String(updated[k])) {
        changes[k] = {
          from: plain(before[k]),
          to: plain(updated[k]),
        };
      }
    }

    if (Object.keys(changes).length) {
      await audit(prisma, {
        userId: req.user!.id,
        action:
          'sellPrice' in changes || 'costPrice' in changes
            ? 'PRICE_CHANGE'
            : 'ITEM_UPDATE',
        entity: 'InventoryItem',
        entityId: updated.id,
        meta: { item: updated.name, changes } as Prisma.InputJsonValue,
      });
    }

    res.json(
  canSeeCost(req.user?.role)
    ? updated
    : stripPrices(updated),
);
  }),
);

inventoryRouter.delete(
  '/items/:id',
  pricing,
  asyncHandler(async (req, res) => {
    const it = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await audit(prisma, {
      userId: req.user!.id,
      action: 'ITEM_DEACTIVATE',
      entity: 'InventoryItem',
      entityId: it.id,
      meta: { item: it.name },
    });

    res.status(204).end();
  }),
);

// Bin card: storekeepers see stock movements but never cost or selling prices.
inventoryRouter.get(
  '/items/:id/bin-card',
  inv,
  asyncHandler(async (req, res) => {
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        category: true,
        salesPoint: true,
      },
    });

    const allMovements = await prisma.stockMovement.findMany({
      where: { itemId: item.id },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const startDate = req.query.startDate
      ? new Date(`${req.query.startDate}T00:00:00.000`)
      : null;

    const endDate = req.query.endDate
      ? new Date(`${req.query.endDate}T23:59:59.999`)
      : null;

    if (
      (startDate && Number.isNaN(startDate.getTime())) ||
      (endDate && Number.isNaN(endDate.getTime()))
    ) {
      throw new HttpError(400, 'Invalid bin card date range');
    }

    if (startDate && endDate && startDate > endDate) {
      throw new HttpError(400, 'Start date cannot be after end date');
    }


const beforePeriod = startDate
  ? allMovements.filter(
      (movement) => movement.createdAt < startDate,
    )
  : [];

const movements = allMovements.filter((movement) => {
  if (startDate && movement.createdAt < startDate) {
    return false;
  }

  if (endDate && movement.createdAt > endDate) {
    return false;
  }

  return true;
});

// StockMovement quantities are signed:
// positive = stock increase, negative = stock decrease.
const signedQuantity = (
  rows: typeof allMovements,
) =>
  rows.reduce(
    (sum, movement) =>
      sum + Number(movement.quantity),
    0,
  );

// Reconstruct historical balances from current stock.
// This avoids mixing store-specific movement.balance values
// with the inventory-wide balance.
const currentStock = Number(item.quantity);

const movementsFromStart = startDate
  ? allMovements.filter(
      (movement) => movement.createdAt >= startDate,
    )
  : allMovements;

const movementsAfterEnd = endDate
  ? allMovements.filter(
      (movement) => movement.createdAt > endDate,
    )
  : [];

const openingBalance =
  currentStock - signedQuantity(movementsFromStart);

const closingBalance =
  currentStock - signedQuantity(movementsAfterEnd);

const isReturn = (type: string) =>
  type.includes('RETURN');

const stockIn = movements
  .filter(
    (movement) =>
      Number(movement.quantity) > 0 &&
      !isReturn(movement.type),
  )
  .reduce(
    (sum, movement) =>
      sum + Number(movement.quantity),
    0,
  );

const stockOut = movements
  .filter(
    (movement) => Number(movement.quantity) < 0,
  )
  .reduce(
    (sum, movement) =>
      sum + Math.abs(Number(movement.quantity)),
    0,
  );

const returns = movements
  .filter(
    (movement) =>
      Number(movement.quantity) > 0 &&
      isReturn(movement.type),
  )
  .reduce(
    (sum, movement) =>
      sum + Number(movement.quantity),
    0,
  );


    // Preserve existing role-based price visibility.
    const seeCost = canSeeCost(req.user?.role);

    const safeItem = seeCost
      ? item
      : stripPrices(item);

    // Movement values use the current selling price because
    // StockMovement does not currently store historical unit prices.
    const sellingPrice = seeCost
      ? Number(item.sellPrice)
      : null;

    const movementRows = movements.map((movement) => {
      const quantity = Number(movement.quantity);
      const value =
        sellingPrice === null
          ? null
          : Math.abs(quantity) * sellingPrice;

      return {
        ...movement,
        inQuantity: quantity > 0 ? quantity : 0,
        outQuantity: quantity < 0 ? Math.abs(quantity) : 0,
        inValue: quantity > 0 ? value : 0,
        outValue: quantity < 0 ? value : 0,
      };
    });

    res.json({
      item: safeItem,
      movements: movementRows,
      summary: {
        openingBalance,
        stockIn,
        stockOut,
        returns,
        closingBalance,
        ...(seeCost
          ? {
              sellingPrice,
              stockValue:
              closingBalance * sellingPrice!,
            }
          : {}),
      },
    });
  }),
);

// ───── Stock Adjustments ─────

const adjustmentReasonCategories = [
  'Damaged Goods',
  'Theft/Loss',
  'Expired Items',
  'Inventory Count Adjustment',
  'Quality Issue',
  'Other',
] as const;

const adjustmentReasonSchema = z.enum(adjustmentReasonCategories);

/**
 * Create an inventory-level adjustment request.
 * Stock is not changed until the request is approved.
 */
inventoryRouter.post(
  '/items/:id/adjust',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        delta: z.coerce.number().finite().refine((n) => n !== 0),
        reason: z.string().trim().min(3),
        reasonCategory: adjustmentReasonSchema,
        notes: z.string().optional().default(''),
      }),
      req.body,
    );

    const adjustment = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id: req.params.id },
      });

      if (!item) {
        throw new HttpError(404, 'Inventory item not found');
      }

      return tx.stockAdjustment.create({
        data: {
          adjustmentNumber: await nextAdjustmentNumber(tx),
          itemId: item.id,
          delta: new Prisma.Decimal(b.delta),
          reason: b.reason,
          reasonCategory: b.reasonCategory,
          notes: b.notes.trim() || null,
          requestedById: req.user!.id,
        },
      });
    });

    res.status(201).json(adjustment);
  }),
);

/**
 * List stock adjustment requests.
 * Optional filters: status, type, dateFrom, dateTo.
 */
inventoryRouter.get(
  '/adjustments',
  requireRole('STOREKEEPER', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const filters = parse(
      z.object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        type: z.enum(['INCREASE', 'DECREASE']).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
      req.query,
    );

    const createdAt: Prisma.DateTimeFilter = {};

    if (filters.dateFrom) {
      const from = new Date(`${filters.dateFrom}T00:00:00.000`);
      if (Number.isNaN(from.getTime())) {
        throw new HttpError(400, 'Invalid start date');
      }
      createdAt.gte = from;
    }

    if (filters.dateTo) {
      const to = new Date(`${filters.dateTo}T23:59:59.999`);
      if (Number.isNaN(to.getTime())) {
        throw new HttpError(400, 'Invalid end date');
      }
      createdAt.lte = to;
    }

    const rows = await prisma.stockAdjustment.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type === 'INCREASE'
          ? { delta: { gt: 0 } }
          : filters.type === 'DECREASE'
            ? { delta: { lt: 0 } }
            : {}),
        ...(filters.dateFrom || filters.dateTo ? { createdAt } : {}),
      },
      include: {
        item: true,
        requestedBy: { select: { username: true } },
        store: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const seeCost = canSeeCost(req.user?.role);

    res.json(
      rows.map((row) => {
        const {
          unitCostSnapshot,
          totalValue,
          ...safeRow
        } = row;

        return {
          ...safeRow,
          item: seeCost ? row.item : stripPrices(row.item),
          ...(seeCost ? { unitCostSnapshot, totalValue } : {}),
          type: row.delta.gt(0) ? 'INCREASE' : 'DECREASE',
        };
      }),
    );
  }),
);

/**
 * Get one adjustment and its historical stock information.
 */
inventoryRouter.get(
  '/adjustments/:id',
  requireRole('STOREKEEPER', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const adjustment = await prisma.stockAdjustment.findUnique({
      where: { id: req.params.id },
      include: {
        item: { include: { category: true } },
        store: true,
        requestedBy: { select: { id: true, username: true } },
      },
    });

    if (!adjustment) {
      throw new HttpError(404, 'Stock adjustment not found');
    }

    const decidedBy = adjustment.approvedById
      ? await prisma.user.findUnique({
          where: { id: adjustment.approvedById },
          select: { id: true, username: true },
        })
      : null;

    const seeCost = canSeeCost(req.user?.role);

    const {
      unitCostSnapshot,
      totalValue,
      ...safeAdjustment
    } = adjustment;

    res.json({
      ...safeAdjustment,
      item: seeCost
        ? adjustment.item
        : stripPrices(adjustment.item),
      type: adjustment.delta.gt(0) ? 'INCREASE' : 'DECREASE',
      decidedBy,
      ...(seeCost ? { unitCostSnapshot, totalValue } : {}),
    });
  }),
);

/**
 * Approve or reject an adjustment.
 * Stock and historical snapshots are updated only on approval.
 */

/**
 * Approve or reject a stock adjustment.
 *
 * Locks the adjustment and affected stock records to prevent
 * concurrent approvals from applying the same stock balance.
 *
 * Historical snapshots are recorded only when approved.
 */
inventoryRouter.post(
  '/adjustments/:id/decide',
  requireRole('ACCOUNTANT', 'STOREKEEPER'),
  asyncHandler(async (req, res) => {
    const { approve } = parse(
      z.object({ approve: z.boolean() }),
      req.body,
    );

    const decided = await prisma.$transaction(async (tx) => {
      // Lock this adjustment so two users cannot decide it simultaneously.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "StockAdjustment"
        WHERE "id" = ${req.params.id}
        FOR UPDATE
      `;

      const adjustment = await tx.stockAdjustment.findUnique({
        where: { id: req.params.id },
      });

      if (!adjustment) {
        throw new HttpError(404, 'Stock adjustment not found');
      }

      if (adjustment.status !== 'PENDING') {
        throw new HttpError(409, 'Already decided');
      }

      // Four-eyes rule: requester cannot approve their own request,
      // except ADMIN.
      if (
        approve &&
        adjustment.requestedById === req.user!.id &&
        req.user!.role !== 'ADMIN'
      ) {
        throw new HttpError(
          403,
          'You cannot approve your own stock adjustment',
        );
      }

      let quantityBefore: Prisma.Decimal | null = null;
      let quantityAfter: Prisma.Decimal | null = null;
      let unitCostSnapshot: Prisma.Decimal | null = null;
      let totalValue: Prisma.Decimal | null = null;

      if (approve) {
        // Lock the inventory item to protect its cost snapshot
        // and serialize adjustments affecting this item.
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "InventoryItem"
          WHERE "id" = ${adjustment.itemId}
          FOR UPDATE
        `;

        const item = await tx.inventoryItem.findUnique({
          where: { id: adjustment.itemId },
        });

        if (!item) {
          throw new HttpError(404, 'Inventory item not found');
        }

        if (adjustment.storeId) {
          // Lock the store-specific stock record.
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "StoreItem"
            WHERE "storeId" = ${adjustment.storeId}
              AND "itemId" = ${adjustment.itemId}
            FOR UPDATE
          `;

          const storeItem = await tx.storeItem.findUnique({
            where: {
              storeId_itemId: {
                storeId: adjustment.storeId,
                itemId: adjustment.itemId,
              },
            },
          });

          if (!storeItem) {
            throw new HttpError(
              404,
              'This item is not registered in the selected store',
            );
          }

          quantityBefore = storeItem.quantity;
          quantityAfter = quantityBefore.add(adjustment.delta);

          if (quantityAfter.lt(0)) {
            throw new HttpError(
              409,
              'Adjustment would make store stock negative',
            );
          }

          const updatedStoreItem = await tx.storeItem.update({
            where: { id: storeItem.id },
            data: { quantity: quantityAfter },
          });

          await tx.stockMovement.create({
            data: {
              itemId: adjustment.itemId,
              storeId: adjustment.storeId,
              type: adjustment.delta.gt(0)
                ? 'ADJUSTMENT_IN'
                : 'ADJUSTMENT_OUT',
              quantity: adjustment.delta,
              balance: updatedStoreItem.quantity,
              reference: `ADJ:${adjustment.id}`,
              userId: req.user!.id,
            },
          });
        } else {
          // General inventory adjustment.
          quantityBefore = item.quantity;
          quantityAfter = quantityBefore.add(adjustment.delta);

          if (quantityAfter.lt(0)) {
            throw new HttpError(
              409,
              'Adjustment would make stock negative',
            );
          }

          const updatedItem = await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: quantityAfter },
          });

          await tx.stockMovement.create({
            data: {
              itemId: adjustment.itemId,
              type: adjustment.delta.gt(0)
                ? 'ADJUSTMENT_IN'
                : 'ADJUSTMENT_OUT',
              quantity: adjustment.delta,
              balance: updatedItem.quantity,
              reference: `ADJ:${adjustment.id}`,
              userId: req.user!.id,
            },
          });
        }

        // Preserve the cost at the time of approval.
        unitCostSnapshot = item.costPrice;

        totalValue = adjustment.delta
          .abs()
          .mul(unitCostSnapshot)
          .toDecimalPlaces(2);
      }

      // Record the decision and historical snapshots atomically.
      const result = await tx.stockAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          approvedById: req.user!.id,
          decidedAt: new Date(),

          ...(approve
            ? {
                quantityBefore: quantityBefore!,
                quantityAfter: quantityAfter!,
                unitCostSnapshot: unitCostSnapshot!,
                totalValue: totalValue!,
              }
            : {}),
        },
      });

      await audit(tx, {
        userId: req.user!.id,
        action: approve
          ? 'ADJUSTMENT_APPROVED'
          : 'ADJUSTMENT_REJECTED',
        entity: 'StockAdjustment',
        entityId: adjustment.id,
        meta: {
          adjustmentNumber: adjustment.adjustmentNumber,
          itemId: adjustment.itemId,
          storeId: adjustment.storeId,
          delta: Number(adjustment.delta),
          reason: adjustment.reason,
          reasonCategory: adjustment.reasonCategory,
          notes: adjustment.notes,
          requestedById: adjustment.requestedById,
          quantityBefore:
            quantityBefore !== null
              ? Number(quantityBefore)
              : null,
          quantityAfter:
            quantityAfter !== null
              ? Number(quantityAfter)
              : null,
          unitCostSnapshot:
            unitCostSnapshot !== null
              ? Number(unitCostSnapshot)
              : null,
          totalValue:
            totalValue !== null
              ? Number(totalValue)
              : null,
        },
      });

      return result;
    });

    res.json(decided);
  }),
);


/** Stock Position Report: grouped by category with totals. */
inventoryRouter.get(
  '/stock-position',
  inv,
  asyncHandler(async (req, res) => {
    const { categoryId, salesPointId, q } = req.query as Record<
      string,
      string | undefined
    >;

    const includeValuation = canSeeCost(req.user?.role);

    const items = await prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(salesPointId ? { salesPointId } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { category: true, salesPoint: true },
      orderBy: [{ categoryId: 'asc' }, { code: 'asc' }],
    });

    const groups = new Map<string, any>();

    items.forEach((i) => {
      const group = groups.get(i.category.name) ?? {
        category: i.category.name,
        items: [],
        ...(includeValuation ? { stockValue: D(0) } : {}),
      };

      const { costPrice, sellPrice, ...safeItem } = i;

      group.items.push({
        ...(includeValuation ? i : safeItem),
        status: status(i.quantity, i.minLevel),
        ...(includeValuation
          ? { value: i.quantity.times(costPrice) }
          : {}),
      });

      if (includeValuation) {
        group.stockValue = group.stockValue.plus(
          i.quantity.times(i.costPrice),
        );
      }

      groups.set(i.category.name, group);
    });

    const totals = {
      items: items.length,
      lowStock: items.filter(
        (i) => status(i.quantity, i.minLevel) === 'LOW',
      ).length,
      outOfStock: items.filter(
        (i) => status(i.quantity, i.minLevel) === 'OUT',
      ).length,
      ...(includeValuation
        ? {
            stockValue: items.reduce(
              (sum, i) => sum.plus(i.quantity.times(i.costPrice)),
              D(0),
            ),
            sellingValue: items.reduce(
              (sum, i) => sum.plus(i.quantity.times(i.sellPrice)),
              D(0),
            ),
          }
        : {}),
    };

    res.json({
      totals,
      groups: [...groups.values()],
    });
  }),
);

// ───── Stores (bulk) ─────

export const storesRouter = Router();

storesRouter.get(
  '/', inv,
  asyncHandler(async (_q, res) =>
    res.json(await prisma.store.findMany({ orderBy: { name: 'asc' } })),
  ),
);

storesRouter.post(
  '/',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1),
        description: z.string().trim().optional().nullable(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );

    res.status(201).json(
      await prisma.store.create({
        data: {
          name: b.name,
          description: b.description || null,
          isActive: b.isActive ?? true,
        },
      }),
    );
  }),
);


// Update store name, description and active status.
storesRouter.patch(
  '/:storeId',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).optional(),
        description: z.string().trim().nullable().optional(),
        isActive: z.boolean().optional(),
      }).refine(
        (data) => Object.keys(data).length > 0,
        'Provide at least one field to update',
      ),
      req.body,
    );

    const existing = await prisma.store.findUnique({
      where: { id: req.params.storeId },
    });

    if (!existing) {
      throw new HttpError(404, 'Store not found');
    }

    res.json(
      await prisma.store.update({
        where: { id: existing.id },
        data: b,
      }),
    );
  }),
);

// List the items belonging to one store.
storesRouter.get(
  '/:storeId/items',
  inv,
  asyncHandler(async (req, res) => {
    const store = await prisma.store.findUnique({
      where: { id: req.params.storeId },
      select: { id: true },
    });

    if (!store) {
      throw new HttpError(404, 'Store not found');
    }

    const q = String(req.query.q || '').trim();

    const rows = await prisma.storeItem.findMany({
      where: {
        storeId: store.id,
        ...(q
          ? {
              item: {
                name: { contains: q, mode: 'insensitive' },
              },
            }
          : {}),
      },
      include: {
        item: { include: { category: true } },
      },
      orderBy: { item: { name: 'asc' } },
    });

    const seeCost = canSeeCost(req.user?.role);

    res.json(
      rows.map((row) => ({
        ...row,
        item: seeCost ? row.item : stripPrices(row.item),
        status: status(row.quantity, row.minLevel),
      })),
    );
  }),
);

// Add an existing inventory item to a store.
storesRouter.post(
  '/:storeId/items',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().min(0).default(0),
        minLevel: z.coerce.number().min(0).default(10),
      }),
      req.body,
    );

    const store = await prisma.store.findUnique({
      where: { id: req.params.storeId },
    });

    if (!store) {
      throw new HttpError(404, 'Store not found');
    }

    if (!store.isActive) {
      throw new HttpError(400, 'You cannot add items to an inactive store');
    }

    await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: b.itemId },
    });

    const existing = await prisma.storeItem.findUnique({
      where: {
        storeId_itemId: {
          storeId: store.id,
          itemId: b.itemId,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, 'This item already exists in the store');
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.storeItem.create({
        data: {
          storeId: store.id,
          itemId: b.itemId,
          quantity: b.quantity,
          minLevel: b.minLevel,
        },
        include: {
          item: { include: { category: true } },
        },
      });

      if (b.quantity > 0) {
        await tx.stockMovement.create({
          data: {
            itemId: b.itemId,
            storeId: store.id,
            type: 'ADJUSTMENT_IN',
            quantity: b.quantity,
            balance: row.quantity,
            reference: 'INITIAL STORE STOCK',
            userId: req.user!.id,
          },
        });
      }

      return row;
    });

    const seeCost = canSeeCost(req.user?.role);

    res.status(201).json({
      ...created,
      item: seeCost ? created.item : stripPrices(created.item),
      status: status(created.quantity, created.minLevel),
    });
  }),
);

// Update a store item's minimum stock level.
storesRouter.patch(
  '/:storeId/items/:itemId',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        minLevel: z.coerce.number().min(0),
      }),
      req.body,
    );

    const row = await prisma.storeItem.findUnique({
      where: {
        storeId_itemId: {
          storeId: req.params.storeId,
          itemId: req.params.itemId,
        },
      },
    });

    if (!row) {
      throw new HttpError(404, 'Store item not found');
    }

    const updated = await prisma.storeItem.update({
      where: { id: row.id },
      data: { minLevel: b.minLevel },
      include: {
        item: { include: { category: true } },
      },
    });

    const seeCost = canSeeCost(req.user?.role);

    res.json({
      ...updated,
      item: seeCost ? updated.item : stripPrices(updated.item),
      status: status(updated.quantity, updated.minLevel),
    });
  }),
);


storesRouter.get(
  '/items',
  inv,
  asyncHandler(async (req, res) => {
    const { storeId, q } = req.query as Record<
      string,
      string | undefined
    >;

    const paginationRequested =
      req.query.page !== undefined ||
      req.query.pageSize !== undefined;

    const { skip, take } = page(req.query, 50);

    const where = {
      ...(storeId ? { storeId } : {}),
      ...(q?.trim()
        ? {
            item: {
              name: {
                contains: q.trim(),
                mode: 'insensitive' as const,
              },
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.storeItem.count({ where }),
      prisma.storeItem.findMany({
        where,
        skip: paginationRequested ? skip : undefined,
        take: paginationRequested ? take : undefined,
        include: {
          store: true,
          item: { include: { category: true } },
        },
        orderBy: [
          { store: { name: 'asc' } },
          { item: { name: 'asc' } },
        ],
      }),
    ]);

    const seeCost = canSeeCost(req.user?.role);

    const formattedRows = rows.map((row) => ({
      ...row,
      item: seeCost ? row.item : stripPrices(row.item),
      status: status(row.quantity, row.minLevel),
    }));

    if (paginationRequested) {
      return res.json({
        total,
        rows: formattedRows,
      });
    }

    return res.json(formattedRows);
  }),
);



storesRouter.get(
  '/bin-card',
  inv,
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      storeId: z.string().trim().min(1),
      itemId: z.string().trim().min(1),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    });

    const b = parse(querySchema, req.query);

    const storeItem = await prisma.storeItem.findUnique({
      where: {
        storeId_itemId: {
          storeId: b.storeId,
          itemId: b.itemId,
        },
      },
      include: {
        store: true,
        item: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!storeItem) {
      throw new HttpError(404, 'This item does not exist in the selected store');
    }

    const parseDate = (value?: string, end = false) => {
      if (!value) return null;

      const date = new Date(
        `${value}T${end ? '23:59:59.999' : '00:00:00.000'}`,
      );

      if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, 'Invalid bin card date');
      }

      return date;
    };

    const startDate = parseDate(b.startDate);
    const endDate = parseDate(b.endDate, true);

    if (startDate && endDate && startDate > endDate) {
      throw new HttpError(400, 'Start date cannot be after end date');
    }

    const where = {
      storeId: b.storeId,
      itemId: b.itemId,
    };


const allMovements = await prisma.stockMovement.findMany({
  where: {
    storeId: b.storeId,
    itemId: b.itemId,
  },
  orderBy: [
    { createdAt: 'asc' },
    { id: 'asc' },
  ],
});


    const beforePeriod = startDate
      ? allMovements.filter(
          (movement) => movement.createdAt < startDate,
        )
      : [];

    const movements = allMovements.filter((movement) => {
      if (startDate && movement.createdAt < startDate) {
        return false;
      }

      if (endDate && movement.createdAt > endDate) {
        return false;
      }

      return true;
    });

    const openingBalance = beforePeriod.length
      ? Number(beforePeriod[beforePeriod.length - 1].balance)
      : allMovements.length
        ? Number(allMovements[0].balance) -
          Number(allMovements[0].quantity)
        : Number(storeItem.quantity);

    const isReturn = (type: string) =>
      type.includes('RETURN');

    const isAdjustment = (type: string) =>
      type.includes('ADJUSTMENT');

    const isPurchase = (type: string) =>
      type === 'PURCHASE' || type === 'OPENING';

    const isIssue = (type: string) =>
      type === 'ISSUE' || type === 'TRANSFER_OUT';

    const sumQuantity = (
      rows: typeof movements,
      positive: boolean,
    ) =>
      rows.reduce((sum, movement) => {
        const qty = Number(movement.quantity);

        return sum + (
          positive ? Math.max(qty, 0) : Math.max(-qty, 0)
        );
      }, 0);

    const stockIn = movements.filter(
      (m) => Number(m.quantity) > 0 && !isReturn(m.type),
    );

    const stockOut = movements.filter(
      (m) => Number(m.quantity) < 0 && !isReturn(m.type),
    );

    const adjustmentMovements = movements.filter(
      (m) => isAdjustment(m.type),
    );

    const purchaseMovements = movements.filter(
      (m) => isPurchase(m.type),
    );

    const issueMovements = movements.filter(
      (m) => isIssue(m.type),
    );

    const returnMovements = movements.filter(
      (m) => isReturn(m.type),
    );

    const closingBalance = movements.length
      ? Number(movements[movements.length - 1].balance)
      : openingBalance;

    const seeCost = canSeeCost(req.user?.role);

    const costPrice = seeCost
      ? Number(storeItem.item.costPrice)
      : null;

    const movementRows = movements.map((movement) => {
      const quantity = Number(movement.quantity);

      return {
        id: movement.id,
        createdAt: movement.createdAt,
        reference: movement.reference,
        type: movement.type,
        quantity,
        balance: Number(movement.balance),
        inQuantity: Math.max(quantity, 0),
        outQuantity: Math.max(-quantity, 0),

        // Historical transaction prices are not stored in StockMovement.
        // These are explicitly marked as current-cost estimates.
        inValue:
          seeCost && quantity > 0
            ? quantity * costPrice!
            : null,

        outValue:
          seeCost && quantity < 0
            ? Math.abs(quantity) * costPrice!
            : null,

        balanceValue:
          seeCost
            ? Number(movement.balance) * costPrice!
            : null,

        valueBasis: seeCost ? 'CURRENT_COST_ESTIMATE' : null,
      };
    });

    const seeLastMovement = allMovements.length > 0;

    res.json({
      item: {
        id: storeItem.item.id,
        name: storeItem.item.name,
        description: storeItem.item.description,
        category: storeItem.item.category,
        store: storeItem.store,
        quantity: Number(storeItem.quantity),
        minLevel: Number(storeItem.minLevel),

        ...(seeCost
          ? {
              costPrice,
              stockValue:
                Number(storeItem.quantity) * costPrice!,
            }
          : {}),
      },

      movements: movementRows,

      summary: {
        currentStock: Number(storeItem.quantity),
        openingBalance,
        closingBalance,

        purchases: sumQuantity(purchaseMovements, true),

        issues: sumQuantity(issueMovements, false),

        adjustments: sumQuantity(adjustmentMovements, true) -
          sumQuantity(adjustmentMovements, false),

        returns: sumQuantity(returnMovements, true),

        totalStockIn: sumQuantity(stockIn, true),
        totalStockOut: sumQuantity(stockOut, false),

        lastMovement: seeLastMovement
          ? allMovements[allMovements.length - 1].createdAt
          : null,

        ...(seeCost
          ? {
              averageCost: costPrice,
              totalStockValue:
                Number(storeItem.quantity) * costPrice!,
              valuationBasis: 'CURRENT_COST_ESTIMATE',
            }
          : {}),
      },
    });
  }),
);


storesRouter.post(
  '/adjust',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z
        .object({
          storeId: z.string().min(1),
          itemId: z.string().min(1),

          // New interface sends type + quantity.
          type: z.enum(['INCREASE', 'DECREASE']).optional(),
          quantity: z.coerce.number().positive().finite().optional(),

          // Retain compatibility with existing callers that send delta.
          delta: z.coerce.number().finite().refine((n) => n !== 0).optional(),

          reason: z.string().trim().min(3),
          reasonCategory: adjustmentReasonSchema.default('Other'),
          notes: z.string().optional().default(''),
        })
        .refine(
          (value) =>
            value.delta !== undefined ||
            (value.type !== undefined && value.quantity !== undefined),
          {
            message: 'Provide an adjustment type and quantity',
          },
        ),
      req.body,
    );

    const delta =
      b.delta ??
      (b.type === 'INCREASE' ? b.quantity! : -b.quantity!);

    const adjustment = await prisma.$transaction(async (tx) => {
      const storeItem = await tx.storeItem.findUnique({
        where: {
          storeId_itemId: {
            storeId: b.storeId,
            itemId: b.itemId,
          },
        },
      });

      if (!storeItem) {
        throw new HttpError(
          404,
          'This item is not registered in the selected store',
        );
      }

      return tx.stockAdjustment.create({
        data: {
          adjustmentNumber: await nextAdjustmentNumber(tx),
          storeId: b.storeId,
          itemId: b.itemId,
          delta: new Prisma.Decimal(delta),
          reason: b.reason,
          reasonCategory: b.reasonCategory,
          notes: b.notes.trim() || null,
          requestedById: req.user!.id,
        },
      });
    });

    res.status(201).json(adjustment);
  }),
);

storesRouter.post(
  '/transfers',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        fromStoreId: z.string(),
        toStoreId: z.string(),
        itemId: z.string(),
        quantity: z.coerce.number().positive(),
      }),
      req.body,
    );

    if (b.fromStoreId === b.toStoreId) {
      throw new HttpError(400, 'Choose two different stores');
    }

    res.status(201).json(
      await prisma.$transaction(async (tx) => {
        const from = await tx.storeItem.findUnique({
          where: {
            storeId_itemId: {
              storeId: b.fromStoreId,
              itemId: b.itemId,
            },
          },
        });

        if (!from || from.quantity.lt(b.quantity)) {
          throw new HttpError(409, 'Not enough stock in the source store');
        }

        const f = await tx.storeItem.update({
          where: { id: from.id },
          data: { quantity: { decrement: b.quantity } },
        });

        const t = await tx.storeItem.upsert({
          where: {
            storeId_itemId: {
              storeId: b.toStoreId,
              itemId: b.itemId,
            },
          },
          update: { quantity: { increment: b.quantity } },
          create: {
            storeId: b.toStoreId,
            itemId: b.itemId,
            quantity: b.quantity,
          },
        });

        await tx.stockMovement.createMany({
          data: [
            {
              itemId: b.itemId,
              storeId: b.fromStoreId,
              type: 'TRANSFER_OUT',
              quantity: D(b.quantity).neg(),
              balance: f.quantity,
              userId: req.user!.id,
            },
            {
              itemId: b.itemId,
              storeId: b.toStoreId,
              type: 'TRANSFER_IN',
              quantity: b.quantity,
              balance: t.quantity,
              userId: req.user!.id,
            },
          ],
        });

        return tx.stockTransfer.create({ data: b });
      }),
    );
  }),
);

/** Issue from store to a sales point (adds to the sellable item's stock). */
storesRouter.post(
  '/issues',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        storeId: z.string(),
        itemId: z.string(),
        salesPointId: z.string(),
        quantity: z.coerce.number().positive(),
        notes: z.string().trim().max(1000).optional().nullable(),
        issueDate: z.coerce.date().optional(),
      }),
      req.body,
    );

    const store = await prisma.store.findUnique({
      where: { id: b.storeId },
    });

    if (!store) {
      throw new HttpError(404, 'Store not found');
    }

    if (!store.isActive) {
      throw new HttpError(400, 'Stock cannot be issued from an inactive store');
    }

    const { issueDate, ...issueData } = b;

    res.status(201).json(
      await prisma.$transaction(async (tx) => {
        const si = await tx.storeItem.findUnique({
          where: {
            storeId_itemId: {
              storeId: b.storeId,
              itemId: b.itemId,
            },
          },
        });

        if (!si || si.quantity.lt(b.quantity)) {
          throw new HttpError(409, 'Not enough stock in the store');
        }

        const s = await tx.storeItem.update({
          where: { id: si.id },
          data: { quantity: { decrement: b.quantity } },
        });

        const it = await tx.inventoryItem.update({
          where: { id: b.itemId },
          data: { quantity: { increment: b.quantity } },
        });

        await tx.stockMovement.createMany({
          data: [
            {
              itemId: b.itemId,
              storeId: b.storeId,
              type: 'ISSUE',
              quantity: D(b.quantity).neg(),
              balance: s.quantity,
              userId: req.user!.id,
            },
            {
              itemId: b.itemId,
              type: 'ADJUSTMENT_IN',
              quantity: b.quantity,
              balance: it.quantity,
              reference: 'STORE ISSUE',
              userId: req.user!.id,
            },
          ],
        });

       // Generate a unique daily issue number using the existing
// transaction-safe daily numbering counter.
const adjustmentNumber = await nextAdjustmentNumber(tx);
const issueNo = adjustmentNumber.replace(/^ADJ-/, 'ISS-');

return tx.stockIssue.create({
  data: {
    ...issueData,

    issueNo,
    issuedById: req.user!.id,
    status: 'COMPLETED',

    // Preserve the item's cost at the time of issuing.
    unitCostSnapshot: it.costPrice,

    // Preserve the total stock value at the time of issuing.
    totalValue: D(b.quantity).mul(it.costPrice),

    ...(issueDate ? { createdAt: issueDate } : {}),
  },
});
      }),
    );
  }),
);

/**
 * List stock issues with search and status filters.
 */
storesRouter.get(
  '/issues',
  inv,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    const rows = await prisma.stockIssue.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(q
          ? {
              OR: [
                { issueNo: { contains: q, mode: 'insensitive' } },
                { item: { name: { contains: q, mode: 'insensitive' } } },
                { store: { name: { contains: q, mode: 'insensitive' } } },
                { salesPoint: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        store: true,
        item: { include: { category: true } },
        salesPoint: true,
        issuedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const seeCost = canSeeCost(req.user?.role);

    res.json(
      rows.map((issue) => {
        const {
          unitCostSnapshot,
          totalValue,
          ...safeIssue
        } = issue;

        return {
          ...safeIssue,
          ...(seeCost
            ? { unitCostSnapshot, totalValue }
            : {}),
        };
      }),
    );
  }),
);

/**
 * Get one stock issue for its details and receipt pages.
 */
storesRouter.get(
  '/issues/:id',
  inv,
  asyncHandler(async (req, res) => {
    const issue = await prisma.stockIssue.findUnique({
      where: { id: req.params.id },
      include: {
        store: true,
        item: { include: { category: true } },
        salesPoint: true,
        issuedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });

    if (!issue) {
      throw new HttpError(404, 'Stock issue not found');
    }

    const seeCost = canSeeCost(req.user?.role);

    const {
      unitCostSnapshot,
      totalValue,
      ...safeIssue
    } = issue;

    res.json({
      ...safeIssue,
      ...(seeCost
        ? { unitCostSnapshot, totalValue }
        : {}),
    });
  }),
);

storesRouter.get(
  '/transfers', inv,
  asyncHandler(async (_q, res) =>
    res.json(
      await prisma.stockTransfer.findMany({
        include: { from: true, to: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ),
  ),
);

/**
 * Return filter dropdown data.
 */
storesRouter.get(
  '/returns/filter-options',
  inv,
  asyncHandler(async (_req, res) => {
    const salesPoints = await prisma.salesPoint.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ salesPoints });
  }),
);

/**
 * Completed store issuances with stock still available for return.
 *
 * Pending returns reserve quantity. Rejected returns do not.
 */
storesRouter.get(
  '/returns/eligible-issues',
  inv,
  asyncHandler(async (req, res) => {
    const issues = await prisma.stockIssue.findMany({
      include: {
        store: true,
        item: true,
        salesPoint: true,
        returns: {
          where: {
            status: { not: 'REJECTED' },
          },
          select: {
            quantity: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const seeCost = canSeeCost(req.user?.role);

    const eligible = issues
      .map((issue) => {
        const returnedQuantity = issue.returns.reduce(
          (total, stockReturn) => total.plus(stockReturn.quantity),
          D(0),
        );

        const remainingQuantity =
          issue.quantity.minus(returnedQuantity);

        return {
          id: issue.id,
          createdAt: issue.createdAt,
          quantity: issue.quantity.toNumber(),
          returnedQuantity: returnedQuantity.toNumber(),
          remainingQuantity: remainingQuantity.toNumber(),
          notes: issue.notes,
          store: issue.store,
          item: seeCost
            ? issue.item
            : stripPrices(issue.item),
          salesPoint: issue.salesPoint,
        };
      })
      .filter((issue) => issue.remainingQuantity > 0);

    res.json(eligible);
  }),
);

/**
 * List stock returns with filters.
 */
storesRouter.get(
  '/returns',
  inv,
  asyncHandler(async (req, res) => {
    const statusFilter = String(req.query.status || '').trim();
    const salesPointId = String(req.query.salesPointId || '').trim();
    const q = String(req.query.q || '').trim();

    const dateFromValue = String(req.query.dateFrom || '').trim();
    const dateToValue = String(req.query.dateTo || '').trim();

    const dateFrom = dateFromValue
      ? new Date(`${dateFromValue}T00:00:00.000Z`)
      : undefined;

    const dateTo = dateToValue
      ? new Date(`${dateToValue}T23:59:59.999Z`)
      : undefined;

    if (
      (dateFrom && Number.isNaN(dateFrom.getTime())) ||
      (dateTo && Number.isNaN(dateTo.getTime()))
    ) {
      throw new HttpError(400, 'Invalid date filter');
    }

    const where: Prisma.StockReturnWhereInput = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(salesPointId ? { salesPointId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              {
                returnNo: {
                  contains: q,
                  mode: 'insensitive',
                },
              },
              {
                item: {
                  is: {
                    name: {
                      contains: q,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const rows = await prisma.stockReturn.findMany({
      where,
      include: {
        item: true,
        salesPoint: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const seeCost = canSeeCost(req.user?.role);

    res.json(
      rows.map((r) => ({
        ...(!seeCost
          ? (({ amount, ...safeReturn }) => safeReturn)(r)
          : r),
        item: seeCost ? r.item : stripPrices(r.item),
      })),
    );
  }),
);

/**
 * Create a pending stock return against an actual store issuance.
 */
storesRouter.post(
  '/returns',
  inv,
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        stockIssueId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        disposition: z.enum(['RESTOCK', 'DAMAGED', 'EXPIRED']),
      }),
      req.body,
    );

    const created = await prisma.$transaction(
      async (tx) => {
        const issue = await tx.stockIssue.findUnique({
          where: { id: b.stockIssueId },
          include: {
            item: true,
            returns: {
              where: {
                status: { not: 'REJECTED' },
              },
              select: {
                quantity: true,
              },
            },
          },
        });

        if (!issue) {
          throw new HttpError(404, 'Stock issuance not found');
        }

        const returnedQuantity = issue.returns.reduce(
          (total, stockReturn) => total.plus(stockReturn.quantity),
          D(0),
        );

        const remainingQuantity =
          issue.quantity.minus(returnedQuantity);

        if (remainingQuantity.lte(0)) {
          throw new HttpError(
            409,
            'This issuance has no stock remaining to return',
          );
        }

        if (D(b.quantity).gt(remainingQuantity)) {
          throw new HttpError(
            409,
            `Return quantity exceeds the remaining quantity of ${remainingQuantity.toString()}`,
          );
        }

        return tx.stockReturn.create({
          data: {
            stockIssueId: issue.id,
            itemId: issue.itemId,
            salesPointId: issue.salesPointId,
            quantity: b.quantity,
            disposition: b.disposition,
            returnNo: `RET-${Date.now().toString(36).toUpperCase()}`,
            amount: issue.item.costPrice.times(b.quantity),
          },
          include: {
            item: true,
            salesPoint: true,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    const seeCost = canSeeCost(req.user?.role);

    res.status(201).json(
      seeCost
        ? created
        : (({ amount, ...safeReturn }) => safeReturn)(created),
    );
  }),
);

storesRouter.get(
  '/stock-position', inv,
  asyncHandler(async (req, res) => {
    const includeValuation = canSeeCost(req.user?.role);

    const rows = await prisma.storeItem.findMany({
      include: {
        store: true,
        item: { include: { category: true } },
      },
    });

    const groups = new Map<string, any>();

    rows.forEach((r) => {
      const group = groups.get(r.item.category.name) ?? {
        category: r.item.category.name,
        items: [],
        ...(includeValuation ? { stockValue: D(0) } : {}),
      };

      const { costPrice, sellPrice, ...safeItem } = r.item;
      const { item, ...safeStoreItem } = r;

      const value = r.quantity.times(costPrice);

      group.items.push({
        ...safeStoreItem,
        item: includeValuation ? item : safeItem,
        status: status(r.quantity, r.minLevel),
        ...(includeValuation ? { value } : {}),
      });

      if (includeValuation) {
        group.stockValue = group.stockValue.plus(value);
      }

      groups.set(r.item.category.name, group);
    });

    const totals = {
      items: rows.length,
      lowStock: rows.filter(
        (r) => status(r.quantity, r.minLevel) === 'LOW',
      ).length,
      outOfStock: rows.filter(
        (r) => status(r.quantity, r.minLevel) === 'OUT',
      ).length,
      ...(includeValuation
        ? {
            stockValue: rows.reduce(
              (sum, r) =>
                sum.plus(r.quantity.times(r.item.costPrice)),
              D(0),
            ),
            sellingValue: rows.reduce(
              (sum, r) =>
                sum.plus(r.quantity.times(r.item.sellPrice)),
              D(0),
            ),
          }
        : {}),
    };

    res.json({
      totals,
      groups: [...groups.values()],
    });
  }),
);

// Store details and dashboard summary.
storesRouter.get(
  '/:storeId',
  inv,
  asyncHandler(async (req, res) => {
    const store = await prisma.store.findUnique({
      where: { id: req.params.storeId },
    });

    if (!store) {
      throw new HttpError(404, 'Store not found');
    }

    const rows = await prisma.storeItem.findMany({
      where: { storeId: store.id },
      include: {
        item: { include: { category: true } },
      },
    });

    const recentIssues = await prisma.stockIssue.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const issueItemIds = [...new Set(recentIssues.map((issue) => issue.itemId))];
    const issueItems = issueItemIds.length
      ? await prisma.inventoryItem.findMany({
          where: { id: { in: issueItemIds } },
          select: { id: true, name: true },
        })
      : [];

    const itemNames = new Map(issueItems.map((item) => [item.id, item.name]));
    const seeCost = canSeeCost(req.user?.role);

    const totalQuantity = rows.reduce(
      (sum, row) => sum.plus(row.quantity),
      D(0),
    );

    const totalValue = seeCost
      ? rows.reduce(
          (sum, row) => sum.plus(row.quantity.times(row.item.costPrice)),
          D(0),
        )
      : undefined;

    const lowStockItems = rows.filter(
      (row) => status(row.quantity, row.minLevel) === 'LOW',
    ).length;

    const outOfStockItems = rows.filter(
      (row) => status(row.quantity, row.minLevel) === 'OUT',
    ).length;

    res.json({
      store,
      summary: {
        totalItems: rows.length,
        totalQuantity,
        lowStockItems,
        outOfStockItems,
        ...(seeCost ? { totalValue } : {}),
      },
      recentIssues: recentIssues.map((issue) => ({
        ...issue,
        itemName: itemNames.get(issue.itemId) || issue.itemId,
      })),
    });
  }),
);
/**
 * Dedicated Store Stock Movement Report.
 *
 * Each row represents one item in one store.
 * General inventory movements (storeId: null) are excluded.
 * Valuation uses current item cost price, not historical transaction prices.
 */
inventoryRouter.get(
  '/stock-movement-report',
  inv,
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      storeId: z.string().optional(),
      categoryId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    });

    const filters = parse(querySchema, req.query);

    const parseReportDate = (
      value: string | undefined,
      end = false,
    ): Date | undefined => {
      if (!value) return undefined;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new HttpError(400, 'Invalid report date');
      }

      const date = new Date(
        `${value}T${end ? '23:59:59.999' : '00:00:00.000'}`,
      );

      if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, 'Invalid report date');
      }

      return date;
    };

    const startDate = parseReportDate(filters.startDate);
    const endDate = parseReportDate(filters.endDate, true);

    if (startDate && endDate && startDate > endDate) {
      throw new HttpError(
        400,
        'Start date cannot be later than end date',
      );
    }

    const seeCost = canSeeCost(req.user?.role);

    const storeItems = await prisma.storeItem.findMany({
      where: {
        ...(filters.storeId
          ? { storeId: filters.storeId }
          : {}),
        ...(filters.categoryId
          ? {
              item: {
                categoryId: filters.categoryId,
              },
            }
          : {}),
      },
      include: {
        store: true,
        item: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { store: { name: 'asc' } },
        { item: { category: { name: 'asc' } } },
        { item: { name: 'asc' } },
      ],
    });

    const storeIds = [
      ...new Set(storeItems.map((row) => row.storeId)),
    ];

    const itemIds = [
      ...new Set(storeItems.map((row) => row.itemId)),
    ];

    const movements =
      storeIds.length && itemIds.length
        ? await prisma.stockMovement.findMany({
            where: {
              storeId: { in: storeIds },
              itemId: { in: itemIds },
            },
            orderBy: {
              createdAt: 'asc',
            },
          })
        : [];

    const movementMap = new Map<string, typeof movements>();

    for (const movement of movements) {
      if (!movement.storeId) continue;

      const key = `${movement.storeId}:${movement.itemId}`;
      const existing = movementMap.get(key) ?? [];

      existing.push(movement);
      movementMap.set(key, existing);
    }

    const rows = storeItems.map((storeItem) => {
      const key = `${storeItem.storeId}:${storeItem.itemId}`;
      const itemMovements = movementMap.get(key) ?? [];

      const currentBalance = Number(storeItem.quantity);

      const movementsFromStart = startDate
        ? itemMovements.filter(
            (movement) => movement.createdAt >= startDate,
          )
        : itemMovements;

      const movementsThroughEnd = endDate
        ? itemMovements.filter(
            (movement) => movement.createdAt > endDate,
          )
        : [];

      const sumMovementQuantity = (
        list: typeof itemMovements,
      ) =>
        list.reduce(
          (sum, movement) => sum + Number(movement.quantity),
          0,
        );

      const openingBalance = startDate
        ? currentBalance - sumMovementQuantity(movementsFromStart)
        : 0;

      const closingBalance = endDate
        ? currentBalance - sumMovementQuantity(movementsThroughEnd)
        : currentBalance;

      const periodMovements = itemMovements.filter(
        (movement) =>
          (!startDate || movement.createdAt >= startDate) &&
          (!endDate || movement.createdAt <= endDate),
      );

      const totalIn = periodMovements.reduce(
        (sum, movement) =>
          sum +
          Math.max(Number(movement.quantity), 0),
        0,
      );

      const totalOut = periodMovements.reduce(
        (sum, movement) =>
          sum +
          Math.max(-Number(movement.quantity), 0),
        0,
      );

      const costPrice = Number(storeItem.item.costPrice);
      const sellPrice = Number(storeItem.item.sellPrice);

      return {
        itemId: storeItem.itemId,
        code: storeItem.item.code,
        itemName: storeItem.item.name,
        categoryId: storeItem.item.categoryId,
        category: storeItem.item.category.name,
        storeId: storeItem.storeId,
        store: storeItem.store.name,

        opening: openingBalance,
        stockIn: totalIn,
        stockOut: totalOut,
        balance: closingBalance,

        ...(seeCost
          ? {
              costPrice,
              sellPrice,
              value: closingBalance * costPrice,
              valueBasis: 'CURRENT_COST_ESTIMATE',
            }
          : {}),
      };
    });

    const groups = new Map<string, any>();

    for (const row of rows) {
      const group = groups.get(row.category) ?? {
        category: row.category,
        items: [],
        subtotal: {
          opening: 0,
          stockIn: 0,
          stockOut: 0,
          balance: 0,
          ...(seeCost ? { value: 0 } : {}),
        },
      };

      group.items.push(row);

      group.subtotal.opening += row.opening;
      group.subtotal.stockIn += row.stockIn;
      group.subtotal.stockOut += row.stockOut;
      group.subtotal.balance += row.balance;

      if (seeCost) {
        group.subtotal.value += row.value;
      }

      groups.set(row.category, group);
    }


const summary: {
  totalItems: number;
  totalIn: number;
  totalOut: number;
  newBalance: number;
  closingValue?: number;
} = rows.reduce(
  (total, row) => {
    total.totalIn += row.stockIn;
    total.totalOut += row.stockOut;
    total.newBalance += row.balance;

    if (seeCost) {
      total.closingValue =
        (total.closingValue ?? 0) + (row.value ?? 0);
    }

    return total;
  },
  {
    totalItems: rows.length,
    totalIn: 0,
    totalOut: 0,
    newBalance: 0,
    ...(seeCost ? { closingValue: 0 } : {}),
  },
);


    res.json({
      filters: {
        storeId: filters.storeId || null,
        categoryId: filters.categoryId || null,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
      },
      summary,
      groups: [...groups.values()],
      valueBasis: seeCost
        ? 'CURRENT_COST_ESTIMATE'
        : null,
    });
  }),
);
