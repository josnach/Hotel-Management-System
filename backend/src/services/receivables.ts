import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { D, Prisma, prisma } from '../lib/prisma';
import { canApprove } from './policy';

export interface ReceivablesConfig {
  /** Days a company has to pay when it has no terms of its own. */
  defaultTermsDays: number;
  /** Most a company may owe when it has no limit of its own. Null means no limit. */
  defaultCreditLimit: number | null;
  /** What happens when a charge would take a company over its limit. */
  overLimitMode: 'OFF' | 'WARN' | 'BLOCK';
}

export const DEFAULT_RECEIVABLES: ReceivablesConfig = {
  defaultTermsDays: 30,
  defaultCreditLimit: null,
  overLimitMode: 'WARN',
};

const KEY = 'receivables.config';

export async function getReceivablesConfig(): Promise<ReceivablesConfig> {
  const r = await prisma.setting.findUnique({ where: { key: KEY } });

  if (!r) return DEFAULT_RECEIVABLES;

  try {
    return { ...DEFAULT_RECEIVABLES, ...JSON.parse(r.value) };
  } catch {
    return DEFAULT_RECEIVABLES;
  }
}

export async function saveReceivablesConfig(c: ReceivablesConfig) {
  await prisma.setting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(c) },
    create: { key: KEY, value: JSON.stringify(c) },
  });
}

export interface Line {
  date: Date;
  description: string;
  charge: number;
  payment: number;
}

interface AgingBuckets {
  current: number;
  d31_60: number;
  d61_90: number;
  over90: number;
}

interface AgingResult {
  outstanding: number;
  buckets: AgingBuckets;
  overdue: number;
  oldestDays: number;
  unallocatedCredit: number;
}

interface AgingReportRow extends AgingResult {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  termsDays: number;
  ownTerms: boolean;
  creditLimit: number | null;
  ownLimit: boolean;
  overLimit: boolean;
}

/** Everything a company has been charged and has paid: its group folios, plus city-ledger orders not yet settled. */
export async function groupLines(groupId: string): Promise<Line[]> {
  const [txs, orders] = await Promise.all([
    prisma.folioTransaction.findMany({
      where: { folio: { groupId } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.findMany({
      where: {
        groupId,
        paymentStatus: 'UNPAID',
        isStaffCredit: false,
        isComplimentary: false,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return [
    ...txs.map((t) => ({
      date: t.createdAt,
      description: t.description,
      charge: Number(t.bill),
      payment: Number(t.payment),
    })),
    ...orders.map((o) => ({
      date: o.createdAt,
      description: `Order ${o.orderNo} (city ledger)`,
      charge: Number(o.total),
      payment: 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}

const DAY = 86_400_000;

/** Payments clear the oldest charges first. What is left is sorted into age buckets (days since the charge). */
export function age(
  lines: Line[],
  termsDays: number,
  now = new Date(),
): AgingResult {
  let credit = lines.reduce((s, l) => s + l.payment, 0);

  const b: AgingBuckets = {
    current: 0,
    d31_60: 0,
    d61_90: 0,
    over90: 0,
  };

  let overdue = 0;
  let oldest = 0;

  for (const l of lines.filter((x) => x.charge > 0)) {
    const used = Math.min(credit, l.charge);
    credit -= used;

    const left = Math.round((l.charge - used) * 100) / 100;
    if (left <= 0) continue;

    const days = Math.floor((now.getTime() - l.date.getTime()) / DAY);
    oldest = Math.max(oldest, days);

    if (days <= 30) {
      b.current += left;
    } else if (days <= 60) {
      b.d31_60 += left;
    } else if (days <= 90) {
      b.d61_90 += left;
    } else {
      b.over90 += left;
    }

    if (days > termsDays) overdue += left;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const owed = b.current + b.d31_60 + b.d61_90 + b.over90;

  return {
    outstanding: round(owed - credit),
    buckets: {
      current: round(b.current),
      d31_60: round(b.d31_60),
      d61_90: round(b.d61_90),
      over90: round(b.over90),
    },
    overdue: round(overdue),
    oldestDays: oldest,
    unallocatedCredit: round(Math.max(0, credit)),
  };
}

/** Aging for every company that owes money or has a limit set. */
export async function agingReport() {
  const [groups, cfg] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: 'asc' } }),
    getReceivablesConfig(),
  ]);

  // Explicitly type the rows to prevent implicit any[] errors.
  const rows: AgingReportRow[] = [];

  for (const g of groups) {
    const terms = g.paymentTermsDays ?? cfg.defaultTermsDays;
    const limit =
      g.creditLimit !== null
        ? Number(g.creditLimit)
        : cfg.defaultCreditLimit;

    const a = age(await groupLines(g.id), terms);

    if (
      a.outstanding <= 0 &&
      g.creditLimit === null &&
      g.paymentTermsDays === null
    ) {
      continue;
    }

    rows.push({
      id: g.id,
      name: g.name,
      contact: g.contact,
      phone: g.phone,
      termsDays: terms,
      ownTerms: g.paymentTermsDays !== null,
      creditLimit: limit,
      ownLimit: g.creditLimit !== null,
      ...a,
      overLimit: limit !== null && a.outstanding > limit,
    });
  }

  const sum = (f: (r: AgingReportRow) => number) =>
    Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;

  return {
    config: cfg,
    rows,
    totals: {
      outstanding: sum((r) => r.outstanding),
      current: sum((r) => r.buckets.current),
      d31_60: sum((r) => r.buckets.d31_60),
      d61_90: sum((r) => r.buckets.d61_90),
      over90: sum((r) => r.buckets.over90),
      overdue: sum((r) => r.overdue),
      overLimit: rows.filter((r) => r.overLimit).length,
    },
  };
}

/**
 * Called before a charge goes to a company's account. In WARN mode the charge goes through and is recorded;
 * in BLOCK mode only a manager or admin can push a company past its limit.
 */
export async function checkCredit(
  groupId: string,
  newAmount: Prisma.Decimal.Value,
  role: string | undefined,
  userId: string,
) {
  const [g, cfg] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    getReceivablesConfig(),
  ]);

  if (!g || cfg.overLimitMode === 'OFF') return;

  const limit =
    g.creditLimit !== null
      ? Number(g.creditLimit)
      : cfg.defaultCreditLimit;

  if (limit === null) return;

  const owing = age(
    await groupLines(groupId),
    g.paymentTermsDays ?? cfg.defaultTermsDays,
  ).outstanding;

  const after = owing + Number(D(newAmount));

  if (after <= limit) return;

  const meta = {
    company: g.name,
    limit,
    owing,
    charge: Number(D(newAmount)),
    mode: cfg.overLimitMode,
  };

  if (cfg.overLimitMode === 'BLOCK' && !canApprove(role)) {
    throw new HttpError(
      409,
      `${g.name} would owe ₦${Math.round(after).toLocaleString('en-NG')}, over its limit of ₦${limit.toLocaleString('en-NG')}. A manager must approve this charge.`,
    );
  }

  await audit(prisma, {
    userId,
    action:
      cfg.overLimitMode === 'BLOCK'
        ? 'CREDIT_LIMIT_OVERRIDE'
        : 'CREDIT_LIMIT_EXCEEDED',
    entity: 'Group',
    entityId: groupId,
    meta,
  });
}
