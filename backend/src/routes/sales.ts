
import { Router } from 'express';
import { z } from 'zod';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { asyncHandler, page, parse, HttpError } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { createOrder, payOrder, voidOrder, updateOrderStatus, completeOrder } from '../services/orders';
import { notifyRoles, notifyStaff } from '../services/staffNotifications';

const pos = requireRole('WAITER', 'MANAGER');
const kitchen = requireRole('WAITER', 'CHEF', 'MANAGER');

export const salesPointsRouter = Router();

const manage = requireRole('ADMIN', 'MANAGER');

// POS and everyone: active only. Admin/Manager can pass ?all=true to also see deactivated ones.
salesPointsRouter.get('/', pos, asyncHandler(async (req, res) => {
  const editor = ['ADMIN', 'MANAGER'].includes(req.user!.role);
  const all = req.query.all === 'true' && editor;

  res.json(
    await prisma.salesPoint.findMany({
      where: all ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    }),
  );
}));

/** Management cards: every sales point with location and counts. */
salesPointsRouter.get('/overview', manage, asyncHandler(async (_q, res) => {
  const rows = await prisma.salesPoint.findMany({
    orderBy: { id: 'asc' }, // cuid ids sort by creation time; use { name: 'asc' } for A-Z
    include: { _count: { select: { items: true, folioTxs: true } } },
  });
  res.json(rows.map((s) => ({
    id: s.id, name: s.name, location: s.location, isActive: s.isActive,
    itemCount: s._count.items, transactionCount: s._count.folioTxs,
  })));
}));
salesPointsRouter.post('/', manage, asyncHandler(async (req, res) => {
  const { name, location } = parse(
    z.object({
      name: z.string().trim().min(1),
      location: z.string().trim().max(120).optional(),
    }),
    req.body,
  );

  try {
    res.status(201).json(
      await prisma.salesPoint.create({
        data: { name, location: location || null },
      }),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ message: 'A sales point with this name already exists' });
    }
    throw e;
  }
}));

salesPointsRouter.put('/:id', manage, asyncHandler(async (req, res) => {
  const { location, ...rest } = parse(
    z.object({
      name: z.string().trim().min(1).optional(),
      location: z.string().trim().max(120).optional(),
      isActive: z.boolean().optional(),
    }),
    req.body,
  );

  try {
    res.json(
      await prisma.salesPoint.update({
        where: { id: req.params.id },
        data: { ...rest, ...(location !== undefined ? { location: location || null } : {}) },
      }),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ message: 'A sales point with this name already exists' });
    }
    throw e;
  }
}));

