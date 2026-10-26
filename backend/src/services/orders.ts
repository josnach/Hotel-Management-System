import { CustomerType, PaymentMethod, Prisma } from '@prisma/client';
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
  return await prisma.$transaction(
    async (tx) => {
      const sp = await tx.salesPoint.findUnique({
        where: { id: input.salesPointId },
      });

      if (!sp) {
        throw new HttpError(404, 'Sales point not found');
      }

      if (!input.items.length) {
        throw new HttpError(400, 'Add at least one item');
      }

      const items = await tx.inventoryItem.findMany({
        where: {
          id: { in: input.items.map((item) => item.itemId) },
        },
        include: {
          recipeLines: {
            include: { ingredient: true },
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

        if (!it) {
          throw new HttpError(404, 'Item not found');
        }

        if (!Number.isFinite(li.quantity) || li.quantity <= 0) {
          throw new HttpError(
            400,
            `Invalid quantity for ${it.name}`,
          );
        }

        subtotal = subtotal.plus(
          D(it.sellPrice).times(li.quantity),
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

      const paymentStatus = input.isComplimentary
        ? 'PAID'
        : deferred
          ? 'UNPAID'
          : 'PAID';

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
            create: lines.map(({ it, li, unitCost }) => ({
              itemId: it.id,
              quantity: li.quantity,
              unitPrice: it.sellPrice,
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
        const debitAccount = deferred
          ? ACC.AR_CITY
          : cashAccountFor(input.paymentMethod);

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

      const paid = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: method,
        },
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

      return paid;
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
