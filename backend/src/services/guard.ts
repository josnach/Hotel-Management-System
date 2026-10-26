/**
 * Revenue Guard: finds the exceptions a manager should look at (paid voids, big discounts,
 * complimentary stays/orders, risky stock write-offs, unpaid balances that are going cold).
 *
 * The rules are pure functions (rule*) so they can be tested without a database; the query
 * layer (computeFlags) only loads the rows and hands them to the rules.
 */
import { prisma } from '../lib/prisma';
import { nightsBetween } from './stayNights';

export const DAY = 86_400_000;

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type FlagType =
  | 'VOID_PAID' | 'HIGH_DISCOUNT' | 'COMP_STAY' | 'COMP_ORDER'
  | 'ADJ_SELF_APPROVED' | 'ADJ_LARGE' | 'FOLIO_OPEN' | 'UNPAID_AGED';

export interface Flag {
  key: string;                 // "TYPE:entityId", the review key
  type: FlagType;
  severity: Severity;
  kind: 'AT_RISK' | 'GIVEN_AWAY';
  title: string;
  detail: string;
  amount: number;
  staffId: string | null;      // whose activity this is (for the scorecard)
  staff: string | null;
  involved: string[];          // every user id connected to it (conflict-of-interest check)
  at: Date;
  entity: string;
  entityId: string;
  review?: { status: string; note: string | null; by: string | null; at: Date } | null;
}

export const DEFAULTS = {
  discountPct: 20,        // % discount at check-in that triggers a flag
  discountFixed: 20_000,  // ₦ fixed discount that triggers a flag
  compOrderValue: 15_000, // ₦ value above which a complimentary order is MEDIUM instead of LOW
  voidValue: 10_000,      // ₦ value above which a paid void is serious
  adjustmentValue: 20_000, // ₦ cost value of a stock write-off that triggers a flag
  agingDays: 3,           // unpaid orders older than this are flagged
  folioDays: 3,           // checked-out folios still owing after this many days are flagged
};
export type Thresholds = typeof DEFAULTS;

export const SEV_RANK: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const bump = (s: Severity): Severity => (s === 'LOW' ? 'MEDIUM' : 'HIGH');
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const days = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);

// ───────────── Settings (stored in the existing Setting table as guard.<name>) ─────────────
export async function loadThresholds(): Promise<Thresholds> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'guard.' } } });
  const t: Thresholds = { ...DEFAULTS };
  for (const r of rows) {
    const k = r.key.slice('guard.'.length) as keyof Thresholds;
    const n = Number(r.value);
    if (k in t && Number.isFinite(n) && n >= 0) t[k] = n;
  }
  return t;
}

export async function saveThresholds(p: Partial<Thresholds>) {
  for (const [k, v] of Object.entries(p)) {
    if (!(k in DEFAULTS) || v === undefined) continue;
    await prisma.setting.upsert({ where: { key: `guard.${k}` }, update: { value: String(v) }, create: { key: `guard.${k}`, value: String(v) } });
  }
  invalidateCountCache();
  return loadThresholds();
}

// ───────────── Pure rules ─────────────
export interface VoidInput {
  id: string; orderNo: string; salesPoint: string; total: number; paymentMethod: string;
  isComplimentary: boolean; isStaffCredit: boolean; createdAt: Date; voidedAt: Date; voidReason: string | null;
  staffId: string; staffName: string; voidedById?: string | null; voidedByName?: string | null; wasPaid?: boolean | null;
}

