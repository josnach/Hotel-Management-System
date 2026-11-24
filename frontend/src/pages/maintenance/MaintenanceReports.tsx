import { useState } from 'react';
import { Check, Clock, Coins, Wrench } from 'lucide-react';

import { useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { BackToDashboard, inputCls, labelCls, pageTitleCls, th, ymd } from './shared';

type Report = {
  range: { start: string; end: string };
  totalRequests: number;
  completedRequests: number;
  avgCompletionHours: number;
  avgCost: number;
  completionRate: number;
  totalCost: number;
  avgResponseHours: number;
  byCategory: { category: string; label: string; count: number; cost: number }[];
};

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #maintenance-print, #maintenance-print * { visibility: visible !important; }
  #maintenance-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
}`;

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function BarList({ rows, format }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return null;
  return (
    <div className="space-y-3 px-5 pb-5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>{r.label}</span>
            <span className="font-medium text-slate-900">{format ? format(r.value) : r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${max ? Math.max((r.value / max) * 100, 2) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MaintenanceReports() {
  const [range, setRange] = useState({ start: ymd(firstOfMonth()), end: ymd(new Date()) });
  const [applied, setApplied] = useState(range);

  const { data } = useGet<Report>('/maintenance/reports', applied);

  const total = data?.totalRequests ?? 0;
  const completed = data?.completedRequests ?? 0;
  const avgHours = data?.avgCompletionHours ?? 0;
  const avgCost = data?.avgCost ?? 0;
  const cats = data?.byCategory ?? [];

  const kpis = [
    { label: 'Total Requests', value: String(total), Icon: Wrench, border: 'border-l-blue-500', tint: 'bg-blue-100 text-blue-600' },
    { label: 'Completed Requests', value: String(completed), Icon: Check, border: 'border-l-green-500', tint: 'bg-green-100 text-green-600' },
    { label: 'Avg Completion Time', value: `${avgHours}h`, Icon: Clock, border: 'border-l-purple-500', tint: 'bg-purple-100 text-purple-600' },
    { label: 'Avg Cost', value: money(avgCost), Icon: Coins, border: 'border-l-orange-500', tint: 'bg-orange-100 text-orange-600' },
  ];

  const stats = [
    { metric: 'Completion Rate', value: `${data?.completionRate ?? 0}%` },
    { metric: 'Total Maintenance Cost', value: money(data?.totalCost ?? 0) },
    { metric: 'Average Response Time', value: `${data?.avgResponseHours ?? 0} hours` },
  ];

  return (
    <div className="w-full">
      <style>{PRINT_CSS}</style>

      <div className="mb-4 flex items-center justify-between">
        <h1 className={pageTitleCls}>Maintenance Reports</h1>
        <BackToDashboard />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Filter Reports</h2>
        <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_1.2fr_1.2fr]">
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              className={inputCls}
              value={range.start}
              max={range.end}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              className={inputCls}
              value={range.end}
              min={range.start}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!range.start || !range.end || range.start > range.end}
            onClick={() => setApplied(range)}
          >
            Generate Report
          </button>
          <button
            type="button"
            className="rounded-md bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
            onClick={() => window.print()}
          >
            Export PDF
          </button>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, Icon, border, tint }) => (
          <div key={label} className={`flex items-center justify-between rounded-lg border border-l-4 bg-white px-5 py-4 shadow-sm ${border}`}>
            <div>
              <div className="text-xs text-slate-600">{label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
            </div>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tint}`}>
              <Icon className="h-4 w-4" />
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 py-4 text-base font-semibold text-slate-900">Requests by Category</h2>
          <BarList rows={cats.map((c) => ({ label: c.label, value: c.count }))} />
        </Card>
        <Card className="p-0">
          <h2 className="px-5 py-4 text-base font-semibold text-slate-900">Cost by Category</h2>
          <BarList rows={cats.map((c) => ({ label: c.label, value: c.cost }))} format={money} />
        </Card>
      </div>

      <Card className="mt-5 p-0">
        <h2 className="px-5 py-4 text-base font-semibold text-slate-900">Detailed Statistics</h2>
        <div className="px-5 pb-5">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Metric</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={`${th} text-right`}>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.metric} className="border-t">
                  <td className="px-4 py-3">{s.metric}</td>
                  <td className="px-4 py-3 text-right">{s.value}</td>
                  <td className="px-4 py-3 text-right text-slate-400">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Print-only copy used by "Export PDF" (choose "Save as PDF" in the print dialog) */}
      <div id="maintenance-print" className="hidden p-6 text-[12px] text-black">
        <h1 className="text-lg font-bold">Maintenance Report</h1>
        <p className="mb-3">{applied.start} to {applied.end}</p>

        <table className="mb-4 w-full border-collapse border text-left">
          <tbody>
            {[
              ['Total Requests', String(total)],
              ['Completed Requests', String(completed)],
              ['Avg Completion Time', `${avgHours}h`],
              ['Avg Cost', money(avgCost)],
              ...stats.map((s) => [s.metric, s.value]),
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="border px-2 py-1 font-semibold">{k}</td>
                <td className="border px-2 py-1 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mb-1 font-bold">By Category</h2>
        <table className="w-full border-collapse border text-left">
          <thead>
            <tr>
              {['Category', 'Requests', 'Cost'].map((h) => (
                <th key={h} className="border px-2 py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.category}>
                <td className="border px-2 py-1">{c.label}</td>
                <td className="border px-2 py-1 text-right">{c.count}</td>
                <td className="border px-2 py-1 text-right">{money(c.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}