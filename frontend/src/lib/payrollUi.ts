export const naira = (n: string | number | null | undefined) =>
  `₦${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Period and pay dates are date-only values, so they are shown in UTC to avoid slipping a day. */
export const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—';

/** A Date as YYYY-MM-DD in the browser's own time zone (what a date input expects). */
export const isoDay = (d: Date) => d.toLocaleDateString('en-CA');

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export const methodLabel = (m: string) => (m === 'BANK_TRANSFER' ? 'Bank Transfer' : m === 'CASH' ? 'Cash' : m);

/** Saves rows as a CSV file. Cells that start with = + - @ are neutralised so Excel cannot run them. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One employee's pay as the API sends it. */
export interface SlipView {
  id?: string;
  employeeId: string;
  name: string;
  staffId: string;
  department: string;
  position: string;
  basic: number;
  housing: number;
  transport: number;
  meal: number;
  otherAllow: number;
  allowances: number;
  overtime: number;
  bonus: number;
  gross: number;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  otherDeductions: number;
  deductionNote: string | null;
  compExcess: number;
  deductions: number;
  net: number;
  otherTotal: number;
  paymentMethod: string;
  paid: boolean;
  bankName: string;
  accountNumber: string;
}

export interface Summary {
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  paye: number;
  pension: number;
  compExcess: number;
  bankTransfers: number;
  cashPayments: number;
  paid: number;
  pending: number;
}

/** The few settings the breakdown screens quote. */
export interface RateInfo {
  nhfPct?: number;
  employeePensionPct?: number;
}

export type RunStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export const STATUS_BADGE: Record<RunStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};
export const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export const ui = {
  input:
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500',
  readonly: 'w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700',
  label: 'mb-1 block text-sm font-medium text-gray-700',
  card: 'rounded-lg bg-white shadow-sm',
  h1: 'text-3xl font-bold text-gray-900',
  sub: 'text-sm text-gray-600',
  th: 'px-3 py-3 text-xs font-medium text-gray-500',
  btnPurple:
    'inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60',
  btnBlue:
    'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60',
  btnGreen:
    'inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60',
  btnDark:
    'inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60',
  btnGrey:
    'inline-flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300',
  btnWhite:
    'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50',
};