/** A void on an order the customer had already paid for: the classic way cash goes missing. */
export function ruleVoid(o: VoidInput, t: Thresholds): Flag | null {
  const deferred = o.isStaffCredit || ['STAFF_CREDIT', 'CITY_LEDGER', 'ROOM_CHARGE'].includes(o.paymentMethod);
  const wasPaid = o.wasPaid ?? (!o.isComplimentary && !deferred);
  if (!wasPaid || o.total <= 0) return null;

  let severity: Severity = o.total >= t.voidValue ? (o.paymentMethod === 'CASH' ? 'HIGH' : 'MEDIUM') : 'LOW';
  // Voided on a later day than the sale: the day's cash was already counted and banked.
  const nextDay = o.voidedAt.toDateString() !== o.createdAt.toDateString();
  if (nextDay) severity = bump(severity);

  const mins = Math.max(0, Math.round((o.voidedAt.getTime() - o.createdAt.getTime()) / 60_000));
  const when = mins < 120 ? `${mins} min after the sale` : nextDay ? `${days(o.createdAt, o.voidedAt) || 1} day(s) after the sale` : `${Math.round(mins / 60)} h after the sale`;
  return {
    key: `VOID_PAID:${o.id}`, type: 'VOID_PAID', severity, kind: 'AT_RISK',
    title: `Paid ${o.paymentMethod.toLowerCase().replace('_', ' ')} order voided (${o.orderNo})`,
    detail: `${o.salesPoint}, ${naira(o.total)}, voided ${when}${o.voidedByName ? ` by ${o.voidedByName}` : ''}. Reason: ${o.voidReason ?? 'none given'}. Sold by ${o.staffName}.`,
    amount: o.total, staffId: o.staffId, staff: o.staffName,
    involved: [o.staffId, ...(o.voidedById ? [o.voidedById] : [])], at: o.voidedAt, entity: 'Order', entityId: o.id,
  };
}

export interface StayInput {
  id: string; room: string; guest: string; checkInAt: Date; expectedDeparture: Date; nightlyRate: number;
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED'; discountValue: number; discountReason: string | null;
  isComplimentary: boolean; complimentaryReason: string | null; authorizedBy: string | null;
  staffId: string | null; staffName: string | null;
}
const stayNights = (s: StayInput) =>
  nightsBetween(s.checkInAt, s.expectedDeparture);

export function ruleDiscount(s: StayInput, t: Thresholds): Flag | null {
  if (s.discountType === 'NONE' || s.isComplimentary) return null;
  const gross = s.nightlyRate * stayNights(s);
  const pct = s.discountType === 'PERCENTAGE' ? s.discountValue : 0;
  const fixed = s.discountType === 'FIXED' ? s.discountValue : 0;
  const hitPct = pct >= t.discountPct && pct > 0;
  const hitFixed = fixed >= t.discountFixed && fixed > 0;
  if (!hitPct && !hitFixed) return null;

  const est = s.discountType === 'PERCENTAGE' ? (gross * pct) / 100 : Math.min(fixed, gross);
  const huge = (hitPct && pct >= t.discountPct * 2) || (hitFixed && fixed >= t.discountFixed * 2);
  const noAuth = !s.authorizedBy?.trim();
  const severity: Severity = huge || noAuth ? 'HIGH' : 'MEDIUM';
  const what = s.discountType === 'PERCENTAGE' ? `${pct}% discount` : `${naira(fixed)} discount`;
  return {
    key: `HIGH_DISCOUNT:${s.id}`, type: 'HIGH_DISCOUNT', severity, kind: 'GIVEN_AWAY',
    title: `${what} on Room ${s.room}`,
    detail: `${s.guest}, about ${naira(est)} off over ${stayNights(s)} night(s). Reason: ${s.discountReason ?? 'none'}. ${noAuth ? 'No authorizer recorded.' : `Authorized by ${s.authorizedBy}.`}`,
    amount: est, staffId: s.staffId, staff: s.staffName, involved: s.staffId ? [s.staffId] : [],
    at: s.checkInAt, entity: 'Stay', entityId: s.id,
  };
}

export function ruleCompStay(s: StayInput): Flag | null {
  if (!s.isComplimentary) return null;
  const value = s.nightlyRate * stayNights(s);
  const noAuth = !s.authorizedBy?.trim();
  return {
    key: `COMP_STAY:${s.id}`, type: 'COMP_STAY', severity: noAuth ? 'HIGH' : 'MEDIUM', kind: 'GIVEN_AWAY',
    title: `Complimentary stay, Room ${s.room}`,
    detail: `${s.guest}, ${stayNights(s)} night(s) worth about ${naira(value)}. Reason: ${s.complimentaryReason ?? 'none'}. ${noAuth ? 'No authorizer recorded.' : `Authorized by ${s.authorizedBy}.`}`,
    amount: value, staffId: s.staffId, staff: s.staffName, involved: s.staffId ? [s.staffId] : [],
    at: s.checkInAt, entity: 'Stay', entityId: s.id,
  };
}

