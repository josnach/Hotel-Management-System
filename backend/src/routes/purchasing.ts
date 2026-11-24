import { Router } from 'express';
import { z } from 'zod';
import { POStatus, Prisma } from '@prisma/client';
import { config } from '../config';
import { asyncHandler, clientIp, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma, Tx } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC, postJournal } from '../services/accounting';

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const blank = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/* ═══════════════════════════ SUPPLIERS ═══════════════════════════ */

export const suppliersRouter = Router();
// ADMIN and MANAGER pass automatically (see requireRole).
suppliersRouter.use(requireRole('ACCOUNTANT'));

async function nextSupplierCode(db: Tx | typeof prisma) {
  const last = await db.supplier.findFirst({
    where: { code: { startsWith: 'SUP-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const parsed = Number(last?.code?.slice(4));
  const n = Number.isFinite(parsed) ? parsed + 1 : 1;
  return `SUP-${String(n).padStart(4, '0')}`;
}

/** Dropdown on the purchase-order form (active suppliers only). */
suppliersRouter.get(
  '/options',
  asyncHandler(async (_q, res) => {
    const rows = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, contactPerson: true, phone: true, address: true, city: true },
    });
    res.json(rows);
  }),
);

suppliersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, status } = req.query as Record<string, string | undefined>;
    const rows = await prisma.supplier.findMany({
      where: {
        ...(status === 'ACTIVE' ? { isActive: true } : status === 'INACTIVE' ? { isActive: false } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
                { contactPerson: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 1000,
      include: { _count: { select: { orders: true } } },
    });
    res.json({
      rows: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        isActive: s.isActive,
        orders: s._count.orders,
      })),
    });
  }),
);

suppliersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const opt = z.string().trim().max(250).optional();
    const b = parse(
      z.object({
        name: z.string().trim().min(1, 'Supplier name is required').max(160),
        code: z.string().trim().max(30).optional(),
        contactPerson: opt,
        email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
        phone: z.string().trim().min(5, 'Phone is required').max(40),
        altPhone: opt,
        address: z.string().trim().max(500).optional(),
        city: opt,
        state: opt,
        country: opt,
        postalCode: opt,
        taxId: opt,
        paymentTerms: opt,
        bankName: opt,
        accountNumber: opt,
        accountName: opt,
        notes: z.string().trim().max(1000).optional(),
        isActive: z.boolean().default(true),
      }),
      req.body,
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const supplier = await prisma.$transaction(async (tx) => {
          const created = await tx.supplier.create({
            data: {
              name: b.name,
              code: blank(b.code) ?? (await nextSupplierCode(tx)),
              contactPerson: blank(b.contactPerson),
              email: blank(b.email),
              phone: b.phone,
              altPhone: blank(b.altPhone),
              address: blank(b.address),
              city: blank(b.city),
              state: blank(b.state),
              country: blank(b.country) ?? 'Nigeria',
              postalCode: blank(b.postalCode),
              taxId: blank(b.taxId),
              paymentTerms: blank(b.paymentTerms),
              bankName: blank(b.bankName),
              accountNumber: blank(b.accountNumber),
              accountName: blank(b.accountName),
              notes: blank(b.notes),
              isActive: b.isActive,
            },
          });
          await audit(tx, {
            userId: req.user!.id, action: 'SUPPLIER_CREATE', entity: 'Supplier',
            entityId: created.id, ip: clientIp(req), meta: { name: created.name },
          });
          return created;
        });
        return res.status(201).json(supplier);
      } catch (e) {
        if (isUnique(e)) {
          const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
          if (target.includes('name')) throw new HttpError(409, 'A supplier with this name already exists');
          if (target.includes('code') && blank(b.code)) throw new HttpError(409, 'This supplier code is already in use');
          if (attempt < 2) continue; // auto-generated code collided: take the next one
        }
        throw e;
      }
    }
  }),
);

suppliersRouter.post(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const s = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!s) throw new HttpError(404, 'Supplier not found');
    const updated = await prisma.supplier.update({ where: { id: s.id }, data: { isActive: !s.isActive } });
    await audit(prisma, {
      userId: req.user!.id, action: 'SUPPLIER_TOGGLE', entity: 'Supplier',
      entityId: s.id, ip: clientIp(req), meta: { name: s.name, isActive: updated.isActive },
    });
    res.json({ isActive: updated.isActive });
  }),
);

/* ═══════════════════════════ PURCHASE ORDERS ═══════════════════════════ */

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(requireRole('ACCOUNTANT'));
const approver = requireRole('MANAGER'); // ADMIN and MANAGER only

const vatRate = () => Number(config.vatRate);

