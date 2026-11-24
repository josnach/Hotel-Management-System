
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ClipboardList, DollarSign, Filter, Minus, Printer, TrendingUp } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Btn, Card, DataTable, FieldBox, PageTitle, Pill, ReportPage, SectionCard, StatCard, Td, daysAgo, dShort, inputCls, naira, tShort } from '@/components/reports/ui';

interface SalesPoint {
  id: string;
  name: string;
  location?: string | null;
  isFrontdesk: boolean;
}

interface Row {
  id: string;
  time: string;
  guestName: string;
  room: string | null;
  folioNo: string;
  description: string;
  method: string | null;
  type: 'PAYMENT' | 'REFUND';
  salesPoint: string;
  amount: number;
  receivedBy: string | null;
}

interface Data {
  totals: {
    payments: { amount: number; count: number };
    refunds: { amount: number; count: number };
    net: number;
    transactions: number;
  };
  methods: Record<
    'cash' | 'posCard' | 'transfer' | 'uncategorized',
    { amount: number; count: number }
  >;
  rows: Row[];
}

const SHIFTS: [string, string][] = [
  ['', 'All Shifts'],
  ['MORNING', 'Morning (07:00 - 14:00)'],
  ['AFTERNOON', 'Afternoon (14:00 - 22:00)'],
  ['NIGHT', 'Night (22:00 - 07:00)'],
];

const QUICK: [string, number][] = [
  ['Today', 0],
  ['Yesterday', 1],
  ['7 Days Ago', 7],
  ['30 Days Ago', 30],
];

const spLabel = (s: SalesPoint) =>
  `${s.name}${s.location ? ` (${s.location})` : ''}`;

const METHODS = [
  {
    key: 'cash',
    icon: '💰',
    label: 'Cash',
    tile: 'border-green-100 bg-green-50',
    text: 'text-green-600',
  },
  {
    key: 'posCard',
    icon: '💳',
    label: 'POS / Card',
    tile: 'border-blue-100 bg-blue-50',
    text: 'text-blue-600',
  },
  {
    key: 'transfer',
    icon: '🏦',
    label: 'Transfer',
    tile: 'border-fuchsia-100 bg-fuchsia-50',
    text: 'text-purple-600',
  },
  {
    key: 'uncategorized',
    icon: '❓',
    label: 'Uncategorized',
    tile: 'border-slate-200 bg-slate-50',
    text: 'text-slate-900',
  },
] as const;

