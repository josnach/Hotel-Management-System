
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { D, prisma } from '../lib/prisma';
import { dayRange, HttpError, parse } from '../lib/http';

const paymentMethods = [
  'CASH',
  'CARD',
  'TRANSFER',
  'ROOM_CHARGE',
  'STAFF_CREDIT',
  'CITY_LEDGER',
] as const;

const reportQuerySchema = z.object({
  start: z.string().trim().optional(),
  end: z.string().trim().optional(),
  salesPointIds: z.string().trim().optional(),
  method: z.enum(paymentMethods).optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  userId: z.string().trim().optional(),
  transactionType: z.enum(['ALL_TYPES', 'CREDIT', 'DEBIT']).optional(),
});

type ReportQuery = z.infer<typeof reportQuerySchema>;

function parseLocalDate(value: string, field: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Invalid ${field} date`);
  }

  if (dateOnly) {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function getDateRange(query: ReportQuery) {
  const today = dayRange();

  const start = query.start
    ? parseLocalDate(query.start, 'start')
    : today.start;

  let endExclusive: Date;

  if (query.end) {
    endExclusive = parseLocalDate(query.end, 'end');

    // Date-only end values include the entire selected day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.end)) {
      endExclusive.setDate(endExclusive.getDate() + 1);
    }
  } else {
    endExclusive = today.end;
  }

  if (start >= endExclusive) {
    throw new HttpError(400, 'The start date must be before the end date');
  }

  return { start, endExclusive };
}

function buildOrderWhere(query: ReportQuery): Prisma.OrderWhereInput {
  const { start, endExclusive } = getDateRange(query);

  const salesPointIds = query.salesPointIds
    ? query.salesPointIds.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  const method = query.method ?? query.paymentMethod;

  return {
    paymentStatus: { not: 'VOIDED' },
    status: { not: 'CANCELLED' },
    createdAt: {
      gte: start,
      lt: endExclusive,
    },
    ...(salesPointIds.length
      ? { salesPointId: { in: salesPointIds } }
      : {}),
    ...(method ? { paymentMethod: method } : {}),
    ...(query.userId ? { staffId: query.userId } : {}),
  };
}

async function loadSalesReportData(rawQuery: unknown) {
  const query = parse(reportQuerySchema, rawQuery);
  const where = buildOrderWhere(query);
  const { start, endExclusive } = getDateRange(query);

  const [orders, cityLedgerRefunds, salesPoints] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        salesPoint: true,
        staff: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            item: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // City Ledger refunds are deliberately separate from POS sales.
    // A CREDIT_NOTE is not a cash or bank refund.
    prisma.cityLedgerEntry.findMany({
      where: {
        type: 'CREDIT',
        status: 'REFUNDED',
        settledAt: {
          gte: start,
          lt: endExclusive,
        },
      },
      orderBy: { settledAt: 'asc' },
    }),

    prisma.salesPoint.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return {
    query,
    orders,
    cityLedgerRefunds,
    salesPoints,
    start,
    endExclusive,
  };
}

function sumAmounts(values: Array<{ total: Prisma.Decimal }>) {
  return values.reduce((sum, value) => sum.plus(value.total), D(0));
}

function isPaid(order: { paymentStatus: string }) {
  return order.paymentStatus === 'PAID';
}

function isCashOrBankCollection(order: {
  paymentStatus: string;
  paymentMethod: string;
  total: Prisma.Decimal;
  isComplimentary: boolean;
}) {
  return (
    isPaid(order) &&
    !order.isComplimentary &&
    ['CASH', 'CARD', 'TRANSFER'].includes(order.paymentMethod)
  );
}

function cityLedgerRefundBreakdown(
  entries: Array<{ amount: Prisma.Decimal; settleMethod: string | null }>,
) {
  const result = {
    total: D(0),
    cash: D(0),
    bankTransfer: D(0),
    creditNote: D(0),
    other: D(0),
  };

  for (const entry of entries) {
    const amount = D(entry.amount);
    result.total = result.total.plus(amount);

    switch ((entry.settleMethod ?? '').toUpperCase()) {
      case 'CASH':
        result.cash = result.cash.plus(amount);
        break;
      case 'BANK_TRANSFER':
        result.bankTransfer = result.bankTransfer.plus(amount);
        break;
      case 'CREDIT_NOTE':
        result.creditNote = result.creditNote.plus(amount);
        break;
      default:
        result.other = result.other.plus(amount);
    }
  }

  return result;
}

export async function getSalesOverview(rawQuery: unknown) {
  const { orders, salesPoints } = await loadSalesReportData(rawQuery);

  const groups = salesPoints.map((point) => {
    const pointOrders = orders.filter(
      (order) => order.salesPointId === point.id,
    );

    const totalSales = sumAmounts(pointOrders);
    const paidOrders = pointOrders.filter(isPaid);
    const totalPayments = sumAmounts(paidOrders);
    const cashAndBankPayments = sumAmounts(
      pointOrders.filter(isCashOrBankCollection),
    );

    const customers = new Set(
      pointOrders
        .map((order) => order.guestId)
        .filter((guestId): guestId is string => Boolean(guestId)),
    );

    return {
      salesPointId: point.id,
      salesPoint: point.name,
      totalSales,
      totalPayments,
      cashAndBankPayments,
      net: totalSales,
      transactions: pointOrders.length,
      customers: customers.size,
    };
  });

  const totalSales = sumAmounts(orders);
  const paidOrders = orders.filter(isPaid);

  return {
    totalSales,
    totalPayments: sumAmounts(paidOrders),
    cashAndBankPayments: sumAmounts(
      orders.filter(isCashOrBankCollection),
    ),
    transactions: orders.length,
    customers: new Set(
      orders.map((order) => order.guestId).filter(Boolean),
    ).size,
    groups,
  };
}

export async function getDetailedSalesReport(rawQuery: unknown) {
  const { orders } = await loadSalesReportData(rawQuery);

  const transactions = orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    date: order.createdAt,
    salesPoint: order.salesPoint.name,
    description: order.items
      .map((line) => `${line.quantity} × ${line.item.name}`)
      .join(', '),
    customer: order.guest
      ? `${order.guest.firstName} ${order.guest.lastName}`.trim()
      : 'Walk-in',
    staff: order.staff.fullName || order.staff.username,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    type: isPaid(order) ? 'CREDIT' : 'DEBIT',
    total: order.total,
    amountPaid: isPaid(order) ? order.total : D(0),
    balance: isPaid(order) ? D(0) : order.total,
    isComplimentary: order.isComplimentary,
  }));

  return {
    totalTransactions: orders.length,
    totalSales: sumAmounts(orders),
    totalPayments: sumAmounts(orders.filter(isPaid)),
    totalBilling: sumAmounts(orders),
    totalBalance: orders
      .filter((order) => !isPaid(order))
      .reduce((sum, order) => sum.plus(order.total), D(0)),
    transactions,
  };
}

export async function getControlSheet(rawQuery: unknown) {
  const { orders, salesPoints } = await loadSalesReportData(rawQuery);

  return {
    salesPoints,
    transactions: orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      date: order.createdAt,
      salesPoint: order.salesPoint.name,
      customer: order.guest
        ? `${order.guest.firstName} ${order.guest.lastName}`.trim()
        : 'Walk-in',
      staff: order.staff.fullName || order.staff.username,
      description: order.items
        .map((line) => `${line.quantity} × ${line.item.name}`)
        .join(', '),
      quantity: order.items.reduce((sum, line) => sum + line.quantity, 0),
      total: order.total,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
    })),
    totalTransactions: orders.length,
    grandTotal: sumAmounts(orders),
  };
}

export async function getSalesSummaryReport(rawQuery: unknown) {
  const { query, orders, cityLedgerRefunds } =
    await loadSalesReportData(rawQuery);

  const transactionOrders =
    query.transactionType === 'CREDIT'
      ? orders.filter(isPaid)
      : query.transactionType === 'DEBIT'
        ? orders.filter((order) => !isPaid(order))
        : orders;

  const totalBills = sumAmounts(orders);
  const totalPayments = sumAmounts(orders.filter(isPaid));

  const salesByPoint = new Map<
    string,
    {
      salesPointId: string;
      salesPoint: string;
      payments: Prisma.Decimal;
      bills: Prisma.Decimal;
      transactions: number;
    }
  >();

  for (const order of orders) {
    const current = salesByPoint.get(order.salesPointId) ?? {
      salesPointId: order.salesPointId,
      salesPoint: order.salesPoint.name,
      payments: D(0),
      bills: D(0),
      transactions: 0,
    };

    current.bills = current.bills.plus(order.total);
    if (isPaid(order)) {
      current.payments = current.payments.plus(order.total);
    }
    current.transactions += 1;

    salesByPoint.set(order.salesPointId, current);
  }

  const daily = new Map<
    string,
    { date: string; bills: Prisma.Decimal; payments: Prisma.Decimal }
  >();

  for (const order of orders) {
    const date = [
      order.createdAt.getFullYear(),
      String(order.createdAt.getMonth() + 1).padStart(2, '0'),
      String(order.createdAt.getDate()).padStart(2, '0'),
    ].join('-');

    const current = daily.get(date) ?? {
      date,
      bills: D(0),
      payments: D(0),
    };

    current.bills = current.bills.plus(order.total);
    if (isPaid(order)) {
      current.payments = current.payments.plus(order.total);
    }

    daily.set(date, current);
  }

  const refundBreakdown = cityLedgerRefundBreakdown(cityLedgerRefunds);

  return {
    totalPayments,
    totalBills,
    // No POS refund transaction model exists in the current schema.
    posRefunds: D(0),
    posRefundTrackingAvailable: false,
    netSales: totalBills,
    cityLedgerRefunds: refundBreakdown,
    salesByPoint: [...salesByPoint.values()].map((point) => ({
      ...point,
      refunds: D(0),
      netSales: point.bills,
    })),
    dailyTrend: [...daily.values()],
    transactions: transactionOrders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      date: order.createdAt,
      salesPoint: order.salesPoint.name,
      description: order.items
        .map((line) => `${line.quantity} × ${line.item.name}`)
        .join(', '),
      type: isPaid(order) ? 'CREDIT' : 'DEBIT',
      amount: order.total,
      paymentMethod: order.paymentMethod,
      user: order.staff.fullName || order.staff.username,
      paymentStatus: order.paymentStatus,
    })),
  };
}

export async function getItemSalesSummary(rawQuery: unknown) {
  const { orders } = await loadSalesReportData(rawQuery);

  const categories = new Map<
    string,
    {
      categoryId: string | null;
      category: string;
      items: Map<
        string,
        {
          itemId: string;
          itemCode: number;
          itemName: string;
          price: Prisma.Decimal;
          quantity: number;
          total: Prisma.Decimal;
          vat: Prisma.Decimal;
        }
      >;
    }
  >();

  let totalItemsSold = 0;
  let totalSalesValue = D(0);
  let totalVat = D(0);

  for (const order of orders) {
    for (const line of order.items) {
      const item = line.item;
      const categoryId = item.categoryId ?? null;
      const categoryName = item.category?.name ?? 'Uncategorized';
      const lineTotal = D(line.unitPrice).mul(line.quantity);

      // VAT is stored at order level, not per item. This allocates it
      // proportionally to item value for reporting purposes.
      const allocatedVat = D(order.subtotal).gt(0)
        ? D(order.vat).mul(lineTotal).div(order.subtotal)
        : D(0);

      const category = categories.get(categoryId ?? 'uncategorized') ?? {
        categoryId,
        category: categoryName,
        items: new Map(),
      };

      const existing = category.items.get(item.id) ?? {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        price: D(line.unitPrice),
        quantity: 0,
        total: D(0),
        vat: D(0),
      };

      existing.quantity += line.quantity;
      existing.total = existing.total.plus(lineTotal);
      existing.vat = existing.vat.plus(allocatedVat);

      category.items.set(item.id, existing);
      categories.set(categoryId ?? 'uncategorized', category);

      totalItemsSold += line.quantity;
      totalSalesValue = totalSalesValue.plus(lineTotal);
      totalVat = totalVat.plus(allocatedVat);
    }
  }

  return {
    totalItemsSold,
    totalSalesValue,
    totalVat,
    categories: [...categories.values()].map((category) => ({
      categoryId: category.categoryId,
      category: category.category,
      items: [...category.items.values()],
      totalQuantity: [...category.items.values()].reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      total: [...category.items.values()].reduce(
        (sum, item) => sum.plus(item.total),
        D(0),
      ),
      vat: [...category.items.values()].reduce(
        (sum, item) => sum.plus(item.vat),
        D(0),
      ),
    })),
  };
}

export async function getDetailedSalesSummary(rawQuery: unknown) {
  const { orders, salesPoints } = await loadSalesReportData(rawQuery);

  return {
    salesPoints: salesPoints.map((point) => {
      const pointOrders = orders.filter(
        (order) => order.salesPointId === point.id,
      );

      const itemGroups = new Map<
        string,
        {
          itemId: string;
          itemCode: number;
          itemName: string;
          category: string;
          quantity: number;
          total: Prisma.Decimal;
        }
      >();

      for (const order of pointOrders) {
        for (const line of order.items) {
          const item = line.item;
          const current = itemGroups.get(item.id) ?? {
            itemId: item.id,
            itemCode: item.code,
            itemName: item.name,
            category: item.category?.name ?? 'Uncategorized',
            quantity: 0,
            total: D(0),
          };

          current.quantity += line.quantity;
          current.total = current.total.plus(
            D(line.unitPrice).mul(line.quantity),
          );

          itemGroups.set(item.id, current);
        }
      }

      return {
        salesPointId: point.id,
        salesPoint: point.name,
        totalSales: sumAmounts(pointOrders),
        totalPayments: sumAmounts(pointOrders.filter(isPaid)),
        transactions: pointOrders.length,
        items: [...itemGroups.values()],
      };
    }),
  };
}