export interface CompOrderInput { id: string; orderNo: string; salesPoint: string; subtotal: number; createdAt: Date; staffId: string; staffName: string }
export function ruleCompOrder(o: CompOrderInput, t: Thresholds): Flag | null {
  if (o.subtotal <= 0) return null;
  return {
    key: `COMP_ORDER:${o.id}`, type: 'COMP_ORDER', severity: o.subtotal >= t.compOrderValue ? 'MEDIUM' : 'LOW', kind: 'GIVEN_AWAY',
    title: `Complimentary order ${o.orderNo}`,
    detail: `${o.salesPoint}, ${naira(o.subtotal)} given free, rung up by ${o.staffName}.`,
    amount: o.subtotal, staffId: o.staffId, staff: o.staffName, involved: [o.staffId], at: o.createdAt, entity: 'Order', entityId: o.id,
  };
}

export interface AdjInput {
  id: string; item: string; delta: number; costPrice: number; reason: string; status: string; createdAt: Date;
  requestedById: string; requestedByName: string; approvedById: string | null; approvedByName: string | null;
}
export function ruleAdjustment(a: AdjInput, t: Thresholds): Flag[] {
  if (a.delta >= 0 || a.status === 'REJECTED') return [];
  const value = Math.abs(a.delta) * a.costPrice;
  const out: Flag[] = [];
  const base = { kind: 'AT_RISK' as const, amount: value, staffId: a.requestedById, staff: a.requestedByName, at: a.createdAt, entity: 'StockAdjustment', entityId: a.id };
  const what = `${Math.abs(a.delta)} × ${a.item} (${naira(value)} at cost). Reason: ${a.reason}.`;
  if (a.status === 'APPROVED' && a.approvedById && a.approvedById === a.requestedById) {
    out.push({ ...base, key: `ADJ_SELF_APPROVED:${a.id}`, type: 'ADJ_SELF_APPROVED', severity: 'HIGH',
      title: `Stock write-off approved by the person who requested it`, detail: `${a.requestedByName} requested and approved: ${what}`, involved: [a.requestedById] });
  }
  if (value >= t.adjustmentValue) {
    out.push({ ...base, key: `ADJ_LARGE:${a.id}`, type: 'ADJ_LARGE', severity: value >= t.adjustmentValue * 5 ? 'HIGH' : 'MEDIUM',
      title: `Large stock write-off (${a.status.toLowerCase()})`,
      detail: `${a.requestedByName} requested${a.approvedByName ? `, ${a.approvedByName} approved` : ', not yet decided'}: ${what}`,
      involved: [a.requestedById, ...(a.approvedById ? [a.approvedById] : [])] });
  }
  return out;
}

export interface OpenFolioInput {
  id: string; folioNo: string; guest: string; room: string; balance: number; checkedOutAt: Date; isGroup: boolean;
  staffId: string | null; staffName: string | null;
}
export function ruleOpenFolio(f: OpenFolioInput, now: Date): Flag | null {
  if (f.balance <= 0) return null;
  const age = days(f.checkedOutAt, now);
  const severity: Severity = f.isGroup ? 'LOW' : age >= 14 ? 'HIGH' : 'MEDIUM';
  return {
    key: `FOLIO_OPEN:${f.id}`, type: 'FOLIO_OPEN', severity, kind: 'AT_RISK',
    title: `${f.guest} left owing ${naira(f.balance)}`,
    detail: `Room ${f.room}, folio ${f.folioNo}, checked out ${age} day(s) ago${f.isGroup ? ' (group account, may be billed to the city ledger)' : ''}.`,
    amount: f.balance, staffId: f.staffId, staff: f.staffName, involved: f.staffId ? [f.staffId] : [], at: f.checkedOutAt, entity: 'Folio', entityId: f.id,
  };
}

