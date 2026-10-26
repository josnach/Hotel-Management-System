import { ShiftName } from '@prisma/client';
import { D, prisma } from '../lib/prisma';
import { ACC } from './accounting';
import { openHighCount } from './guard';
import { addDays, bounds, lastClosedDate, ymd } from './period';
import { agingReport } from './receivables';

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: unknown) => Math.round(n(v) * 100) / 100;

/** Same bands as the shift report: MORNING 07-15, AFTERNOON 15-22, NIGHT 22-07 (a night shift opened after midnight belongs to the day before). */
export function shiftFor(now: Date): { name: ShiftName; date: string } {
  const h = now.getHours();
  if (h >= 7 && h < 15) return { name: 'MORNING', date: ymd(now) };
  if (h >= 15 && h < 22) return { name: 'AFTERNOON', date: ymd(now) };
  return { name: 'NIGHT', date: h < 7 ? addDays(ymd(now), -1) : ymd(now) };
}

/** What the books say one cashier handled between two moments: net cash in the drawer and non-cash (card/transfer) received. */
export async function cashHandled(userId: string, from: Date, to: Date) {
  const where = (code: string) => ({ account: { code }, entry: { createdById: userId, createdAt: { gte: from, lt: to } } });
  const [cash, bank] = await Promise.all([
    prisma.journalLine.aggregate({ where: where(ACC.CASH), _sum: { debit: true, credit: true } }),
    prisma.journalLine.aggregate({ where: where(ACC.BANK), _sum: { debit: true, credit: true } }),
  ]);
  return {
    cashIn: D(cash._sum.debit ?? 0), cashOut: D(cash._sum.credit ?? 0),
    net: D(cash._sum.debit ?? 0).minus(D(cash._sum.credit ?? 0)),
    nonCash: D(bank._sum.debit ?? 0).minus(D(bank._sum.credit ?? 0)),
  };
}

const sumAcc = async (code: string, from: Date, to: Date) => {
  const a = await prisma.journalLine.aggregate({ where: { account: { code }, entry: { date: { gte: from, lt: to } } }, _sum: { debit: true, credit: true } });
  return { debit: D(a._sum.debit ?? 0), credit: D(a._sum.credit ?? 0) };
};

