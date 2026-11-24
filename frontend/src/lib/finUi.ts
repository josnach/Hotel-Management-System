export const naira = (n: string | number | null | undefined) =>
  `₦${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';

/** Today as YYYY-MM-DD in the browser's own time zone (what a date input expects). */
export const today = () => new Date().toLocaleDateString('en-CA');

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Saves rows as a CSV file. Cells that start with = + - @ are neutralised so Excel cannot run them. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const ui = {
  input:
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
  readonly:
    'w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700',
  label: 'mb-1 block text-sm font-medium text-gray-700',
  card: 'rounded-lg bg-white shadow-sm',
  h1: 'text-2xl font-bold text-gray-900',
  sub: 'text-sm text-gray-600',
  section: 'text-base font-semibold text-gray-900',
  btnBlue:
    'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60',
  btnGreen:
    'inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60',
  btnDark:
    'inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60',
  btnWhite:
    'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50',
  btnGrey:
    'inline-flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300',
  th: 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500',
};

export const PAYEE_TYPES = [
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'OTHER', label: 'Other' },
];

export const PAY_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
];

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];