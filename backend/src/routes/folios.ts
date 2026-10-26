
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { asyncHandler, page, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { folioBalance, postFolioPayment } from '../services/folio';
import { audit } from '../lib/audit';
import { clientIp, HttpError } from '../lib/http';
import { deliveryOptions, listDeliveries, sendFolioDocument } from '../delivery/folioDelivery';
import { renderFolioInvoice, renderPaymentReceipt } from '../pdf/folioPdf';

export const foliosRouter = Router();

foliosRouter.get(
  '/',
  requireRole('MANAGER', 'RECEPTIONIST', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const { skip, take } = page(req.query, 25);
    const q = String(req.query.q ?? '').trim();

    const where: Prisma.FolioWhereInput = q
      ? {
          OR: [
            {
              folioNo: {
                contains: q,
                mode: 'insensitive',
              },
            },
            {
              guest: {
                OR: [
                  {
                    firstName: {
                      contains: q,
                      mode: 'insensitive',
                    },
                  },
                  {
                    lastName: {
                      contains: q,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            },
            {
              group: {
                name: {
                  contains: q,
                  mode: 'insensitive',
                },
              },
            },
          ],
        }
      : {};

    const [rows, total, active, checkedOut, settled] = await Promise.all([
      prisma.folio.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          guest: true,
          group: true,
          stay: {
            include: { room: true },
          },
        },
      }),
      prisma.folio.count({ where }),
      prisma.folio.count({
        where: { status: 'ACTIVE' },
      }),
      prisma.folio.count({
        where: { status: 'CHECKED_OUT' },
      }),
      prisma.folio.count({
        where: { status: 'SETTLED' },
      }),
    ]);

    const withBal = await Promise.all(
      rows.map(async (f) => ({
        ...f,
        balance: await folioBalance(f.id),
      })),
    );

    res.json({
      counts: { total, active, checkedOut, settled },
      rows: withBal,
    });
  }),
);

foliosRouter.get(
  '/:id',
  requireRole('MANAGER', 'RECEPTIONIST', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const f = await prisma.folio.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        guest: true,
        group: true,
        stay: {
          include: { room: true },
        },
        txs: {
          orderBy: { createdAt: 'asc' },
          include: { salesPoint: true },
        },
      },
    });

    let run = D(0);

    const txs = f.txs.map((t) => {
      run = run.plus(t.bill).minus(t.payment);

      return {
        ...t,
        balance: run,
      };
    });

    res.json({
      ...f,
      txs,
      balance: run,
    });
  }),
);

foliosRouter.post(
  '/:id/payments',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const b = parse(
      z.object({
        amount: z
          .union([z.string(), z.number()])
          .transform(String)
          .refine(
            (value) =>
              /^\d+(?:\.\d{1,2})?$/.test(value) &&
              Number.isFinite(Number(value)) &&
              Number(value) > 0,
            'Amount must be positive and have at most two decimal places',
          ),
        method: z.enum(['CASH', 'CARD', 'TRANSFER']),
        description: z.string().trim().max(250).optional(),
      }),
      req.body,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const f = await tx.folio.findUniqueOrThrow({
          where: { id: req.params.id },
        });

        if (f.status === 'SETTLED') {
          return { conflict: true as const };
        }

        await postFolioPayment(tx, {
          folioId: f.id,
          amount: b.amount,
          method: b.method,
          description: b.description,
          userId: req.user!.id,
          groupFolio: !!f.groupId,
        });

        return {
          conflict: false as const,
          balance: await folioBalance(f.id, tx),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (result.conflict) {
      return res.status(409).json({
        message: 'Cannot accept payment on a settled folio',
      });
    }

    return res.status(201).json({
      balance: result.balance,
    });
  }),
);

foliosRouter.post(
  '/:id/settle',
  requireRole('RECEPTIONIST', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(
      async (tx) => {
        const folio = await tx.folio.findUniqueOrThrow({
          where: { id: req.params.id },
        });

        if (folio.status === 'SETTLED') {
          return {
            conflict: 'Folio is already settled' as const,
          };
        }

        const balance = await folioBalance(folio.id, tx);

        if (balance.gt(0)) {
          return {
            conflict: `Outstanding balance of ₦${balance.toFixed(2)}`,
          };
        }

        const updated = await tx.folio.update({
          where: { id: folio.id },
          data: { status: 'SETTLED' },
        });

        return { folio: updated };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if ('conflict' in result) {
      return res.status(409).json({
        message: result.conflict,
      });
    }

    return res.json(result.folio);
  }),
);

/* ───────────── PDFs and delivery ───────────── */
const sendPdf = (res: import('express').Response, f: { buffer: Buffer; filename: string }, download: boolean) => {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(f.buffer.length), 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${f.filename}"`, 'Cache-Control': 'no-store' });
  res.end(f.buffer);
};

foliosRouter.get('/:id/invoice.pdf', asyncHandler(async (req, res) => sendPdf(res, await renderFolioInvoice(req.params.id), req.query.download === '1')));
foliosRouter.get('/:id/payments/:txId/receipt.pdf', asyncHandler(async (req, res) => sendPdf(res, await renderPaymentReceipt(req.params.id, req.params.txId), req.query.download === '1')));

foliosRouter.get('/:id/delivery-options', asyncHandler(async (req, res) => res.json(await deliveryOptions(req.params.id))));
foliosRouter.get('/:id/deliveries', asyncHandler(async (req, res) => res.json(await listDeliveries(req.params.id))));

foliosRouter.post('/:id/send', requireRole('RECEPTIONIST', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    kind: z.enum(['INVOICE', 'RECEIPT']),
    txId: z.string().optional(),
    targets: z.array(z.object({ channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS']), to: z.string().trim().min(3).max(120) })).min(1).max(6),
  }), req.body);
  for (const t of b.targets) if (t.channel === 'EMAIL' && !z.string().email().safeParse(t.to).success) throw new HttpError(400, `"${t.to}" is not a valid email address`);
  const results = await sendFolioDocument({ folioId: req.params.id, kind: b.kind, txId: b.txId, targets: b.targets, userId: req.user!.id });
  await audit(prisma, { userId: req.user!.id, action: 'FOLIO_SENT', entity: 'Folio', entityId: req.params.id, ip: clientIp(req), meta: { kind: b.kind, results: results.map((r) => `${r.channel}:${r.status}`) } });
  res.json({ results });
}));