export interface AgedOrderInput {
  id: string; orderNo: string; salesPoint: string; total: number; createdAt: Date; isStaffCredit: boolean;
  customer: string; staffId: string; staffName: string;
}
export function ruleAgedOrder(o: AgedOrderInput, now: Date): Flag | null {
  if (o.total <= 0) return null;
  const age = days(o.createdAt, now);
  return {
    key: `UNPAID_AGED:${o.id}`, type: 'UNPAID_AGED', severity: age >= 14 ? 'HIGH' : 'MEDIUM', kind: 'AT_RISK',
    title: `${o.isStaffCredit ? 'Staff credit' : 'Credit sale'} unpaid for ${age} days (${o.orderNo})`,
    detail: `${o.salesPoint}, ${naira(o.total)}, customer: ${o.customer}. Sold by ${o.staffName}.`,
    amount: o.total, staffId: o.staffId, staff: o.staffName, involved: [o.staffId], at: o.createdAt, entity: 'Order', entityId: o.id,
  };
}

// ───────────── Query layer ─────────────
const fullName = (g?: { firstName: string; lastName: string } | null) => (g ? `${g.firstName} ${g.lastName}` : 'Walk-in');

export async function computeFlags(from: Date, to: Date, t: Thresholds, now = new Date()): Promise<Flag[]> {
  const flags: Flag[] = [];
  const inRange = { gte: from, lt: to };

  // 1) paid voids
  const voided = await prisma.order.findMany({
    where: { voidedAt: inRange },
    include: { staff: { select: { username: true } }, salesPoint: { select: { name: true } } },
  });
  if (voided.length) {
    const logs = await prisma.auditLog.findMany({
      where: { action: 'VOID_ORDER', entityId: { in: voided.map((o) => o.id) } },
      include: { user: { select: { username: true } } },
    });
    for (const o of voided) {
      const log = logs.find((l) => l.entityId === o.id);
      const meta = (log?.meta ?? {}) as { wasPaid?: boolean };
      const f = ruleVoid({
        id: o.id, orderNo: o.orderNo, salesPoint: o.salesPoint.name, total: Number(o.total), paymentMethod: o.paymentMethod,
        isComplimentary: o.isComplimentary, isStaffCredit: o.isStaffCredit, createdAt: o.createdAt, voidedAt: o.voidedAt ?? o.createdAt,
        voidReason: o.voidReason, staffId: o.staffId, staffName: o.staff.username,
        voidedById: log?.userId, voidedByName: log?.user?.username, wasPaid: typeof meta.wasPaid === 'boolean' ? meta.wasPaid : null,
      }, t);
      if (f) flags.push(f);
    }
  }

  // 2) discounts and complimentary stays (who did it comes from the CHECK_IN audit row)
  const stays = await prisma.stay.findMany({
    where: { checkInAt: inRange, OR: [{ discountType: { not: 'NONE' } }, { isComplimentary: true }] },
    include: { room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true } } },
  });
  if (stays.length) {
    const logs = await prisma.auditLog.findMany({
      where: { action: 'CHECK_IN', entity: 'Stay', entityId: { in: stays.map((s) => s.id) } },
      include: { user: { select: { username: true } } },
    });
    for (const s of stays) {
      const log = logs.find((l) => l.entityId === s.id);
      const input: StayInput = {
        id: s.id, room: s.room.number, guest: fullName(s.guest), checkInAt: s.checkInAt, expectedDeparture: s.expectedDeparture,
        nightlyRate: Number(s.nightlyRate), discountType: s.discountType, discountValue: Number(s.discountValue), discountReason: s.discountReason,
        isComplimentary: s.isComplimentary, complimentaryReason: s.complimentaryReason, authorizedBy: s.authorizedBy,
        staffId: log?.userId ?? null, staffName: log?.user?.username ?? null,
      };
      for (const f of [ruleDiscount(input, t), ruleCompStay(input)]) if (f) flags.push(f);
    }
  }

  // 3) complimentary orders
  const comps = await prisma.order.findMany({
    where: { isComplimentary: true, createdAt: inRange, paymentStatus: { not: 'VOIDED' } },
    include: { staff: { select: { username: true } }, salesPoint: { select: { name: true } } },
  });
  for (const o of comps) {
    const f = ruleCompOrder({ id: o.id, orderNo: o.orderNo, salesPoint: o.salesPoint.name, subtotal: Number(o.subtotal), createdAt: o.createdAt, staffId: o.staffId, staffName: o.staff.username }, t);
    if (f) flags.push(f);
  }

  // 4) stock write-offs
  const adjs = await prisma.stockAdjustment.findMany({
    where: { delta: { lt: 0 }, createdAt: inRange },
    include: { item: { select: { name: true, costPrice: true } }, requestedBy: { select: { username: true } } },
  });
  if (adjs.length) {
    const approverIds = [...new Set(adjs.map((a) => a.approvedById).filter((x): x is string => !!x))];
    const approvers = approverIds.length ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, username: true } }) : [];
    for (const a of adjs) {
      flags.push(...ruleAdjustment({
        id: a.id, item: a.item.name, delta: Number(a.delta), costPrice: Number(a.item.costPrice), reason: a.reason, status: a.status, createdAt: a.createdAt,
        requestedById: a.requestedById, requestedByName: a.requestedBy.username,
        approvedById: a.approvedById, approvedByName: approvers.find((u) => u.id === a.approvedById)?.username ?? null,
      }, t));
    }
  }

  // 5) open items: current state, ignores the date range
  const folios = await prisma.folio.findMany({
    where: { status: 'CHECKED_OUT', stay: { is: { checkOutAt: { lt: new Date(now.getTime() - t.folioDays * DAY) } } } },
    include: { stay: { include: { room: { select: { number: true } } } }, guest: { select: { firstName: true, lastName: true } }, group: { select: { name: true } } },
  });
  if (folios.length) {
    const sums = await prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folioId: { in: folios.map((f) => f.id) } }, _sum: { bill: true, payment: true } });
    const outLogs = await prisma.auditLog.findMany({
      where: { action: 'CHECK_OUT', entity: 'Stay', entityId: { in: folios.map((f) => f.stayId).filter((x): x is string => !!x) } },
      include: { user: { select: { username: true } } },
    });
    for (const f of folios) {
      const s = sums.find((x) => x.folioId === f.id);
      const balance = Number(s?._sum.bill ?? 0) - Number(s?._sum.payment ?? 0);
      const log = outLogs.find((l) => l.entityId === f.stayId);
      const flag = ruleOpenFolio({
        id: f.id, folioNo: f.folioNo, guest: f.group?.name ?? fullName(f.guest), room: f.stay?.room.number ?? '?', balance,
        checkedOutAt: f.stay?.checkOutAt ?? f.createdAt, isGroup: !!f.groupId, staffId: log?.userId ?? null, staffName: log?.user?.username ?? null,
      }, now);
      if (flag) flags.push(flag);
    }
  }

  const aged = await prisma.order.findMany({
    where: { paymentStatus: 'UNPAID', createdAt: { lt: new Date(now.getTime() - t.agingDays * DAY) } },
    include: { staff: { select: { username: true } }, salesPoint: { select: { name: true } }, guest: { select: { firstName: true, lastName: true } }, group: { select: { name: true } } },
  });
  for (const o of aged) {
    const f = ruleAgedOrder({
      id: o.id, orderNo: o.orderNo, salesPoint: o.salesPoint.name, total: Number(o.total), createdAt: o.createdAt, isStaffCredit: o.isStaffCredit,
      customer: o.group?.name ?? (o.guest ? fullName(o.guest) : o.isStaffCredit ? 'staff' : 'walk-in'), staffId: o.staffId, staffName: o.staff.username,
    }, now);
    if (f) flags.push(f);
  }

  return flags.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.amount - a.amount || b.at.getTime() - a.at.getTime());
}