export default function PaymentsShiftReport() {
  const [qs] = useSearchParams();

  const sps = useGet<SalesPoint[]>('/reports/payments-shift/sales-points');

  const [draft, setDraft] = useState({
    date: qs.get('date') ?? daysAgo(0),
    shift: qs.get('shift') ?? '',
    salesPointId: '',
  });

  const [applied, setApplied] = useState(draft);
  const [ready, setReady] = useState(false);

  // Default the sales point to Frontdesk once the list is known,
  // then allow the first request.
  useEffect(() => {
    if (ready || !(sps.data || sps.error)) return;

    const fd = sps.data?.find((s) => s.isFrontdesk);

    if (fd && !qs.has('date')) {
      setDraft((d) => ({ ...d, salesPointId: fd.id }));
      setApplied((a) => ({ ...a, salesPointId: fd.id }));
    }

    setReady(true);
  }, [sps.data, sps.error, ready, qs]);

  const q = useGet<Data>('/reports/payments-shift', applied, ready);

  const d = q.data;

  const sp = sps.data?.find((s) => s.id === applied.salesPointId);

  const shiftName = SHIFTS.find(([v]) => v === applied.shift)?.[1];

  const jump = (n: number) => {
    const next = { ...draft, date: daysAgo(n) };
    setDraft(next);
    setApplied(next);
  };

  const reset = () => {
    const fd = sps.data?.find((s) => s.isFrontdesk)?.id ?? '';

    const next = {
      date: daysAgo(0),
      shift: '',
      salesPointId: fd,
    };

    setDraft(next);
    setApplied(next);
  };

  const chip =
    'rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800';

  return (
    <ReportPage wide>
      <PageTitle
        title="Payments Shift Report"
        sub="Room payments and refunds across all sales points"
      >
        <Link
          to="/reports"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </Link>

        <Btn
          variant="primary"
          className="h-9"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
          Print Report
        </Btn>
      </PageTitle>

      <Card className="p-5">
        <div className="grid items-end gap-3.5 md:grid-cols-4">
          <FieldBox
            label={
              <>
                Date <span className="text-red-500">*</span>
              </>
            }
          >
            <input
              type="date"
              className={inputCls}
              value={draft.date}
              onChange={(e) =>
                setDraft({ ...draft, date: e.target.value })
              }
            />
          </FieldBox>

          <FieldBox label="Shift (Optional)">
            <select
              className={inputCls}
              value={draft.shift}
              onChange={(e) =>
                setDraft({ ...draft, shift: e.target.value })
              }
            >
              {SHIFTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </FieldBox>

          <FieldBox label="Sales Point (Optional)">
            <select
              className={inputCls}
              value={draft.salesPointId}
              onChange={(e) =>
                setDraft({ ...draft, salesPointId: e.target.value })
              }
            >
              <option value="">All Sales Points</option>

              {(sps.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {spLabel(s)}
                </option>
              ))}
            </select>
          </FieldBox>

          <div className="no-print flex items-end gap-2">
            <Btn
              variant="primary"
              className="h-9 flex-1"
              disabled={!draft.date}
              onClick={() => setApplied(draft)}
            >
              <Filter className="h-4 w-4" />
              Apply Filters
            </Btn>

            <Btn
              variant="outline"
              className="h-9"
              onClick={reset}
            >
              Reset
            </Btn>
          </div>
        </div>

        <div className="no-print mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm">
          <span className="mr-1 text-slate-600">
            Quick Filters:
          </span>

          {QUICK.map(([l, n]) => (
            <button
              key={l}
              type="button"
              onClick={() => jump(n)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                applied.date === daysAgo(n)
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm">
          <span className="mr-1 text-slate-600">
            Active Filters:
          </span>

          <span className={cn(chip, 'inline-flex items-center gap-1')}>
            <CalendarDays className="h-3 w-3" />
            {dShort(applied.date)}
          </span>

          {applied.shift && (
            <span className={chip}>{shiftName}</span>
          )}

          {sp && (
            <span className={chip}>{spLabel(sp)}</span>
          )}

          <span className="text-slate-400">|</span>

          <span className="text-slate-600">
            {d?.totals.transactions ?? 0} transactions found
          </span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Payments"
          value={naira(d?.totals.payments.amount)}
          valueClass="text-green-600"
          sub={`${d?.totals.payments.count ?? 0} transactions`}
          circle="bg-green-100 text-green-600"
          icon={<DollarSign className="h-5 w-5" />}
        />

        <StatCard
          label="Total Refunds"
          value={naira(d?.totals.refunds.amount)}
          valueClass="text-red-600"
          sub={`${d?.totals.refunds.count ?? 0} refunds`}
          circle="bg-red-100 text-red-600"
          icon={<Minus className="h-5 w-5" />}
        />

        <StatCard
          label="Net Revenue"
          value={naira(d?.totals.net)}
          valueClass="text-blue-600"
          sub="After refunds"
          circle="bg-blue-100 text-blue-600"
          icon={<TrendingUp className="h-5 w-5" />}
        />

        <StatCard
          label="Total Transactions"
          value={d?.totals.transactions ?? 0}
          sub="Payments + Refunds"
          circle="bg-slate-100 text-slate-600"
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </div>

      <SectionCard title="Payment Method Breakdown">
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
          {METHODS.map((m) => (
            <div
              key={m.key}
              className={cn('rounded-lg border p-4', m.tile)}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">
                  {m.icon} {m.label}
                </span>

                <span className="text-xs text-slate-500">
                  {d?.methods[m.key].count ?? 0} payments
                </span>
              </div>

              <div className={cn('mt-2 text-lg font-bold', m.text)}>
                {naira(d?.methods[m.key].amount)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {!!d?.rows.length && (
        <SectionCard title="Transactions">
          <DataTable
            cols={[
              { label: 'Time' },
              { label: 'Guest / Room' },
              { label: 'Folio' },
              { label: 'Description' },
              { label: 'Method' },
              { label: 'Sales Point' },
              { label: 'Received By' },
              { label: 'Amount', right: true },
            ]}
          >
            {d.rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">
                  {tShort(r.time)}
                </Td>

                <Td>
                  <div className="font-medium">
                    {r.guestName}
                  </div>

                  {r.room && (
                    <div className="text-xs text-slate-500">
                      Room {r.room}
                    </div>
                  )}
                </Td>

                <Td className="text-slate-500">
                  {r.folioNo}
                </Td>

                <Td>{r.description}</Td>

                <Td>
                  {r.type === 'REFUND' ? (
                    <Pill tone="red">Refund</Pill>
                  ) : (
                    <Pill tone="blue">
                      {r.method ?? 'Uncategorized'}
                    </Pill>
                  )}
                </Td>

                <Td>{r.salesPoint}</Td>

                <Td className="text-slate-600">
                  {r.receivedBy ?? '—'}
                </Td>

                <Td
                  right
                  className={cn(
                    'whitespace-nowrap font-medium',
                    r.type === 'REFUND'
                      ? 'text-red-600'
                      : 'text-green-600'
                  )}
                >
                  {r.type === 'REFUND' ? '-' : ''}
                  {naira(r.amount)}
                </Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      )}
    </ReportPage>
  );
}
