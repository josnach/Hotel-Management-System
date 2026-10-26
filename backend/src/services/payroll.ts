import { D, Prisma, prisma } from '../lib/prisma';

type Dec = Prisma.Decimal;

export interface Band { upTo: number | null; rate: number }
export interface PayrollConfig {
  employeePensionPct: number;
  employerPensionPct: number;
  /** BHT = basic + housing + transport (the usual pension base); GROSS = all regular pay. */
  pensionBase: 'BHT' | 'GROSS';
  nhfPct: number;
  nsitfEnabled: boolean; nsitfPct: number;
  itfEnabled: boolean; itfPct: number;
  rentReliefPct: number; rentReliefCap: number; requireRentProof: boolean;
  /** Annual income bands. `upTo` is the top of the band (cumulative); the last band has no upper limit. */
  bands: Band[];
}

/** Nigeria Tax Act 2025, in force from 1 January 2026. Everything here can be changed by the accountant in Payroll settings. */
export const DEFAULT_CONFIG: PayrollConfig = {
  employeePensionPct: 8, employerPensionPct: 10, pensionBase: 'BHT', nhfPct: 2.5,
  nsitfEnabled: false, nsitfPct: 1, itfEnabled: false, itfPct: 1,
  rentReliefPct: 20, rentReliefCap: 500_000, requireRentProof: true,
  bands: [{ upTo: 800_000, rate: 0 }, { upTo: 3_000_000, rate: 15 }, { upTo: 12_000_000, rate: 18 }, { upTo: 25_000_000, rate: 21 }, { upTo: 50_000_000, rate: 23 }, { upTo: null, rate: 25 }],
};

const KEY = 'payroll.config';
export async function getPayrollConfig(): Promise<PayrollConfig> {
  const r = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!r) return DEFAULT_CONFIG;
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(r.value) }; } catch { return DEFAULT_CONFIG; }
}
export async function savePayrollConfig(c: PayrollConfig) {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(c) }, create: { key: KEY, value: JSON.stringify(c) } });
}

/** Tax on a yearly amount, band by band. */
export function annualTax(taxable: Prisma.Decimal.Value | number, bands: Band[]): Dec {
  const income = D(taxable);
  let tax = D(0), prev = D(0);
  for (const b of bands) {
    const top = b.upTo === null ? null : D(b.upTo);
    const slice = (top && income.gt(top) ? top : income).minus(prev);
    if (slice.gt(0)) tax = tax.plus(slice.times(b.rate).div(100));
    if (!top || income.lte(top)) break;
    prev = top;
  }
  return tax;
}

export interface PayInputs {
  basic: Prisma.Decimal.Value; housing: Prisma.Decimal.Value; transport: Prisma.Decimal.Value; otherAllow: Prisma.Decimal.Value;
  annualRent: Prisma.Decimal.Value; rentProofOnFile: boolean; otherAnnualReliefs: Prisma.Decimal.Value;
  pensionEnrolled: boolean; nhfEnrolled: boolean;
  bonus?: Prisma.Decimal.Value; otherDeductions?: Prisma.Decimal.Value;
}

const r2 = (x: Dec) => x.toDecimalPlaces(2);

/** One employee's pay for one month. A bonus is taxed once, on top of the year's regular pay. */
export function computePay(e: PayInputs, cfg: PayrollConfig) {
  const basic = D(e.basic), housing = D(e.housing), transport = D(e.transport), otherAllow = D(e.otherAllow);
  const bonus = D(e.bonus ?? 0), otherDeductions = D(e.otherDeductions ?? 0);
  const regular = basic.plus(housing).plus(transport).plus(otherAllow);
  const gross = regular.plus(bonus);

  const pensionable = cfg.pensionBase === 'GROSS' ? regular : basic.plus(housing).plus(transport);
  const pensionEmployee = e.pensionEnrolled ? r2(pensionable.times(cfg.employeePensionPct).div(100)) : D(0);
  const pensionEmployer = e.pensionEnrolled ? r2(pensionable.times(cfg.employerPensionPct).div(100)) : D(0);
  const nhf = e.nhfEnrolled ? r2(basic.times(cfg.nhfPct).div(100)) : D(0);

  const rent = D(e.annualRent);
  const rentRelief = rent.gt(0) && (!cfg.requireRentProof || e.rentProofOnFile) ? r2(Dec_min(rent.times(cfg.rentReliefPct).div(100), D(cfg.rentReliefCap))) : D(0);

  const regularTaxable = Dec_max0(regular.minus(pensionEmployee).minus(nhf).times(12).minus(rentRelief).minus(D(e.otherAnnualReliefs)));
  const baseTax = annualTax(regularTaxable, cfg.bands);
  const bonusTax = bonus.gt(0) ? annualTax(regularTaxable.plus(bonus), cfg.bands).minus(baseTax) : D(0);
  const paye = r2(baseTax.div(12).plus(bonusTax));

  const nsitf = cfg.nsitfEnabled ? r2(gross.times(cfg.nsitfPct).div(100)) : D(0);
  const itf = cfg.itfEnabled ? r2(gross.times(cfg.itfPct).div(100)) : D(0);
  const deductions = pensionEmployee.plus(nhf).plus(paye).plus(otherDeductions);
  return {
    basic, housing, transport, otherAllow, bonus, gross: r2(gross), pensionEmployee, pensionEmployer, nhf, rentRelief,
    taxableAnnual: r2(regularTaxable.plus(bonus)), paye, otherDeductions, nsitf, itf, deductions: r2(deductions), net: r2(gross.minus(deductions)),
  };
}
function Dec_min(a: Dec, b: Dec) { return a.lt(b) ? a : b; }
function Dec_max0(a: Dec) { return a.lt(0) ? D(0) : a; }

export type RemitKind = 'PAYE' | 'PENSION' | 'NHF' | 'LEVIES';
/** What is owed to each authority for a set of payslips. */
export function amountsDue(slips: { paye: unknown; pensionEmployee: unknown; pensionEmployer: unknown; nhf: unknown; nsitf: unknown; itf: unknown }[]): Record<RemitKind, Dec> {
  const sum = (f: (s: (typeof slips)[number]) => unknown) => r2(slips.reduce((t, s) => t.plus(D(f(s) as Prisma.Decimal.Value)), D(0)));
  return { PAYE: sum((s) => s.paye), PENSION: sum((s) => D(s.pensionEmployee as Prisma.Decimal.Value).plus(D(s.pensionEmployer as Prisma.Decimal.Value))), NHF: sum((s) => s.nhf), LEVIES: sum((s) => D(s.nsitf as Prisma.Decimal.Value).plus(D(s.itf as Prisma.Decimal.Value))) };
}
