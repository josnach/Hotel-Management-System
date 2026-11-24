import { Prisma } from '@prisma/client';

type Money = Prisma.Decimal.Value | null | undefined;

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash' };

export interface SlipEmployee {
  fullName: string;
  staffId: string | null;
  department: string | null;
  position: string | null;
  bankName: string | null;
  accountNumber: string | null;
  email: string | null;
}

/** Anything shaped like a stored payslip, or like one that has been worked out but not saved yet (preview). */
export interface SlipLike {
  id?: string;
  employeeId: string;
  basic: Money; housing: Money; transport: Money; meal: Money; otherAllow: Money; overtime: Money; bonus: Money;
  gross: Money; paye: Money; pensionEmployee: Money; pensionEmployer: Money; nhf: Money;
  otherDeductions: Money; deductionNote?: string | null; nsitf: Money; itf: Money; compExcess: Money;
  deductions: Money; net: Money; rentRelief: Money; taxableAnnual: Money;
  paymentMethod?: string | null; paymentStatus?: string | null; paidAt?: Date | null;
  employee: SlipEmployee;
}

/** Staff with bank details are paid by transfer, everyone else in cash. */
export const methodFor = (e: { bankName: string | null; accountNumber: string | null }) =>
  e.bankName && e.accountNumber ? 'BANK_TRANSFER' : 'CASH';

/** One row as the screens show it. Keeps every key the older Payroll page already reads. */
export function slipView(s: SlipLike, periodStatus: string) {
  const housing = num(s.housing), transport = num(s.transport), meal = num(s.meal), otherAllow = num(s.otherAllow);
  const nhf = num(s.nhf), oneTime = num(s.otherDeductions);
  return {
    id: s.id,
    employeeId: s.employeeId,
    name: s.employee.fullName,
    staffId: s.employee.staffId ?? '',
    department: s.employee.department ?? '',
    position: s.employee.position ?? '',
    basic: num(s.basic), housing, transport, meal, otherAllow,
    allowances: r2(housing + transport + meal + otherAllow),
    overtime: num(s.overtime),
    bonus: num(s.bonus),
    gross: num(s.gross),
    paye: num(s.paye),
    pensionEmployee: num(s.pensionEmployee),
    pensionEmployer: num(s.pensionEmployer),
    nhf,
    otherDeductions: oneTime,
    deductionNote: s.deductionNote ?? null,
    nsitf: num(s.nsitf),
    itf: num(s.itf),
    compExcess: num(s.compExcess),
    deductions: num(s.deductions),
    net: num(s.net),
    /** What the "Other Deductions" column shows: NHF plus any one-time deduction. */
    otherTotal: r2(nhf + oneTime),
    rentRelief: num(s.rentRelief),
    taxableAnnual: num(s.taxableAnnual),
    paymentMethod: s.paymentMethod ?? methodFor(s.employee),
    paid: s.paymentStatus === 'PAID' || periodStatus === 'PAID',
    paidAt: s.paidAt ?? null,
    bankName: s.employee.bankName ?? '',
    accountNumber: s.employee.accountNumber ?? '',
  };
}
export type SlipView = ReturnType<typeof slipView>;

export function summarize(rows: SlipView[]) {
  const sum = (f: (r: SlipView) => number) => r2(rows.reduce((t, r) => t + f(r), 0));
  return {
    employees: rows.length,
    gross: sum((r) => r.gross),
    deductions: sum((r) => r.deductions),
    net: sum((r) => r.net),
    paye: sum((r) => r.paye),
    pension: sum((r) => r.pensionEmployee),
    compExcess: sum((r) => r.compExcess),
    bankTransfers: rows.filter((r) => r.paymentMethod === 'BANK_TRANSFER').length,
    cashPayments: rows.filter((r) => r.paymentMethod === 'CASH').length,
    paid: rows.filter((r) => r.paid).length,
    pending: rows.filter((r) => !r.paid).length,
  };
}