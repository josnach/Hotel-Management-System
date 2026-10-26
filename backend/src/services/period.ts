import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/** 'YYYY-MM-DD' of a Date, in the server's (hotel's) timezone. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Midnight-to-midnight window of a business date, in hotel time. */
export const bounds = (date: string) => { const start = new Date(`${date}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; };
/** A business date as stored in a @db.Date column (UTC midnight, so it never shifts a day). */
export const dbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const addDays = (date: string, n: number) => { const d = bounds(date).start; d.setDate(d.getDate() + n); return ymd(d); };

/** The last business date that night audit has closed, as 'YYYY-MM-DD', or null. */
export async function lastClosedDate(db: Db = prisma): Promise<string | null> {
  const a = await db.nightAudit.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
  return a ? a.date.toISOString().slice(0, 10) : null;
}

/** Postings dated inside a closed business date are refused; everything dated now is unaffected. */
export async function assertDateOpen(date: Date, db: Db = prisma) {
  const last = await lastClosedDate(db);
  if (last && date < bounds(last).end) throw new HttpError(409, `The business date ${last} has been closed by night audit. Post this entry with today's date instead.`);
}