// Delete if it has never been used; otherwise deactivate so orders,
// stock and folio history stay intact.
salesPointsRouter.delete('/:id', manage, asyncHandler(async (req, res) => {
  const id = req.params.id;

  const [items, orders, folioTxs, returns] = await Promise.all([
    prisma.inventoryItem.count({ where: { salesPointId: id } }),
    prisma.order.count({ where: { salesPointId: id } }),
    prisma.folioTransaction.count({ where: { salesPointId: id } }),
    prisma.stockReturn.count({ where: { salesPointId: id } }),
  ]);

  if (items + orders + folioTxs + returns > 0) {
    await prisma.salesPoint.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ deactivated: true });
  }

  await prisma.salesPoint.delete({ where: { id } });
  res.status(204).end();
}));
/** POS catalogue: only products available at the selected sales point. */
salesPointsRouter.get('/:id/catalog', pos, asyncHandler(async (req, res) => {
  const salesPoint = await prisma.salesPoint.findUnique({
    where: { id: req.params.id },
  });

  if (!salesPoint || !salesPoint.isActive) {
    throw new HttpError(404, 'Active sales point not found');
  }

  const rows = await prisma.inventoryItem.findMany({
    where: {
      salesPointId: salesPoint.id,
      isActive: true,
      category: { isActive: true },
      OR: [
        { menuProductId: null },
        {
          menuProduct: {
            isActive: true,
            availability: {
              some: {
                salesPointId: salesPoint.id,
                isAvailable: true,
              },
            },
          },
        },
      ],
    },
    include: {
      category: true,
      menuProduct: {
        include: {
          availability: {
            where: { salesPointId: salesPoint.id },
          },
        },
      },
      recipeLines: {
        include: { ingredient: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const items = rows.map(({ recipeLines, menuProduct, ...item }) => {
    const sellPrice = menuProduct?.sellPrice ?? item.sellPrice;

    const quantity = recipeLines.length
      ? D(
          Math.min(
            ...recipeLines.map((line) =>
              D(line.quantity).gt(0)
                ? Math.floor(
                    D(line.ingredient.quantity)
                      .div(line.quantity)
                      .toNumber(),
                  )
                : Infinity,
            ),
          ),
        )
      : item.quantity;

    return {
      ...item,
      menuProductId: menuProduct?.id ?? null,
      sellPrice,
      hasRecipe: recipeLines.length > 0,
      quantity,
    };
  });

  const categoryMap = new Map<
    string,
    {
      id: string;
      name: string;
      section: string;
      sortOrder: number;
      count: number;
    }
  >();

  for (const item of items) {
    const category = categoryMap.get(item.categoryId) ?? {
      id: item.categoryId,
      name: item.category.name,
      section: item.category.section,
      sortOrder: item.category.sortOrder,
      count: 0,
    };

    category.count++;
    categoryMap.set(item.categoryId, category);
  }

  const categories = [...categoryMap.values()].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  res.json({ categories, items });
}));

export const ordersRouter = Router();

const orderBody = z.object({
  customerType: z.enum(['WALK_IN', 'GUEST', 'GROUP']).default('WALK_IN'),
  guestId: z.string().optional(),
  groupId: z.string().optional(),
  salesPointId: z.string(),
  paymentMethod: z.enum([
    'CASH',
    'CARD',
    'TRANSFER',
    'ROOM_CHARGE',
    'STAFF_CREDIT',
    'CITY_LEDGER',
  ]).default('CASH'),
  items: z.array(
    z.object({
      itemId: z.string(),
      quantity: z.coerce.number().int().min(1),
      instructions: z.string().optional(),
    }),
  ).min(1),
  applyVat: z.boolean().default(false),
  applyServiceCharge: z.boolean().default(false),
  isComplimentary: z.boolean().default(false),
  isStaffCredit: z.boolean().default(false),
  payLater: z.boolean().default(false),
  instructions: z.string().optional(),
  notes: z.string().optional(),
});

ordersRouter.get('/', pos, asyncHandler(async (req, res) => {
  const { skip, take } = page(req.query);
  const { status, from, to } = req.query as Record<
    string,
    string | undefined
  >;

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status: status as OrderStatus } : {}),
    ...(from || to
      ? {
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(`${to}T23:59:59`) : undefined,
          },
        }
      : {}),
  };

  const [rows, grouped] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        staff: { select: { username: true } },
        guest: true,
        group: true,
        salesPoint: true,
      },
    }),
    prisma.order.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  res.json({
    summary: Object.fromEntries(
      grouped.map((g) => [g.status, g._count]),
    ),
    rows,
  });
}));

ordersRouter.get('/kitchen', kitchen, asyncHandler(async (_q, res) => {
  const include = {
    items: { include: { item: true } },
    salesPoint: true,
  };

  const [pending, ready] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] } },
      include,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.findMany({
      where: { status: 'READY' },
      include,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  res.json({ pending, ready });
}));

