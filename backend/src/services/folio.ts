import { PaymentMethod } from '@prisma/client';
import { Prisma, D, Tx, prisma } from '../lib/prisma';
import { ACC, postJournal } from './accounting';

export const newFolioNo = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, '0');
  return `F${d}${hex}`;
};

export const cashAccountFor = (m?: PaymentMethod | null) => (m === 'CASH' || !m ? ACC.CASH : ACC.BANK);

export async function folioBalance(folioId: string, tx: Tx | typeof prisma = prisma) {
  const a = await tx.folioTransaction.aggregate({ where: { folioId }, _sum: { bill: true, payment: true } });
  return D(a._sum.bill ?? 0).minus(D(a._sum.payment ?? 0));
}

/** Debit the guest folio and credit a revenue/liability account. */
export async function postFolioCharge(
  tx: Tx,
  p: {
    folioId: string;
    description: string;
    amount: Prisma.Decimal.Value;
    creditCode: string;
    salesPointId?: string | null;
    userId?: string;
    reference?: string;
    groupFolio?: boolean;
  },
) {
  const amount = D(p.amount);
  if (amount.lte(0)) return null;
  const journal = await postJournal(tx, {
    description: p.description,
    reference: p.reference,
    userId: p.userId,
    lines: [
      { code: p.groupFolio ? ACC.AR_CITY : ACC.AR_GUEST, debit: amount },
      { code: p.creditCode, credit: amount },
    ],
  });
  return tx.folioTransaction.create({
    data: {
      folioId: p.folioId,
      type: p.groupFolio ? 'DEBIT_GROUP' : 'DEBIT_PERSONAL',
      description: p.description,
      bill: amount,
      salesPointId: p.salesPointId ?? undefined,
      journalId: journal?.id,
      userId: p.userId,
    },
  });
}

export async function postFolioPayment(
  tx: Tx,
  p: {
    folioId: string;
    amount: Prisma.Decimal.Value;
    method: PaymentMethod;
    description?: string;
    userId?: string;
    groupFolio?: boolean;
    reference?: string;
  },
) {
  const amount = D(p.amount);
  if (amount.lte(0)) return null;
  const description = p.description ?? 'Payment received';
  const journal = await postJournal(tx, {
    description,
    reference: p.reference,
    userId: p.userId,
    lines: [
      { code: cashAccountFor(p.method), debit: amount },
      { code: p.groupFolio ? ACC.AR_CITY : ACC.AR_GUEST, credit: amount },
    ],
  });
  return tx.folioTransaction.create({
    data: {
      folioId: p.folioId,
      type: 'CREDIT',
      description,
      payment: amount,
      method: p.method,
      journalId: journal?.id,
      userId: p.userId,
    },
  });
}
