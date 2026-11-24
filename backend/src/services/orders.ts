import { CustomerType, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { canApprove } from './policy';
import { D, prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { config } from '../config';
import {
  ACC,
  postJournal,
  reverseByReference,
  revenueAccountFor,
} from './accounting';
import { cashAccountFor, postFolioCharge } from './folio';
import { audit } from '../lib/audit';
import { checkCredit } from './receivables';
import { notifyRoles } from './staffNotifications';

export interface OrderInput {
  customerType: CustomerType;
  guestId?: string;
  groupId?: string;
  salesPointId: string;
  paymentMethod: PaymentMethod;
  items: {
    itemId: string;
    quantity: number;
    instructions?: string;
  }[];
  applyVat: boolean;
  applyServiceCharge: boolean;
  isComplimentary: boolean;
  isStaffCredit: boolean;
  payLater: boolean;
  instructions?: string;
  notes?: string;
}

async function nextOrderNo(tx: any) {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);

  const n =
    (await tx.order.count({
      where: { createdAt: { gte: start } },
    })) + 1;

  return `ORD-${ymd}-${String(n).padStart(4, '0')}`;
}

function hashOrderRequest(
  input: OrderInput,
  staffId: string,
): string {
  // Sort item lines so harmless ordering differences don't change the hash.
  const normalized = {
    staffId,
    customerType: input.customerType,
    guestId: input.guestId ?? null,
    groupId: input.groupId ?? null,
    salesPointId: input.salesPointId,
    paymentMethod: input.paymentMethod,
    items: [...input.items]
      .map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        instructions: item.instructions ?? null,
      }))
      .sort((a, b) =>
        a.itemId.localeCompare(b.itemId) ||
        (a.instructions ?? '').localeCompare(b.instructions ?? '') ||
        a.quantity - b.quantity
      ),
    applyVat: input.applyVat,
    applyServiceCharge: input.applyServiceCharge,
    isComplimentary: input.isComplimentary,
    isStaffCredit: input.isStaffCredit,
    payLater: input.payLater,
    instructions: input.instructions ?? null,
    notes: input.notes ?? null,
  };

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export async function createOrder(
  input: OrderInput,
  staffId: string,
  role?: string,
  idempotencyKey?: string,
) {
  if (input.isComplimentary && !canApprove(role)) {
    throw new HttpError(
      403,
      'Only a manager or admin can ring up a complimentary order',
    );
  }

  if (
    input.isComplimentary &&
    (input.notes ?? '').trim().length < 3
  ) {
    throw new HttpError(
      400,
      'Give a reason for the complimentary order',
    );
  }

  if (
    (input.isStaffCredit ||
      input.paymentMethod === 'STAFF_CREDIT') &&
    (input.notes ?? '').trim().length < 3
  ) {
    throw new HttpError(
      400,
      'Say which staff member is taking this on credit',
    );
  }
const requestHash = idempotencyKey
  ? hashOrderRequest(input, staffId)
  : undefined;

if (idempotencyKey && requestHash) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        'This idempotency key was already used for a different order',
      );
    }

    return existing;
  }
}

    try {
  const created = await prisma.$transaction(
    async (tx) => {
      const sp = await tx.salesPoint.findUnique({
        where: { id: input.salesPointId },
      });

      if (!sp || !sp.isActive) {
  throw new HttpError(404, 'Active sales point not found');
}

      if (!input.items.length) {
        throw new HttpError(400, 'Add at least one item');
      }

     const items = await tx.inventoryItem.findMany({
  where: {
    id: { in: input.items.map((item) => item.itemId) },
  },
  include: {
    category: true,
    menuProduct: {
      include: {
        availability: {
          where: {
            salesPointId: input.salesPointId,
          },
        },
      },
    },
    recipeLines: {
      include: {
        ingredient: true,
      },
    },
  },
});

      let subtotal = D(0);
      let cost = D(0);

      // Plain items deduct their own stock.
      // Recipe items deduct their ingredients.
      const uses: {
        id: string;
        name: string;
        qty: Prisma.Decimal;
        type: 'SALE' | 'RECIPE_USE';
        stock: Prisma.Decimal;
      }[] = [];
const lines = input.items.map((li) => {
  const it = items.find((item) => item.id === li.itemId);

  if (!it || it.salesPointId !== sp.id) {
    throw new HttpError(
      404,
      'Item not found at the selected sales point',
    );
  }

  if (!Number.isFinite(li.quantity) || li.quantity <= 0) {
    throw new HttpError(
      400,
      `Invalid quantity for ${it.name}`,
    );
  }

  if (!it.isActive || !it.category.isActive) {
    throw new HttpError(
      409,
      `${it.name} is inactive and cannot be sold`,
    );
  }

  const menuProduct = it.menuProduct;

  // Keep unlinked legacy inventory sellable during the migration.
  // Once linked, the shared product and its sales-point availability
  // must both permit sales.
  if (menuProduct) {
    if (!menuProduct.isActive) {
      throw new HttpError(
        409,
        `${it.name} is inactive in the central menu`,
      );
    }

    const availability = menuProduct.availability[0];

    if (!availability?.isAvailable) {
      throw new HttpError(
        409,
        `${it.name} is unavailable at ${sp.name}`,
      );
    }
  }

  // The shared menu price is authoritative for linked products.
  // Legacy, unlinked inventory continues using its existing price.
  const sellPrice = menuProduct?.sellPrice ?? it.sellPrice;

  subtotal = subtotal.plus(
    D(sellPrice).times(li.quantity),
  );

  let unitCost = D(it.costPrice);

  if (it.recipeLines.length) {
    unitCost = it.recipeLines.reduce(
      (sum, recipeLine) =>
        sum.plus(
          D(recipeLine.quantity).times(
            recipeLine.ingredient.costPrice,
          ),
        ),
      D(0),
    );

    for (const recipeLine of it.recipeLines) {
      uses.push({
        id: recipeLine.ingredientId,
        name: recipeLine.ingredient.name,
        qty: D(recipeLine.quantity).times(li.quantity),
        type: 'RECIPE_USE',
        stock: recipeLine.ingredient.quantity,
      });
    }
  } else {
    uses.push({
      id: it.id,
      name: it.name,
      qty: D(li.quantity),
      type: 'SALE',
      stock: it.quantity,
    });
  }

  cost = cost.plus(unitCost.times(li.quantity));

  return {
    it,
    li,
    sellPrice,
    unitCost: unitCost.toDecimalPlaces(2),
  };
});

      // Aggregate stock requirements so the same ingredient or bottle
      // is not checked separately for each order line.
      const need = new Map<
        string,
        {
          name: string;
          qty: Prisma.Decimal;
          stock: Prisma.Decimal;
        }
      >();

      for (const use of uses) {
        const existing = need.get(use.id);

        need.set(use.id, {
          name: use.name,
          stock: use.stock,
          qty: (existing?.qty ?? D(0)).plus(use.qty),
        });
      }

      for (const requirement of need.values()) {
        if (requirement.stock.lt(requirement.qty)) {
          throw new HttpError(
            409,
            `Not enough ${requirement.name} in stock ` +
              `(have ${requirement.stock.toDecimalPlaces(2)}, ` +
              `need ${requirement.qty.toDecimalPlaces(2)})`,
          );
        }
      }

      const service = input.applyServiceCharge
        ? subtotal.times(config.serviceChargeRate)
        : D(0);

      const vat = input.applyVat
        ? subtotal.times(config.vatRate)
        : D(0);

      const total = input.isComplimentary
        ? D(0)
        : subtotal.plus(service).plus(vat);

      const orderNo = await nextOrderNo(tx);

      // Check company credit limits for eligible city-ledger
      // and deferred orders.
      if (
        input.groupId &&
        !input.isComplimentary &&
        !input.isStaffCredit &&
        (input.paymentMethod === 'CITY_LEDGER' || input.payLater)
      ) {
        await checkCredit(
          input.groupId,
          total,
          role,
          staffId,
        );
      }

      const deferred =
        input.payLater ||
        input.isStaffCredit ||
        input.paymentMethod === 'CITY_LEDGER' ||
        input.paymentMethod === 'STAFF_CREDIT';

      const toRoom = input.paymentMethod === 'ROOM_CHARGE';

     // Creating an order does not mean payment has been received.
//
// Complimentary orders are settled through their complimentary
// accounting treatment.
// Room charges are settled against the guest's active folio.
// All other orders remain unpaid until payment is recorded.
const paymentStatus =
  input.isComplimentary || toRoom
    ? 'PAID'
    : 'UNPAID';

      const order = await tx.order.create({
        data: {
          orderNo,
          idempotencyKey,
          requestHash,
          customerType: input.customerType,
          guestId: input.guestId,
          groupId: input.groupId,
          salesPointId: sp.id,
          staffId,
          paymentMethod: input.paymentMethod,
          paymentStatus,
          subtotal,
          vat,
          serviceCharge: service,
          total,
          isComplimentary: input.isComplimentary,
          isStaffCredit: input.isStaffCredit,
          instructions: input.instructions,
          notes: input.notes,
       items: {
        create: lines.map(({ it, li, sellPrice, unitCost }) => ({
      itemId: it.id,
    quantity: li.quantity,
    unitPrice: sellPrice,
    unitCost,
    instructions: li.instructions,
  })),
},
        },
      });

      if (
        input.isComplimentary ||
        input.isStaffCredit ||
        input.paymentMethod === 'STAFF_CREDIT'
      ) {
        await audit(tx, {
          userId: staffId,
          action: input.isComplimentary
            ? 'COMP_ORDER'
            : 'STAFF_CREDIT_ORDER',
          entity: 'Order',
          entityId: order.id,
          meta: {
            orderNo,
            amount: Number(subtotal),
            reason: input.notes ?? null,
          },
        });
      }

      // Deduct inventory and record every stock movement.
      for (const use of uses) {
        const updatedItem = await tx.inventoryItem.update({
          where: { id: use.id },
          data: {
            quantity: { decrement: use.qty },
          },
        });

        // Protect against concurrent sales exhausting stock.
        if (updatedItem.quantity.lt(0)) {
          throw new HttpError(
            409,
            `Not enough ${use.name} in stock`,
          );
        }

        await tx.stockMovement.create({
          data: {
            itemId: use.id,
            type: use.type,
            quantity: use.qty.neg(),
            balance: updatedItem.quantity,
            reference: orderNo,
            userId: staffId,
          },
        });
      }

      const revenueAccount = revenueAccountFor(sp.name);
      const reference = orderNo;

      if (input.isComplimentary) {
        await postJournal(tx, {
          description: `Complimentary sale ${orderNo}`,
          reference,
          userId: staffId,
          lines: [
            {
              code: ACC.COMPLIMENTARY,
              debit: subtotal,
            },
            {
              code: revenueAccount,
              credit: subtotal,
            },
          ],
        });
      } else if (toRoom) {
        if (!input.guestId) {
          throw new HttpError(
            400,
            'Choose an in-house guest to charge to a room',
          );
        }

        const folio = await tx.folio.findFirst({
          where: {
            guestId: input.guestId,
            status: 'ACTIVE',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!folio) {
          throw new HttpError(
            409,
            'This guest has no active folio',
          );
        }

        const base = {
          folioId: folio.id,
          salesPointId: sp.id,
          userId: staffId,
          reference,
          groupFolio: !!folio.groupId,
        };

        await postFolioCharge(tx, {
          ...base,
          description: `${sp.name} order ${orderNo}`,
          amount: subtotal,
          creditCode: revenueAccount,
        });

        await postFolioCharge(tx, {
          ...base,
          description: `Service Charge (10%) on ${orderNo}`,
          amount: service,
          creditCode: ACC.SERVICE_PAYABLE,
        });

        await postFolioCharge(tx, {
          ...base,
          description: `VAT (7.5%) on ${orderNo}`,
          amount: vat,
          creditCode: ACC.VAT_PAYABLE,
        });
      } else {
        // All non-room, non-complimentary orders initially create
// a receivable. Actual payment is recorded separately through
// payOrder(), which debits the appropriate cash/bank account
// and credits Accounts Receivable.
  const debitAccount = ACC.AR_CITY;

        await postJournal(tx, {
          description: `Payment for order ${orderNo}`,
          reference,
          userId: staffId,
          lines: [
            {
              code: debitAccount,
              debit: total,
            },
            {
              code: revenueAccount,
              credit: subtotal,
            },
            {
              code: ACC.SERVICE_PAYABLE,
              credit: service,
            },
            {
              code: ACC.VAT_PAYABLE,
              credit: vat,
            },
          ],
        });
      }

      // Record the cost of goods sold and inventory reduction.
      await postJournal(tx, {
        description: `Cost of goods sold ${orderNo}`,
        reference,
        userId: staffId,
        lines: [
          {
            code: ACC.COGS,
            debit: cost,
          },
          {
            code: ACC.INVENTORY,
            credit: cost,
          },
        ],
      });

            return order;
    },
    {
      maxWait: 10000,
      timeout: 20000,
    },
  );

  // Only runs for a newly created order, not an idempotent replay.
  const salesPoint = await prisma.salesPoint.findUnique({
    where: { id: created.salesPointId },
    select: { name: true },
  });

  void notifyRoles(
    ['CHEF'],
    {
      title: 'New order',
      body: `Order ${created.orderNo} was placed at ${salesPoint?.name ?? 'a sales point'}.`,
      category: 'ORDERS',
      entityType: 'Order',
      entityId: created.id,
      createdByUserId: staffId,
    },
    staffId,
  );

  return created;
  } catch (error) {
    // A concurrent request may have committed this same key first.
    if (
      idempotencyKey &&
      requestHash &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new HttpError(
            409,
            'This idempotency key was already used for a different order',
          );
        }

        // Return the committed order; do not repeat stock, folio,
        // or accounting effects.
        return existing;
      }
    }

    throw error;
  }
}

