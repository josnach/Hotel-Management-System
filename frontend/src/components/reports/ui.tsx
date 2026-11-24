import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ───────── formatting ───────── */
export const naira = (n: unknown) =>
  `₦${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const parse = (v: string | Date) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v));
export const dShort = (v?: string | Date | null) =>
  v ? parse(v).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
export const tShort = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
export const dtShort = (v?: string | Date | null) => (v ? `${dShort(v)} ${tShort(v)}` : '—');
export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/* ───────── palette sampled from the video ───────── */
export const SOLID = {
  blue: 'bg-[#4282f0]', green: 'bg-[#30dc62]', cyan: 'bg-[#15c7d1]', amber: 'bg-[#eb9e12]', purple: 'bg-[#a241f2]',
  red: 'bg-[#e03347]', grey: 'bg-[#6a727f]', dark: 'bg-[#202a36]', yellow: 'bg-[#e3b90f]',
} as const;
export type Tone = keyof typeof SOLID;

const PILL = {
  red: 'bg-red-100 text-red-800', green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800', amber: 'bg-amber-100 text-amber-800', gray: 'bg-slate-100 text-slate-700',
  cyan: 'bg-cyan-100 text-cyan-800', orange: 'bg-orange-100 text-orange-800',
} as const;
export const Pill = ({ tone = 'gray', children }: { tone?: keyof typeof PILL; children: ReactNode }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', PILL[tone])}>{children}</span>
);

/* ───────── layout ───────── */
export const ReportPage = ({ wide, children }: { wide?: boolean; children: ReactNode }) => (
  <div className={cn('space-y-5', !wide && 'mx-auto max-w-5xl')}>{children}</div>
);

export const PageTitle = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
    </div>
    {children && <div className="no-print flex items-center gap-2">{children}</div>}
  </div>
);

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-lg border border-[#ededef] bg-white shadow-sm', className)}>{children}</div>
);

export const SectionCard = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <Card className={cn('overflow-hidden', className)}>
    <h2 className="px-5 pb-4 pt-5 text-base font-semibold text-slate-900">{title}</h2>
    {children}
  </Card>
);

/* ───────── buttons / inputs ───────── */
const BTN = {
  blue: 'bg-[#4282f0] text-white hover:brightness-95',
  green: 'bg-[#30dc62] text-white hover:brightness-95',
  cyan: 'bg-[#15c7d1] text-white hover:brightness-95',
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
} as const;
export function Btn({ variant = 'blue', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      type="button"
      {...p}
      className={cn('inline-flex h-8 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-60', BTN[variant], className)}
    />
  );
}
export const inputCls =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
export const FieldBox = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
    {children}
  </div>
);

/** Draft values are edited freely; "Generate Report" / "Apply Filters" copies them into `applied`. */
export function useFilters<T>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const [applied, setApplied] = useState<T>(initial);
  return { draft, setDraft, applied, setApplied, apply: () => setApplied(draft) };
}

/* ───────── tiles & stat cards ───────── */
export function Tile({ tone, value, label, icon: Icon, className }: { tone: Tone; value: ReactNode; label: string; icon: LucideIcon; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg px-5 py-4 text-white shadow-sm', SOLID[tone], className)}>
      <div>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        <div className="text-sm">{label}</div>
      </div>
      <Icon className="h-6 w-6 opacity-90" />
    </div>
  );
}

export function StatCard({ label, value, sub, icon, circle, valueClass }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; circle?: string; valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-[#ededef] bg-white p-4 shadow-sm">
      <div>
        <div className="text-sm text-slate-700">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold text-slate-900', valueClass)}>{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </div>
      <div className={cn('flex shrink-0 items-center justify-center', circle && `h-10 w-10 rounded-full ${circle}`)}>{icon}</div>
    </div>
  );
}

/* ───────── tables ───────── */
export interface Col { label: string; right?: boolean }
export function DataTable({ cols, children, minWidth }: { cols: Col[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', minWidth)}>
        <thead>
          <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {cols.map((c) => (
              <th key={c.label} className={cn('whitespace-nowrap px-5 py-3 font-medium', c.right ? 'text-right' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cn('px-5 py-3', right && 'text-right', className)}>{children}</td>
);
export const TotalRow = ({ children }: { children: ReactNode }) => <tr className="bg-slate-50 font-semibold text-slate-900">{children}</tr>;
export const EmptyRow = ({ span, children }: { span: number; children: ReactNode }) => (
  <tr><td colSpan={span} className="px-5 py-5 text-center text-slate-500">{children}</td></tr>
);