/** Unpaid bills / Credit Transactions */
ordersRouter.get('/credit', pos, asyncHandler(async (req, res) => {
  const {
    paymentStatus,
    guestId,
    groupId,
    salesPointId,
    from,
    to,
  } = req.query as Record<string, string | undefined>;

  const where: Prisma.OrderWhereInput = {
    paymentStatus: paymentStatus
      ? (paymentStatus as PaymentStatus)
      : { in: ['UNPAID', 'VOIDED'] },
    ...(guestId ? { guestId } : {}),
    ...(groupId ? { groupId } : {}),
    ...(salesPointId ? { salesPointId } : {}),
    ...(from || to
      ? {
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(`${to}T23:59:59`) : undefined,
          },
        }
      : {}),
  };

  const rows = await prisma.order.findMany({
    where,
    include: {
      salesPoint: true,
      guest: true,
      group: true,
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const outstanding = rows
    .filter((r) => r.paymentStatus === 'UNPAID')
    .reduce((s, r) => s.plus(r.total), D(0));

  res.json({
    outstanding,
    count: rows.filter((r) => r.paymentStatus === 'UNPAID').length,
    rows,
  });
}));

ordersRouter.get('/unpaid-count', pos, asyncHandler(async (_q, res) => {
  res.json({
    count: await prisma.order.count({
      where: { paymentStatus: 'UNPAID' },
    }),
  });
}));

ordersRouter.get('/:id', pos, asyncHandler(async (req, res) =>
  res.json(
    await prisma.order.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        items: { include: { item: true } },
        salesPoint: true,
        guest: true,
        group: true,
        staff: { select: { username: true } },
      },
    }),
  ),
));

ordersRouter.post('/', pos, asyncHandler(async (req, res) => {
  const rawKey = req.header('Idempotency-Key');

  if (
    rawKey !== undefined &&
    (rawKey.length < 16 || rawKey.length > 128)
  ) {
    throw new HttpError(400, 'Invalid Idempotency-Key header');
  }

  const order = await createOrder(
    parse(orderBody, req.body),
    req.user!.id,
    req.user!.role,
    rawKey,
  );

  res.status(201).json(order);
}));

// The chef must be able to advance order status.
ordersRouter.patch(
  '/:id/status',
  kitchen,
  asyncHandler(async (req, res) => {
    const { status } = parse(
      z.object({
        status: z.nativeEnum(OrderStatus),
      }),
      req.body,
    );

    if (status === 'CANCELLED') {
      throw new HttpError(
        400,
        'Use "Void order" to cancel an order',
      );
    }

    const updated = await updateOrderStatus(
      req.params.id,
      status,
      req.user!.id,
      req.user!.role,
    );

    // Notify the original waiter when kitchen staff mark
    // the order as ready.
    if (status === 'READY') {
      void notifyStaff(updated.staffId, {
        title: 'Order ready',
        body: `Order ${updated.orderNo} is ready for pickup.`,
        category: 'ORDERS',
        entityType: 'Order',
        entityId: updated.id,
        createdByUserId: req.user!.id,
      }).catch((error) => {
        console.error(
          '[Order Notification] Failed to notify waiter:',
          error,
        );
      });
    }

    res.json(updated);
  }),
);

ordersRouter.post(
  '/:id/complete',
  requireRole('WAITER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const completed = await completeOrder(
      req.params.id,
      req.user!.id,
    );

    res.json(completed);
  }),
);

ordersRouter.post('/:id/pay', pos, asyncHandler(async (req, res) => {
  const { method } = parse(
    z.object({
      method: z.enum(['CASH', 'CARD', 'TRANSFER']),
    }),
    req.body,
  );

  res.json(await payOrder(req.params.id, method, req.user!.id));
}));

// Voiding reverses money, so it stays with accounts.
ordersRouter.post(
  '/:id/void',
  requireRole('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const { reason } = parse(
      z.object({ reason: z.string().min(3) }),
      req.body,
    );

    const voided = await voidOrder(req.params.id, reason, req.user!.id);

    // Notify management after the void operation succeeds.
    void notifyRoles(
      ['ADMIN', 'MANAGER'],
      {
        title: 'Order voided',
        body: `Order ${voided.orderNo} (₦${Number(voided.total).toLocaleString()}) was voided: ${reason}`,
        category: 'ORDERS',
        entityType: 'Order',
        entityId: voided.id,
        createdByUserId: req.user!.id,
      },
      req.user!.id,
    ).catch((error) => {
      console.error('[Order Notification] Failed to notify management:', error);
    });

    res.json(voided);
  }),
);