/** PO-YYYYMMDD-NNNN, counting up within the day. */
async function nextPoNo(db: Tx | typeof prisma, now = new Date()) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `PO-${ymd}-`;
  const last = await db.purchaseOrder.findFirst({
    where: { poNo: { startsWith: prefix } },
    orderBy: { poNo: 'desc' },
    select: { poNo: true },
  });
  const parsed = Number(last?.poNo.slice(prefix.length));
  const n = Number.isFinite(parsed) ? parsed + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

purchaseOrdersRouter.get(
  '/next-number',
  asyncHandler(async (_q, res) => res.json({ poNo: await nextPoNo(prisma), vatRate: vatRate() })),
);

/** The "Item" dropdown on the purchase-order form. */
purchaseOrdersRouter.get(
  '/options/items',
  asyncHandler(async (_q, res) => {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, costPrice: true, salesPoint: { select: { name: true } } },
    });
    // Items belong to a sales point, so the same name can exist twice: show where each one lives.
    res.json(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        label: `${i.name} (${i.salesPoint.name})`,
        costPrice: i.costPrice,
      })),
    );
  }),
);

purchaseOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, supplierId, q, start, end } = req.query as Record<string, string | undefined>;

    const where: Prisma.PurchaseOrderWhereInput = {
      ...(status ? { status: status as POStatus } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(q
        ? {
            OR: [
              { poNo: { contains: q, mode: 'insensitive' } },
              { supplier: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(start || end
        ? {
            orderDate: {
              gte: start ? new Date(start) : undefined,
              lte: end ? new Date(`${end}T23:59:59.999`) : undefined,
            },
          }
        : {}),
    };

    const [rows, grouped] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
      }),
      prisma.purchaseOrder.groupBy({ by: ['status'], where, _count: true }),
    ]);

    const count = (s: POStatus) => grouped.find((g) => g.status === s)?._count ?? 0;
    res.json({
      summary: {
        total: grouped.reduce((s, g) => s + g._count, 0),
        draft: count('DRAFT'),
        pending: count('PENDING'),
        approved: count('APPROVED'),
        received: count('RECEIVED'),
        cancelled: count('CANCELLED'),
      },
      rows: rows.map((p) => ({
        id: p.id,
        poNo: p.poNo,
        supplier: p.supplier.name,
        orderDate: p.orderDate,
        expectedDelivery: p.expectedDelivery,
        status: p.status,
        total: p.total,
        itemCount: p._count.items,
      })),
    });
  }),
);

purchaseOrdersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        supplierId: z.string().optional(),
        supplierName: z.string().trim().min(1, 'Supplier name is required').max(160),
        supplierContact: z.string().trim().max(200).optional(),
        supplierAddress: z.string().trim().max(500).optional(),
        orderDate: z.coerce.date(),
        expectedDelivery: z.coerce.date().optional().nullable(),
        items: z
          .array(
            z.object({
              itemId: z.string().min(1, 'Select an item for every row'),
              quantity: z.coerce.number().positive('Quantity must be greater than zero'),
              unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
              description: z.string().trim().max(250).optional(),
            }),
          )
          .min(1, 'Add at least one item'),
        notes: z.string().trim().max(1000).optional(),
        terms: z.string().trim().max(1000).optional(),
        submit: z.boolean().default(false),
      }),
      req.body,
    );

    const subtotal = b.items.reduce((s, i) => s.plus(D(i.quantity).times(i.unitPrice)), D(0));
    const vat = subtotal.times(vatRate()).toDecimalPlaces(2);
    const total = subtotal.plus(vat);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const po = await prisma.$transaction(async (tx) => {
          // Use the chosen supplier, or find/create one from the typed name.
          let supplierId = b.supplierId;
          if (supplierId) {
            if (!(await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }))) {
              throw new HttpError(404, 'Supplier not found');
            }
          } else {
            const existing = await tx.supplier.findFirst({
              where: { name: { equals: b.supplierName, mode: 'insensitive' } },
              select: { id: true },
            });
            supplierId =
              existing?.id ??
              (
                await tx.supplier.create({
                  data: {
                    name: b.supplierName,
                    code: await nextSupplierCode(tx),
                    contactPerson: blank(b.supplierContact),
                    address: blank(b.supplierAddress),
                  },
                })
              ).id;
          }

          const found = await tx.inventoryItem.count({
            where: { id: { in: [...new Set(b.items.map((i) => i.itemId))] } },
          });
          if (found !== new Set(b.items.map((i) => i.itemId)).size) {
            throw new HttpError(400, 'One of the selected items no longer exists');
          }

          const created = await tx.purchaseOrder.create({
            data: {
              poNo: await nextPoNo(tx),
              supplierId,
              status: b.submit ? 'PENDING' : 'DRAFT',
              submittedAt: b.submit ? new Date() : null,
              subtotal,
              vatAmount: vat,
              total,
              notes: blank(b.notes),
              terms: blank(b.terms),
              supplierContact: blank(b.supplierContact),
              supplierAddress: blank(b.supplierAddress),
              orderDate: b.orderDate,
              expectedDelivery: b.expectedDelivery ?? null,
              createdById: req.user!.id,
              items: {
                create: b.items.map((i) => ({
                  itemId: i.itemId,
                  quantity: i.quantity,
                  unitCost: i.unitPrice,
                  description: blank(i.description),
                })),
              },
            },
          });

          await audit(tx, {
            userId: req.user!.id,
            action: b.submit ? 'PO_SUBMIT' : 'PO_DRAFT',
            entity: 'PurchaseOrder',
            entityId: created.id,
            ip: clientIp(req),
            meta: { poNo: created.poNo, total: Number(total) },
          });
          return created;
        });
        return res.status(201).json(po);
      } catch (e) {
        if (isUnique(e) && attempt < 2) continue;
        throw e;
      }
    }
  }),
);

