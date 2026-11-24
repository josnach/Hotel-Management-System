import { CityLedgerType } from '@prisma/client';
import { Prisma, D, Tx } from '../lib/prisma';
import { ACC, postJournal } from './accounting';

/**
 * Creates a city-ledger entry and its journal in one go (call inside a transaction).
 *
 *   DEBIT  (guest owes hotel):  Dr City Ledger receivable / Cr Guest receivable
 *   CREDIT (hotel owes guest):  Dr Guest receivable        / Cr Guest deposits
 *
 * Used by the "Add Transaction" screen and by checkout when a balance is moved to the city ledger.
 */
export async function createLedgerEntry(
  tx: Tx,
  p: {
    guestId?: string | null;
    groupId?: string | null;
    stayId?: string | null;
    folioId?: string | null;
    type: CityLedgerType;
    amount: Prisma.Decimal.Value;
    description: string;
    date?: Date;
    userId?: string;
  },
) {
  const amount = D(p.amount);

  const entry = await tx.cityLedgerEntry.create({
    data: {
      guestId: p.guestId ?? null,
      groupId: p.groupId ?? null,
      stayId: p.stayId ?? null,
      folioId: p.folioId ?? null,
      type: p.type,
      amount,
      description: p.description,
      transactionDate: p.date ?? new Date(),
      createdById: p.userId,
    },
  });

  const journal = await postJournal(tx, {
    date: p.date,
    description: p.description,
    reference: `CITYLEDGER:${entry.id}`,
    userId: p.userId,
    lines:
      p.type === 'DEBIT'
        ? [{ code: ACC.AR_CITY, debit: amount }, { code: ACC.AR_GUEST, credit: amount }]
        : [{ code: ACC.AR_GUEST, debit: amount }, { code: ACC.GUEST_DEPOSITS, credit: amount }],
  });

  return tx.cityLedgerEntry.update({
    where: { id: entry.id },
    data: { journalId: journal?.id },
  });
}