export async function payOrder(
  orderId: string,
  method: PaymentMethod,
  userId: string,
) {
  if (!['CASH', 'CARD', 'TRANSFER'].includes(method)) {
    throw new HttpError(
      400,
      'Payment must be Cash, Card or Transfer',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new HttpError(404, 'Order not found');
      }

      if (order.paymentStatus !== 'UNPAID') {
        throw new HttpError(
          409,
          'This order is not awaiting payment',
        );
      }

      if (
        order.status !== 'SERVED' &&
        order.status !== 'COMPLETED'
      ) {
        throw new HttpError(
          409,
          'An order must be served before payment can be recorded',
        );
      }

      // Claim the unpaid order atomically. This prevents two
      // simultaneous payment requests from posting duplicate
      // settlement journals.
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          paymentStatus: 'UNPAID',
          status: {
            in: ['SERVED', 'COMPLETED'],
          },
        },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: method,
        },
      });

      if (claimed.count !== 1) {
        throw new HttpError(
          409,
          'This order has already been paid or its status has changed',
        );
      }

      await postJournal(tx, {
        description: `Settlement of ${order.orderNo}`,
        reference: order.orderNo,
        userId,
        lines: [
          {
            code: cashAccountFor(method),
            debit: order.total,
          },
          {
            code: ACC.AR_CITY,
            credit: order.total,
          },
        ],
      });

      await audit(tx, {
        userId,
        action: 'PAY_ORDER',
        entity: 'Order',
        entityId: order.id,
        meta: {
          orderNo: order.orderNo,
          method,
          total: Number(order.total),
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    },
  );
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  userId: string,
  role: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new HttpError(404, 'Order not found');
      }

      if (order.paymentStatus === 'VOIDED') {
        throw new HttpError(
          409,
          'This order has been voided',
        );
      }

      const validTransitions: Record<string, OrderStatus[]> = {
        PENDING: ['PREPARING'],
        CONFIRMED: ['PREPARING'],
        PREPARING: ['READY'],
        READY: ['SERVED'],
      };

      const allowedNextStatuses =
        validTransitions[order.status] ?? [];

      if (!allowedNextStatuses.includes(status)) {
        throw new HttpError(
          409,
          `Cannot move an order from ${order.status} to ${status}`,
        );
      }

      // Kitchen staff can prepare orders and mark them ready.
      if (
        role === 'CHEF' &&
        !['PREPARING', 'READY'].includes(status)
      ) {
        throw new HttpError(
          403,
          'Kitchen staff can only prepare orders and mark them ready',
        );
      }

      // Waiters can mark ready orders as served.
      if (role === 'WAITER' && status !== 'SERVED') {
        throw new HttpError(
          403,
          'Waiters can only mark ready orders as served',
        );
      }

      if (
        !['WAITER', 'CHEF', 'MANAGER', 'ADMIN'].includes(role)
      ) {
        throw new HttpError(
          403,
          'You are not authorized to update this order',
        );
      }

      // Prevent simultaneous status updates from overwriting
      // another user's change.
      const updatedCount = await tx.order.updateMany({
        where: {
          id: orderId,
          status: order.status,
          paymentStatus: order.paymentStatus,
        },
        data: { status },
      });

      if (updatedCount.count !== 1) {
        throw new HttpError(
          409,
          'The order was updated by another user. Refresh and try again.',
        );
      }

      await audit(tx, {
        userId,
        action: 'UPDATE_ORDER_STATUS',
        entity: 'Order',
        entityId: order.id,
        meta: {
          orderNo: order.orderNo,
          previousStatus: order.status,
          newStatus: status,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    },
  );
}