/** Computes flags and attaches each one's review decision (if a manager has acted on it). */
export async function listFlags(from: Date, to: Date, t?: Thresholds, now = new Date()): Promise<Flag[]> {
  const th = t ?? (await loadThresholds());
  const flags = await computeFlags(from, to, th, now);
  if (!flags.length) return flags;
  const reviews = await prisma.guardReview.findMany({ where: { flagKey: { in: flags.map((f) => f.key) } } });
  const reviewers = reviews.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(reviews.map((r) => r.userId))] } }, select: { id: true, username: true } }) : [];
  for (const f of flags) {
    const r = reviews.find((x) => x.flagKey === f.key);
    f.review = r ? { status: r.status, note: r.note, by: reviewers.find((u) => u.id === r.userId)?.username ?? null, at: r.updatedAt } : null;
  }
  return flags;
}

// ───────────── Staff scorecard ─────────────
export interface ScoreRow {
  staffId: string; staff: string; orders: number; sales: number; voided: number; voidRate: number;
  paidVoids: number; comps: number; discounts: number; adjustments: number; high: number; medium: number; atRisk: number; givenAway: number;
}

export async function scorecard(flags: Flag[], from: Date, to: Date): Promise<ScoreRow[]> {
  const range = { gte: from, lt: to };
  const [orders, voids] = await Promise.all([
    prisma.order.groupBy({ by: ['staffId'], where: { createdAt: range }, _count: true, _sum: { total: true } }),
    prisma.order.groupBy({ by: ['staffId'], where: { createdAt: range, paymentStatus: 'VOIDED' }, _count: true }),
  ]);
  const ids = new Set<string>([...orders.map((o) => o.staffId), ...flags.map((f) => f.staffId).filter((x): x is string => !!x)]);
  if (!ids.size) return [];
  const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, username: true } });
  const rows: ScoreRow[] = [...ids].map((id) => {
    const mine = flags.filter((f) => f.staffId === id);
    const o = orders.find((x) => x.staffId === id);
    const count = o?._count ?? 0;
    const voided = voids.find((x) => x.staffId === id)?._count ?? 0;
    const sum = (k: Flag['kind']) => mine.filter((f) => f.kind === k).reduce((s, f) => s + f.amount, 0);
    return {
      staffId: id, staff: users.find((u) => u.id === id)?.username ?? 'unknown', orders: count, sales: Number(o?._sum.total ?? 0),
      voided, voidRate: count ? (voided / count) * 100 : 0,
      paidVoids: mine.filter((f) => f.type === 'VOID_PAID').length,
      comps: mine.filter((f) => f.type === 'COMP_ORDER' || f.type === 'COMP_STAY').length,
      discounts: mine.filter((f) => f.type === 'HIGH_DISCOUNT').length,
      adjustments: mine.filter((f) => f.type === 'ADJ_SELF_APPROVED' || f.type === 'ADJ_LARGE').length,
      high: mine.filter((f) => f.severity === 'HIGH').length, medium: mine.filter((f) => f.severity === 'MEDIUM').length,
      atRisk: sum('AT_RISK'), givenAway: sum('GIVEN_AWAY'),
    };
  });
  return rows.filter((r) => r.orders || r.high || r.medium || r.paidVoids || r.comps || r.discounts || r.adjustments)
    .sort((a, b) => b.high * 3 + b.medium - (a.high * 3 + a.medium) || b.voidRate - a.voidRate);
}

// ───────────── Count for the notification bell (cached for a minute) ─────────────
let cache: { at: number; n: number } | null = null;
export const invalidateCountCache = () => { cache = null; };
export async function openHighCount(): Promise<number> {
  if (cache && Date.now() - cache.at < 60_000) return cache.n;
  const now = new Date();
  const flags = await listFlags(new Date(now.getTime() - 7 * DAY), new Date(now.getTime() + DAY), undefined, now);
  cache = { at: Date.now(), n: flags.filter((f) => f.severity === 'HIGH' && !f.review).length };
  return cache.n;
}