/** The manager's report for one business date, plus anything that stops the date being closed. */
export async function buildAuditReport(date: string) {
  const { start, end } = bounds(date);
  const now = new Date();
  const blockers: string[] = [];
  const warnings: string[] = [];

  const last = await lastClosedDate();
  if (last && date <= last) blockers.push(`${date} is already closed.`);
  else if (last && date !== addDays(last, 1)) blockers.push(`Close ${addDays(last, 1)} first. Business dates are closed in order.`);
  if (end > now) blockers.push('This business date has not ended yet. Night audit can only close a date that is over.');

  const shifts = await prisma.shiftSession.findMany({ where: { openedAt: { lt: end }, OR: [{ closedAt: null }, { closedAt: { gt: start } }] }, include: { cashier: { select: { id: true, fullName: true, username: true } } }, orderBy: { openedAt: 'asc' } });
  for (const s of shifts) if (s.status === 'OPEN') blockers.push(`${s.cashier?.fullName ?? s.cashier?.username ?? 'A cashier'}'s ${s.name.toLowerCase()} shift is still open. Close it first.`);

  const [rooms, revRooms, revFnb, revOther, cash, bank, vat, svc, comp, cogs] = await Promise.all([
    prisma.room.count(),
    sumAcc(ACC.ROOM_REVENUE, start, end), sumAcc(ACC.FNB_REVENUE, start, end), sumAcc(ACC.OTHER_REVENUE, start, end),
    sumAcc(ACC.CASH, start, end), sumAcc(ACC.BANK, start, end), sumAcc(ACC.VAT_PAYABLE, start, end), sumAcc(ACC.SERVICE_PAYABLE, start, end),
    sumAcc(ACC.COMPLIMENTARY, start, end), sumAcc(ACC.COGS, start, end),
  ]);
  const roomRev = revRooms.credit.minus(revRooms.debit), fnbRev = revFnb.credit.minus(revFnb.debit), otherRev = revOther.credit.minus(revOther.debit);

  const [occupied, arrivals, departures] = await Promise.all([
    prisma.stay.count({ where: { checkInAt: { lt: end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: end } }] } }),
    prisma.stay.count({ where: { checkInAt: { gte: start, lt: end } } }),
    prisma.stay.count({ where: { checkOutAt: { gte: start, lt: end } } }),
  ]);

  // Cash taken by someone who ran no shift that day: nobody counted it, so nobody can be short.
  const cashUsers = await prisma.journalEntry.findMany({ where: { createdAt: { gte: start, lt: end }, createdById: { not: null }, lines: { some: { account: { code: ACC.CASH }, debit: { gt: 0 } } } }, select: { createdById: true }, distinct: ['createdById'] });
  const covered = new Set(shifts.map((s) => s.cashierId));
  const unshifted: { userId: string; name: string; cash: number }[] = [];
  for (const u of cashUsers) {
    if (!u.createdById || covered.has(u.createdById)) continue;
    const c = await cashHandled(u.createdById, start, end);
    if (c.net.gt(0)) {
      const user = await prisma.user.findUnique({ where: { id: u.createdById }, select: { fullName: true, username: true } });
      unshifted.push({ userId: u.createdById, name: user?.fullName ?? user?.username ?? 'Unknown', cash: r2(c.net) });
    }
  }
  if (unshifted.length) warnings.push(`${unshifted.length} user(s) took cash without opening a shift (₦${unshifted.reduce((s, u) => s + u.cash, 0).toLocaleString('en-NG')}).`);

  const logs = await prisma.auditLog.findMany({ where: { createdAt: { gte: start, lt: end }, action: { in: ['VOID_ORDER', 'COMP_ORDER', 'STAFF_CREDIT_ORDER', 'CASH_VARIANCE'] } }, select: { action: true, meta: true } });
  const sumMeta = (a: string, k: string) => logs.filter((l) => l.action === a).reduce((s, l) => s + n((l.meta as any)?.[k]), 0);
  const count = (a: string) => logs.filter((l) => l.action === a).length;

  const [balances, cityLedger, unpaidOrders, pendingAdj, high] = await Promise.all([
    prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folio: { status: { in: ['ACTIVE', 'CHECKED_OUT'] } } }, _sum: { bill: true, payment: true } }),
    prisma.journalLine.aggregate({ where: { account: { code: ACC.AR_CITY }, entry: { date: { lt: end } } }, _sum: { debit: true, credit: true } }),
    prisma.order.count({ where: { paymentStatus: 'UNPAID', createdAt: { gte: start, lt: end } } }),
    prisma.stockAdjustment.count({ where: { status: 'PENDING' } }),
    openHighCount(),
  ]);
  const aging = await agingReport();
  if (aging.totals.over90 > 0) warnings.push(`Companies owe ₦${aging.totals.over90.toLocaleString('en-NG')} that is over 90 days old.`);
  if (aging.totals.overLimit > 0) warnings.push(`${aging.totals.overLimit} company account(s) are over their credit limit.`);
  const owing = balances.map((b) => D(b._sum.bill ?? 0).minus(D(b._sum.payment ?? 0))).filter((x) => x.gt(0));
  if (unpaidOrders) warnings.push(`${unpaidOrders} order(s) from this date are still unpaid.`);
  if (pendingAdj) warnings.push(`${pendingAdj} stock adjustment(s) are waiting for approval.`);

  const shiftRows = shifts.map((s) => ({
    id: s.id, name: s.name, cashier: s.cashier?.fullName ?? s.cashier?.username ?? '—', status: s.status, openedAt: s.openedAt, closedAt: s.closedAt,
    openingFloat: n(s.openingFloat), expectedCash: s.expectedCash === null ? null : n(s.expectedCash), declaredCash: s.declaredCash === null ? null : n(s.declaredCash), overShort: s.overShort === null ? null : n(s.overShort), notes: s.notes,
  }));
  const overShort = shiftRows.reduce((t, s) => t + (s.overShort ?? 0), 0);

  return {
    date, blockers, warnings, canClose: blockers.length === 0,
    revenue: { rooms: r2(roomRev), fnb: r2(fnbRev), other: r2(otherRev), total: r2(roomRev.plus(fnbRev).plus(otherRev)), vat: r2(vat.credit.minus(vat.debit)), serviceCharge: r2(svc.credit.minus(svc.debit)), complimentaryValue: r2(comp.debit.minus(comp.credit)), costOfGoodsSold: r2(cogs.debit.minus(cogs.credit)) },
    collections: { cash: r2(cash.debit), cashPaidOut: r2(cash.credit), bankAndCard: r2(bank.debit) },
    rooms: { total: rooms, occupied, occupancyPct: rooms ? Math.round((occupied / rooms) * 1000) / 10 : 0, arrivals, departures, adr: occupied ? r2(roomRev.div(occupied)) : 0, revPar: rooms ? r2(roomRev.div(rooms)) : 0 },
    shifts: shiftRows, cashOverShort: r2(overShort), unshiftedCash: unshifted,
    exceptions: { voids: count('VOID_ORDER'), voidValue: r2(sumMeta('VOID_ORDER', 'total')), complimentaryOrders: count('COMP_ORDER'), staffCreditOrders: count('STAFF_CREDIT_ORDER'), cashVariances: count('CASH_VARIANCE'), openHighRiskFlags: high },
    balances: { inHouseAndUnsettled: r2(owing.reduce((s, x) => s.plus(x), D(0))), foliosOwing: owing.length, cityLedger: r2(D(cityLedger._sum.debit ?? 0).minus(D(cityLedger._sum.credit ?? 0))), receivables: { outstanding: aging.totals.outstanding, overdue: aging.totals.overdue, over90: aging.totals.over90, overLimitAccounts: aging.totals.overLimit } },
  };
}