export async function completeOrder(
  orderId: string,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new HttpError(404, 'Order not found');
      }

      if (order.paymentStatus === 'VOIDED') {
        throw new HttpError(
          409,
          'A voided order cannot be completed',
        );
      }

      if (order.status !== 'SERVED') {
        throw new HttpError(
          409,
          'Only served orders can be completed',
        );
      }

      // These are explicitly authorized deferred-payment
      // arrangements. They may be completed while outstanding.
      const authorizedDeferred =
        order.isStaffCredit ||
        order.paymentMethod === 'STAFF_CREDIT' ||
        order.paymentMethod === 'CITY_LEDGER';

      if (
        order.paymentStatus !== 'PAID' &&
        !(
          order.paymentStatus === 'UNPAID' &&
          authorizedDeferred
        )
      ) {
        throw new HttpError(
          409,
          'Record payment before completing this sale',
        );
      }

      const updatedCount = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'SERVED',
          paymentStatus: order.paymentStatus,
        },
        data: {
          status: 'COMPLETED',
        },
      });

      if (updatedCount.count !== 1) {
        throw new HttpError(
          409,
          'The order has already been updated. Refresh and try again.',
        );
      }

      await audit(tx, {
        userId,
        action: 'COMPLETE_ORDER',
        entity: 'Order',
        entityId: order.id,
        meta: {
          orderNo: order.orderNo,
          total: Number(order.total),
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    },
  );
}