/* ───────────── Workflow: submit → approve → receive, or cancel ───────────── */

purchaseOrdersRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: req.params.id } });
      if (!po) throw new HttpError(404, 'Purchase order not found');
      if (po.status !== 'DRAFT') throw new HttpError(409, `This order is already ${po.status.toLowerCase()}`);
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'PENDING', submittedAt: new Date() } });
      await audit(tx, {
        userId: req.user!.id, action: 'PO_SUBMIT', entity: 'PurchaseOrder',
        entityId: po.id, ip: clientIp(req), meta: { poNo: po.poNo },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

purchaseOrdersRouter.post(
  '/:id/approve',
  approver,
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: req.params.id } });
      if (!po) throw new HttpError(404, 'Purchase order not found');
      if (po.status !== 'PENDING') throw new HttpError(409, 'Only pending orders can be approved');
      if (po.createdById === req.user!.id && req.user!.role !== 'ADMIN') {
        throw new HttpError(403, 'You cannot approve an order you created');
      }
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
      });
      await audit(tx, {
        userId: req.user!.id, action: 'PO_APPROVE', entity: 'PurchaseOrder',
        entityId: po.id, ip: clientIp(req), meta: { poNo: po.poNo, total: Number(po.total) },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

purchaseOrdersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: req.params.id } });
      if (!po) throw new HttpError(404, 'Purchase order not found');
      if (po.status === 'RECEIVED') throw new HttpError(409, 'A received order cannot be cancelled');
      if (po.status === 'CANCELLED') throw new HttpError(409, 'This order is already cancelled');
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'CANCELLED' } });
      await audit(tx, {
        userId: req.user!.id, action: 'PO_CANCEL', entity: 'PurchaseOrder',
        entityId: po.id, ip: clientIp(req), meta: { poNo: po.poNo },
      });
    }, SERIALIZABLE);
    res.json({ ok: true });
  }),
);

/**
 * Receiving adds the stock and posts the journal (same behaviour as the old endpoint):
 *   Dr Inventory (subtotal)  Dr VAT (input VAT, offsets VAT payable)  Cr Bank (or the payables account if unpaid).
 */
purchaseOrdersRouter.post(
  '/:id/receive',
  asyncHandler(async (req, res) => {
    const { paid } = parse(z.object({ paid: z.boolean().default(true) }), req.body ?? {});

    await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!po) throw new HttpError(404, 'Purchase order not found');
      if (po.status !== 'APPROVED') throw new HttpError(409, 'Only approved purchase orders can be received');

      for (const li of po.items) {
        const it = await tx.inventoryItem.update({
          where: { id: li.itemId },
          data: { quantity: { increment: li.quantity }, costPrice: li.unitCost },
        });
        await tx.stockMovement.create({
          data: {
            itemId: li.itemId, type: 'PURCHASE', quantity: li.quantity,
            balance: it.quantity, reference: po.poNo, userId: req.user!.id,
          },
        });
      }

      await postJournal(tx, {
        description: `Goods received ${po.poNo}`,
        reference: po.poNo,
        userId: req.user!.id,
        lines: [
          { code: ACC.INVENTORY, debit: po.total.minus(po.vatAmount) }, // old orders have no VAT: this is their full total
          { code: ACC.VAT_PAYABLE, debit: po.vatAmount },
          { code: paid ? ACC.BANK : ACC.SALARIES_PAYABLE, credit: po.total },
        ],
      });

      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED', receivedAt: new Date() } });
      await audit(tx, {
        userId: req.user!.id, action: 'PO_RECEIVE', entity: 'PurchaseOrder',
        entityId: po.id, ip: clientIp(req), meta: { poNo: po.poNo, total: Number(po.total), paid },
      });
    }, SERIALIZABLE);

    res.json({ ok: true });
  }),
);