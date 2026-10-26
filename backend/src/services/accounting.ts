import { assertDateOpen } from './period';
import { Prisma, D, Tx, prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';

/** System account codes (seeded). Ranges: 1=Asset 2=Liability 3=Equity 4=Revenue 5=Expense */
export const ACC = {
  CASH: '110000',
  BANK: '120000',
  AR_GUEST: '140000',
  AR_CITY: '141000',
  INVENTORY: '150000',
  VAT_PAYABLE: '210000',
  SERVICE_PAYABLE: '220000',
  GUEST_DEPOSITS: '230000',
  SALARIES_PAYABLE: '240000',
  PAYE_PAYABLE: '241000',
  PENSION_PAYABLE: '242000',
  NHF_PAYABLE: '243000',
  LEVIES_PAYABLE: '244000',
  ROOM_REVENUE: '400000',
  FNB_REVENUE: '410000',
  OTHER_REVENUE: '420000',
  SALARIES: '510000',
  EMPLOYER_PENSION: '511500',
  LEVIES_EXPENSE: '511600',
  DIESEL: '521100',
  COGS: '530000',
  COMPLIMENTARY: '580000',
} as const;

export interface JLine {
  code: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  memo?: string;
}

/** Posts a balanced double-entry journal. Throws if it does not balance. */
export async function postJournal(
  tx: Tx,
  p: { date?: Date; description: string; reference?: string; userId?: string; lines: JLine[] },
) {
  if (p.date) await assertDateOpen(p.date, tx); // only backdated entries can land in a closed day
  const lines = p.lines.filter((l) => D(l.debit ?? 0).gt(0) || D(l.credit ?? 0).gt(0));
  const dr = lines.reduce((s, l) => s.plus(D(l.debit ?? 0)), D(0));
  const cr = lines.reduce((s, l) => s.plus(D(l.credit ?? 0)), D(0));
  if (!dr.equals(cr)) throw new HttpError(500, `Unbalanced journal: debit ${dr} vs credit ${cr}`);
  if (lines.length === 0) return null;

  const accounts = await tx.account.findMany({ where: { code: { in: lines.map((l) => l.code) } } });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  for (const l of lines) if (!byCode.has(l.code)) throw new HttpError(500, `Account ${l.code} is missing from the chart of accounts`);

  return tx.journalEntry.create({
    data: {
      date: p.date ?? new Date(),
      description: p.description,
      reference: p.reference,
      createdById: p.userId,
      lines: {
        create: lines.map((l) => ({
          accountId: byCode.get(l.code)!,
          debit: D(l.debit ?? 0),
          credit: D(l.credit ?? 0),
          memo: l.memo,
        })),
      },
    },
  });
}

/** Reverses every journal that carries `reference` (used when voiding). */
export async function reverseByReference(tx: Tx, reference: string, userId?: string) {
  const entries = await tx.journalEntry.findMany({
    where: { reference, NOT: { description: { startsWith: 'REVERSAL' } } },
    include: { lines: { include: { account: true } } },
  });
  for (const e of entries) {
    await postJournal(tx, {
      description: `REVERSAL: ${e.description}`,
      reference,
      userId,
      lines: e.lines.map((l) => ({ code: l.account.code, debit: l.credit, credit: l.debit })),
    });
  }
}

/** Net balance per account up to a date (debit-positive). */
export async function balances(from?: Date, to?: Date) {
  const where: Prisma.JournalLineWhereInput = { entry: { date: { gte: from, lte: to } } };
  const grouped = await prisma.journalLine.groupBy({ by: ['accountId'], where, _sum: { debit: true, credit: true } });
  const accounts = await prisma.account.findMany();
  const m = new Map(grouped.map((g) => [g.accountId, g._sum]));
  return accounts.map((a) => {
    const s = m.get(a.id);
    const debit = s?.debit ?? D(0);
    const credit = s?.credit ?? D(0);
    return { ...a, debit, credit, net: debit.minus(credit) };
  });
}

export const revenueAccountFor = (salesPointName: string) =>
  /other/i.test(salesPointName)
  ? ACC.OTHER_REVENUE
  : ACC.FNB_REVENUE;