export async function voidOrder(
  orderId: string,
  reason: string,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new HttpError(404, 'Order not found');
      }

      if (order.paymentStatus === 'VOIDED') {
        throw new HttpError(409, 'Order is already voided');
      }

      await reverseByReference(
        tx,
        order.orderNo,
        userId,
      );

      // Restore exactly the stock deducted by the sale,
      // including recipe ingredients.
      const taken = await tx.stockMovement.findMany({
        where: {
          reference: order.orderNo,
          type: {
            in: ['SALE', 'RECIPE_USE'],
          },
        },
      });

      for (const movement of taken) {
        const quantityToRestore = D(movement.quantity).neg();

        const updatedItem = await tx.inventoryItem.update({
          where: { id: movement.itemId },
          data: {
            quantity: { increment: quantityToRestore },
          },
        });

        await tx.stockMovement.create({
          data: {
            itemId: movement.itemId,
            type: 'VOID_RETURN',
            quantity: quantityToRestore,
            balance: updatedItem.quantity,
            reference: order.orderNo,
            userId,
          },
        });
      }

      // Reverse folio charges while retaining an audit trail.
      const folioLines = await tx.folioTransaction.findMany({
        where: {
          description: {
            contains: order.orderNo,
          },
          bill: { gt: 0 },
        },
      });

      for (const folioLine of folioLines) {
        await tx.folioTransaction.create({
          data: {
            folioId: folioLine.folioId,
            type: 'CREDIT',
            description: `VOID: ${folioLine.description}`,
            payment: folioLine.bill,
            userId,
          },
        });
      }

      // wasPaid distinguishes a cash-in-hand void from
      // cancellation of a credit sale for Revenue Guard.
      await audit(tx, {
        userId,
        action: 'VOID_ORDER',
        entity: 'Order',
        entityId: order.id,
        meta: {
          reason,
          orderNo: order.orderNo,
          total: Number(order.total),
          paymentMethod: order.paymentMethod,
          wasPaid: order.paymentStatus === 'PAID',
        },
      });

      return tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'VOIDED',
          status: 'CANCELLED',
          voidedAt: new Date(),
          voidReason: reason,
        },
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    },
  );
}
