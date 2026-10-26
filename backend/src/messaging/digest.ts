import { config } from '../config';
import { dayRange } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { ACC } from '../services/accounting';
import { openHighCount } from '../services/guard';
import { enqueue } from './outbox';

const naira = (n: unknown) => '₦' + Math.round(Number(n ?? 0)).toLocaleString('en-NG');

/** Net credit (revenue) or debit (receipts) on one account code for a business day. */
async function accountDay(code: string, side: 'credit' | 'debit', from: Date, to: Date) {
  const a = await prisma.journalLine.aggregate({ where: { account: { code }, entry: { date: { gte: from, lt: to } } }, _sum: { credit: true, debit: true } });
  return side === 'credit' ? D(a._sum.credit ?? 0).minus(D(a._sum.debit ?? 0)) : D(a._sum.debit ?? 0);
}

/** The eight figures the owner_daily_digest template shows (after the owner's first name). Each is short, single-line text. */
export async function buildDigestParams(day = new Date()): Promise<string[]> {
  const { start, end } = dayRange(day);
  const [rooms, fnb, other, cash, bank, totalRooms, occupied, balances, exceptions] = await Promise.all([
    accountDay(ACC.ROOM_REVENUE, 'credit', start, end), accountDay(ACC.FNB_REVENUE, 'credit', start, end), accountDay(ACC.OTHER_REVENUE, 'credit', start, end),
    accountDay(ACC.CASH, 'debit', start, end), accountDay(ACC.BANK, 'debit', start, end),
    prisma.room.count(), prisma.room.count({ where: { status: 'OCCUPIED' } }),
    prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folio: { status: { in: ['ACTIVE', 'CHECKED_OUT'] } } }, _sum: { bill: true, payment: true } }),
    openHighCount(),
  ]);
  const owing = balances.map((b) => D(b._sum.bill ?? 0).minus(D(b._sum.payment ?? 0))).filter((x) => x.gt(0));
  const outstanding = owing.reduce((s, x) => s.plus(x), D(0));
  const pct = totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;
  return [
    new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: config.hotelTz }).format(day),
    naira(rooms.plus(fnb).plus(other)),
    `${pct}% (${occupied}/${totalRooms} rooms)`,
    `Rooms ${naira(rooms)}, F&B ${naira(fnb)}`,
    `Cash ${naira(cash)}, bank/card ${naira(bank)}`,
    `${naira(outstanding)} across ${owing.length} folios`,
    String(exceptions),
    `${config.appUrl}/guard`,
  ];
}

const hourInHotel = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: config.hotelTz }).format(d)) % 24;
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.hotelTz }).format(d);

/** When DIGEST_ON_AUDIT=true the digest goes out the moment night audit closes a date, with that date's figures. */
export async function queueDigestForAudit(date: string) {
  if (process.env.DIGEST_ON_AUDIT !== 'true') return 0;
  const owners = await prisma.ownerRecipient.findMany({ where: { active: true } });
  if (!owners.length) return 0;
  const params = await buildDigestParams(new Date(`${date}T12:00:00`));
  let queued = 0;
  for (const o of owners) if (await enqueue({ dedupeKey: `owner-digest-audit:${o.id}:${date}`, phone: o.phone, template: 'owner_daily_digest', params: [o.name.split(' ')[0], ...params] })) queued++;
  return queued;
}

/** Hourly: queue the digest for every active owner whose chosen hour is now. One digest per owner per day. */
export async function queueOwnerDigests(now = new Date()) {
  if (process.env.DIGEST_ON_AUDIT === 'true') return 0; // the audit sends it instead
  const owners = await prisma.ownerRecipient.findMany({ where: { active: true, digestHour: hourInHotel(now) } });
  if (!owners.length) return 0;
  const params = await buildDigestParams(now);
  let queued = 0;
  for (const o of owners) {
    if (await enqueue({ dedupeKey: `owner-digest:${o.id}:${dayKey(now)}`, phone: o.phone, template: 'owner_daily_digest', params: [o.name.split(' ')[0], ...params] })) queued++;
  }
  return queued;
}
