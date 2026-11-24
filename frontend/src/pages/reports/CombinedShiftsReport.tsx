import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorBox, Loading } from '@/components/common';
import { Btn, Card, PageTitle, ReportPage, daysAgo, dShort, inputCls, tShort } from '@/components/reports/ui';

interface Row { id: string; time: string; guestName: string; room: string | null; description: string; method: string | null; bill: number; payment: number; staff: string | null }
interface Shift {
  key: string; name: string; label: string; color: 'blue' | 'purple' | 'green'; date: string;
  billings: number; billingCount: number; payments: number; paymentCount: number; collectionRate: number;
  avgTransaction: number; transactions: number; balance: number; rows: Row[];
}
interface Data {
  date: string; recentDates: string[];
  summary: { transactions: number; billings: number; payments: number; netBalance: number; shifts: number };
  shifts: Shift[];
  comparison: { revenue: { name: string; value: number }[]; collection: { name: string; value: number }[] };
}

const DOT = { blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500' } as const;
const num = (v: unknown) => Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chip = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
const SHIFT_OPTIONS: [string, string][] = [['', 'All Shifts'], ['MORNING', 'Morning Shift (7:00 - 14:00)'], ['AFTERNOON', 'Afternoon Shift (14:00 - 22:00)'], ['NIGHT', 'Night Shift (22:00 - 7:00)']];

function Bars({ title, items }: { title: string; items: { name: string; value: number }[] }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-800">{title}</div>
      {items.map((i) => (
        <div key={i.name} className="mb-2">
          <div className="flex justify-between text-xs text-slate-700"><span>{i.name}</span><b>{num(i.value)}</b></div>
          <div className="mt-1 h-1 rounded bg-slate-200"><div className="h-1 rounded bg-blue-500" style={{ width: `${max ? (i.value / max) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function CombinedShiftsReport() {
  const nav = useNavigate();
  const [draft, setDraft] = useState({ date: daysAgo(0), shift: '' });
  const [applied, setApplied] = useState(draft);
  const q = useGet<Data>('/reports/shifts/combined', applied);
  const d = q.data;
  const jump = (date: string) => { const next = { ...draft, date }; setDraft(next); setApplied(next); };

  return (
    <ReportPage wide>
      <PageTitle title="All Shifts Combined Report" sub="View transactions across all active shifts">
        <Btn variant="outline" className="h-9" onClick={() => nav(-1)}>Back</Btn>
        <Btn className="h-9 bg-slate-700 hover:bg-slate-800" onClick={() => window.print()}>Print</Btn>
      </PageTitle>

      <Card className="p-4">
        <div className="grid items-end gap-3.5 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Shift</label>
            <select className={inputCls} value={draft.shift} onChange={(e) => setDraft({ ...draft, shift: e.target.value })}>
              {SHIFT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date</label>
            <input type="date" className={inputCls} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Quick</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => jump(daysAgo(0))} className="h-9 rounded-md border border-blue-100 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100">Today</button>
              <button type="button" onClick={() => jump(daysAgo(1))} className="h-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200">Yest</button>
            </div>
          </div>
          <Btn variant="primary" className="h-9" onClick={() => setApplied(draft)}>Filter</Btn>
        </div>
        {!!d?.recentDates.length && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="mr-1 text-slate-500">Recent:</span>
            {d.recentDates.map((r) => (
              <button key={r} type="button" onClick={() => jump(r)}
                className={cn('rounded border px-2 py-0.5', r === applied.date ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                {chip(r)}
              </button>
            ))}
          </div>
        )}
      </Card>

      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-blue-900">Overall Summary</div>
                <div className="text-xs text-slate-500">{dShort(d.date)}</div>
              </div>
              <span className="text-xs text-blue-600">{d.summary.shifts} shifts</span>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {([
                ['Transactions', d.summary.transactions, 'text-slate-900'],
                ['Billings', num(d.summary.billings), 'text-red-600'],
                ['Payments', num(d.summary.payments), 'text-green-600'],
                ['Net Balance', num(d.summary.netBalance), d.summary.netBalance < 0 ? 'text-red-600' : 'text-green-600'],
              ] as const).map(([label, value, c]) => (
                <div key={label} className="rounded border border-slate-200 bg-white p-3">
                  <div className="text-xs text-slate-600">{label}</div>
                  <div className={cn('text-xl font-bold', c)}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {d.shifts.map((s) => (
            <Card key={s.key} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('h-2.5 w-2.5 rounded-full', DOT[s.color])} />
                  <b className="text-slate-900">{s.name}</b>
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className="text-xs text-slate-400">{s.date}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-600">{s.transactions} transactions</span>
                  <b className={s.balance < 0 ? 'text-red-600' : 'text-green-600'}>Bal: {num(s.balance)}</b>
                  <Link to={`/reports/payments-shift?date=${s.date}&shift=${s.key}`} className="text-blue-600 hover:underline">Details →</Link>
                </div>
              </div>
              <div className="grid gap-3 px-4 py-3 md:grid-cols-4">
                <div><div className="text-xs text-slate-600">Billings</div><div className="text-lg font-bold text-red-600">{num(s.billings)}</div><div className="text-xs text-slate-500">{s.billingCount} items</div></div>
                <div><div className="text-xs text-slate-600">Payments</div><div className="text-lg font-bold text-green-600">{num(s.payments)}</div><div className="text-xs text-slate-500">{s.paymentCount} payments</div></div>
                <div><div className="text-xs text-slate-600">Collection</div><div className="text-lg font-bold text-amber-600">{s.collectionRate}%</div><div className="text-xs text-slate-500">of billings</div></div>
                <div><div className="text-xs text-slate-600">Avg. Transaction</div><div className="text-lg font-bold text-blue-600">{num(s.avgTransaction)}</div><div className="text-xs text-slate-500">Per transaction</div></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-t border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                      {['Time', 'Guest / Room', 'Description', 'Method'].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}
                      {['Billing', 'Payment'].map((h) => <th key={h} className="px-4 py-2 text-right font-medium">{h}</th>)}
                      <th className="px-4 py-2 text-left font-medium">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {s.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No transactions for this shift</td></tr>}
                    {s.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-4 py-2">{tShort(r.time)}</td>
                        <td className="px-4 py-2">{r.guestName}{r.room ? ` (${r.room})` : ''}</td>
                        <td className="px-4 py-2">{r.description}</td>
                        <td className="px-4 py-2">{r.method ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-red-600">{r.bill ? num(r.bill) : ''}</td>
                        <td className="px-4 py-2 text-right text-green-600">{r.payment ? num(r.payment) : ''}</td>
                        <td className="px-4 py-2 text-slate-600">{r.staff ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">Shift Comparison</div>
            <div className="grid gap-8 md:grid-cols-2">
              <Bars title="Revenue by Shift" items={d.comparison.revenue} />
              <Bars title="Collection by Shift" items={d.comparison.collection} />
            </div>
          </Card>
        </>
      )}
    </ReportPage>
  );
}