
import { Router } from 'express';
import { z } from 'zod';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { asyncHandler, page, parse , HttpError } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { createOrder, payOrder, voidOrder } from '../services/orders';

const pos = requireRole('WAITER', 'RECEPTIONIST');
const kitchen = requireRole('WAITER', 'RECEPTIONIST', 'CHEF');

export const salesPointsRouter = Router();

const manage = requireRole('ADMIN', 'MANAGER');

// POS and everyone: active only. Admin/Manager can pass ?all=true to also see deactivated ones.
salesPointsRouter.get('/', asyncHandler(async (req, res) => {
  const editor = ['ADMIN', 'MANAGER'].includes(req.user!.role);
  const all = req.query.all === 'true' && editor;

  res.json(
    await prisma.salesPoint.findMany({
      where: all ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    }),
  );
}));

salesPointsRouter.post('/', manage, asyncHandler(async (req, res) => {
  const { name } = parse(
    z.object({ name: z.string().trim().min(1) }),
    req.body,
  );

  try {
    res.status(201).json(
      await prisma.salesPoint.create({
        data: { name },
      }),
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return res.status(409).json({
        message: 'A sales point with this name already exists',
      });
    }

    throw e;
  }
}));

salesPointsRouter.put('/:id', manage, asyncHandler(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(1).optional(),
      isActive: z.boolean().optional(),
    }),
    req.body,
  );

  try {
    res.json(
      await prisma.salesPoint.update({
        where: { id: req.params.id },
        data,
      }),
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return res.status(409).json({
        message: 'A sales point with this name already exists',
      });
    }

    throw e;
  }
}));

// Delete if it has never been used; otherwise deactivate so orders, stock and folio history stay intact.
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

/** POS catalog: categories (with counts) and items for one sales point. */
salesPointsRouter.get('/:id/catalog', asyncHandler(async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    where: {
      salesPointId: req.params.id,
      isActive: true,
      category: { isActive: true },
    },
    include: { category: true, recipeLines: { include: { ingredient: true } } },
    orderBy: { name: 'asc' },
  });
  // A dish or shot has no stock of its own: show how many portions its ingredients allow, so the POS greys it out when it runs short.
  const catalog = items.map(({ recipeLines, ...i }) => recipeLines.length
    ? { ...i, hasRecipe: true, quantity: D(Math.min(...recipeLines.map((l) => (D(l.quantity).gt(0) ? Math.floor(D(l.ingredient.quantity).div(l.quantity).toNumber()) : Infinity))))  }
    : { ...i, hasRecipe: false });

  const cats = new Map<
    string,
    {
      id: string;
      name: string;
      section: string;
      sortOrder: number;
      count: number;
    }
  >();

  items.forEach((i) => {
    const c = cats.get(i.categoryId) ?? {
      id: i.categoryId,
      name: i.category.name,
      section: i.category.section,
      sortOrder: i.category.sortOrder,
      count: 0,
    };

    c.count++;
    cats.set(i.categoryId, c);
  });

  const categories = [...cats.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  res.json({ categories, items: catalog });
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

ordersRouter.get('/', asyncHandler(async (req, res) => {
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

ordersRouter.get('/kitchen', asyncHandler(async (_q, res) => {
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
ordersRouter.get('/credit', asyncHandler(async (req, res) => {
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

ordersRouter.get('/unpaid-count', asyncHandler(async (_q, res) => {
  res.json({
    count: await prisma.order.count({
      where: { paymentStatus: 'UNPAID' },
    }),
  });
}));

ordersRouter.get('/:id', asyncHandler(async (req, res) =>
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
ordersRouter.patch('/:id/status', kitchen, asyncHandler(async (req, res) => {
  const { status } = parse(
    z.object({ status: z.nativeEnum(OrderStatus) }),
    req.body,
  );

  // Cancelling must go through Void: it reverses the money and puts the stock back. A bare status change does neither.
  if (status === 'CANCELLED') throw new HttpError(400, 'Use "Void order" to cancel an order');
  const current = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id }, select: { paymentStatus: true } });
  if (current.paymentStatus === 'VOIDED') throw new HttpError(409, 'This order has been voided');
  res.json(
    await prisma.order.update({
      where: { id: req.params.id },
      data: { status },
    }),
  );
}));

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

    res.json(await voidOrder(req.params.id, reason, req.user!.id));
  }),
);
