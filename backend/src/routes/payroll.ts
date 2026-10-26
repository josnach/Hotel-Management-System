import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC, postJournal } from '../services/accounting';
import { amountsDue, computePay, getPayrollConfig, PayrollConfig, RemitKind, savePayrollConfig } from '../services/payroll';

/** Payroll under Nigerian rules. Only accountants (and managers and admins) can see or change any of it. */
export const payrollRouter = Router();
payrollRouter.use(requireRole('ACCOUNTANT'));

const money = z.coerce.number().min(0).max(1_000_000_000);
const employeeBody = z.object({
  fullName: z.string().trim().min(1), position: z.string().trim().optional(), department: z.string().trim().optional(), phone: z.string().trim().optional(),
  baseSalary: money, housingAllowance: money.default(0), transportAllowance: money.default(0), otherAllowances: money.default(0),
  annualRent: money.default(0), rentProofOnFile: z.boolean().default(false), otherAnnualReliefs: money.default(0),
  pensionEnrolled: z.boolean().default(true), nhfEnrolled: z.boolean().default(false),
  pfaName: z.string().trim().optional(), rsaPin: z.string().trim().optional(), tin: z.string().trim().optional(), stateOfResidence: z.string().trim().optional(),
  bankName: z.string().trim().optional(), accountNumber: z.string().trim().optional(), isActive: z.boolean().default(true),
});
const num = (v: unknown) => Number(v ?? 0);
const empRow = (e: any) => ({ ...e, baseSalary: num(e.baseSalary), housingAllowance: num(e.housingAllowance), transportAllowance: num(e.transportAllowance), otherAllowances: num(e.otherAllowances), annualRent: num(e.annualRent), otherAnnualReliefs: num(e.otherAnnualReliefs) });

payrollRouter.get('/employees', asyncHandler(async (_q, res) => res.json((await prisma.employee.findMany({ orderBy: { fullName: 'asc' } })).map(empRow))));
payrollRouter.post('/employees', asyncHandler(async (req, res) => {
  const e = await prisma.employee.create({ data: parse(employeeBody, req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'EMPLOYEE_ADD', entity: 'Employee', entityId: e.id, meta: { name: e.fullName } });
  res.status(201).json(empRow(e));
}));
payrollRouter.put('/employees/:id', asyncHandler(async (req, res) => {
  const b = parse(employeeBody.partial(), req.body);
  const before = await prisma.employee.findUniqueOrThrow({ where: { id: req.params.id } });
  const e = await prisma.employee.update({ where: { id: req.params.id }, data: b });
  // Pay changes affect tax and take-home pay, so they leave a trail.
  await audit(prisma, { userId: req.user!.id, action: 'EMPLOYEE_PAY_EDIT', entity: 'Employee', entityId: e.id, meta: { name: e.fullName, basicFrom: num(before.baseSalary), basicTo: num(e.baseSalary), fields: Object.keys(b) } });
  res.json(empRow(e));
}));

// ───────────── Settings: rates, reliefs and tax bands ─────────────
const configBody = z.object({
  employeePensionPct: z.coerce.number().min(0).max(100), employerPensionPct: z.coerce.number().min(0).max(100), pensionBase: z.enum(['BHT', 'GROSS']),
  nhfPct: z.coerce.number().min(0).max(100), nsitfEnabled: z.boolean(), nsitfPct: z.coerce.number().min(0).max(100), itfEnabled: z.boolean(), itfPct: z.coerce.number().min(0).max(100),
  rentReliefPct: z.coerce.number().min(0).max(100), rentReliefCap: z.coerce.number().min(0), requireRentProof: z.boolean(),
  bands: z.array(z.object({ upTo: z.coerce.number().positive().nullable(), rate: z.coerce.number().min(0).max(100) })).min(1).max(12),
});
payrollRouter.get('/payroll/config', asyncHandler(async (_q, res) => res.json(await getPayrollConfig())));
payrollRouter.put('/payroll/config', asyncHandler(async (req, res) => {
  const c = parse(configBody, req.body) as PayrollConfig;
  const last = c.bands.length - 1;
  c.bands.forEach((b, i) => {
    if ((i === last) !== (b.upTo === null)) throw new HttpError(400, 'Only the last tax band has no upper limit');
    if (i > 0 && b.upTo !== null && b.upTo <= (c.bands[i - 1].upTo ?? 0)) throw new HttpError(400, 'Each tax band must end higher than the one before');
  });
  const before = await getPayrollConfig();
  await savePayrollConfig(c);
  await audit(prisma, { userId: req.user!.id, action: 'PAYROLL_CONFIG_CHANGE', entity: 'Setting', entityId: 'payroll.config', meta: { before, after: c } as any });
  res.json(c);
}));

// ───────────── Payroll runs ─────────────
const slipRow = (s: any) => ({ id: s.id, employeeId: s.employeeId, name: s.employee?.fullName, position: s.employee?.position, gross: num(s.gross), deductions: num(s.deductions), net: num(s.net), basic: num(s.basic), housing: num(s.housing), transport: num(s.transport), otherAllow: num(s.otherAllow), bonus: num(s.bonus), pensionEmployee: num(s.pensionEmployee), pensionEmployer: num(s.pensionEmployer), nhf: num(s.nhf), rentRelief: num(s.rentRelief), taxableAnnual: num(s.taxableAnnual), paye: num(s.paye), otherDeductions: num(s.otherDeductions), deductionNote: s.deductionNote, nsitf: num(s.nsitf), itf: num(s.itf) });
const slipData = (c: ReturnType<typeof computePay>) => ({ gross: c.gross, deductions: c.deductions, net: c.net, basic: c.basic, housing: c.housing, transport: c.transport, otherAllow: c.otherAllow, bonus: c.bonus, pensionEmployee: c.pensionEmployee, pensionEmployer: c.pensionEmployer, nhf: c.nhf, rentRelief: c.rentRelief, taxableAnnual: c.taxableAnnual, paye: c.paye, otherDeductions: c.otherDeductions, nsitf: c.nsitf, itf: c.itf });
const payIn = (e: any, extra: { bonus?: unknown; otherDeductions?: unknown } = {}) => ({ basic: e.baseSalary, housing: e.housingAllowance, transport: e.transportAllowance, otherAllow: e.otherAllowances, annualRent: e.annualRent, rentProofOnFile: e.rentProofOnFile, otherAnnualReliefs: e.otherAnnualReliefs, pensionEnrolled: e.pensionEnrolled, nhfEnrolled: e.nhfEnrolled, bonus: extra.bonus as any, otherDeductions: extra.otherDeductions as any });

payrollRouter.get('/payroll', asyncHandler(async (_q, res) => {
  const ps = await prisma.payrollPeriod.findMany({ orderBy: { startDate: 'desc' }, include: { payslips: true } });
  res.json(ps.map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, status: p.status, employees: p.payslips.length, totalGross: p.payslips.reduce((s, x) => s + num(x.gross), 0), totalNet: p.payslips.reduce((s, x) => s + num(x.net), 0), totalPaye: p.payslips.reduce((s, x) => s + num(x.paye), 0) })));
}));

payrollRouter.post('/payroll', asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1), startDate: z.coerce.date(), endDate: z.coerce.date() }), req.body);
  if (b.endDate < b.startDate) throw new HttpError(400, 'The end date must be after the start date');
  const emps = await prisma.employee.findMany({ where: { isActive: true } });
  if (!emps.length) throw new HttpError(400, 'Add at least one employee first');
  const cfg = await getPayrollConfig();
  const p = await prisma.payrollPeriod.create({
    data: { name: b.name, startDate: b.startDate, endDate: b.endDate, configSnapshot: cfg as any, payslips: { create: emps.map((e) => ({ employeeId: e.id, ...slipData(computePay(payIn(e), cfg)) })) } },
  });
  res.status(201).json({ id: p.id });
}));

async function loadRun(id: string) {
  const p = await prisma.payrollPeriod.findUnique({ where: { id }, include: { payslips: { include: { employee: true }, orderBy: { employee: { fullName: 'asc' } } }, remittances: true } });
  if (!p) throw new HttpError(404, 'Payroll period not found');
  return p;
}

payrollRouter.get('/payroll/:id', asyncHandler(async (req, res) => {
  const p = await loadRun(req.params.id);
  const due = amountsDue(p.payslips);
  const paid = (k: string) => p.remittances.filter((r) => r.kind === k).reduce((s, r) => s + num(r.amount), 0);
  res.json({
    id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, status: p.status, approvedAt: p.approvedAt, paidAt: p.paidAt, config: p.configSnapshot,
    payslips: p.payslips.map(slipRow),
    totals: { gross: p.payslips.reduce((s, x) => s + num(x.gross), 0), net: p.payslips.reduce((s, x) => s + num(x.net), 0), employerCost: p.payslips.reduce((s, x) => s + num(x.gross) + num(x.pensionEmployer) + num(x.nsitf) + num(x.itf), 0) },
    remittances: (['PAYE', 'PENSION', 'NHF', 'LEVIES'] as RemitKind[]).map((k) => ({ kind: k, due: num(due[k]), remitted: paid(k) })),
  });
}));

/** Add a bonus or a deduction (loan repayment, advance) to one payslip before the run is approved. Tax is recalculated. */
payrollRouter.put('/payroll/payslips/:id', asyncHandler(async (req, res) => {
  const b = parse(z.object({ bonus: money.default(0), otherDeductions: money.default(0), deductionNote: z.string().trim().max(200).optional() }), req.body);
  const s = await prisma.payslip.findUnique({ where: { id: req.params.id }, include: { employee: true, period: true } });
  if (!s) throw new HttpError(404, 'Payslip not found');
  if (s.period.status !== 'DRAFT') throw new HttpError(409, 'This payroll has been approved and can no longer be changed');
  const cfg = (s.period.configSnapshot as unknown as PayrollConfig) ?? (await getPayrollConfig());
  const c = computePay(payIn(s.employee, b), cfg);
  if (c.net.lt(0)) throw new HttpError(400, 'These deductions are more than the pay');
  await prisma.payslip.update({ where: { id: s.id }, data: { ...slipData(c), deductionNote: b.deductionNote } });
  res.json({ ok: true });
}));

payrollRouter.delete('/payroll/:id', asyncHandler(async (req, res) => {
  const p = await prisma.payrollPeriod.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Payroll period not found');
  if (p.status !== 'DRAFT') throw new HttpError(409, 'Only a draft payroll can be discarded');
  await prisma.payrollPeriod.delete({ where: { id: p.id } });
  res.status(204).end();
}));

/** Approving posts the whole run to the books and splits what is owed to each authority into its own liability account. */
payrollRouter.post('/payroll/:id/approve', asyncHandler(async (req, res) => {
  const p = await loadRun(req.params.id);
  if (p.status !== 'DRAFT') throw new HttpError(409, 'Already approved');
  const t = p.payslips.reduce((a, s) => ({
    gross: a.gross.plus(s.gross), net: a.net.plus(s.net), paye: a.paye.plus(s.paye), penEe: a.penEe.plus(s.pensionEmployee), penEr: a.penEr.plus(s.pensionEmployer),
    nhf: a.nhf.plus(s.nhf), levies: a.levies.plus(s.nsitf).plus(s.itf), other: a.other.plus(s.otherDeductions),
  }), { gross: D(0), net: D(0), paye: D(0), penEe: D(0), penEr: D(0), nhf: D(0), levies: D(0), other: D(0) });
  await prisma.$transaction(async (tx) => {
    await postJournal(tx, { description: `Payroll ${p.name}`, reference: `PAYROLL-${p.id}`, userId: req.user!.id, lines: [
      { code: ACC.SALARIES, debit: t.gross }, { code: ACC.EMPLOYER_PENSION, debit: t.penEr }, { code: ACC.LEVIES_EXPENSE, debit: t.levies },
      { code: ACC.PAYE_PAYABLE, credit: t.paye }, { code: ACC.PENSION_PAYABLE, credit: t.penEe.plus(t.penEr) }, { code: ACC.NHF_PAYABLE, credit: t.nhf }, { code: ACC.LEVIES_PAYABLE, credit: t.levies },
      { code: ACC.SALARIES_PAYABLE, credit: t.net.plus(t.other), memo: 'Net pay and other deductions held' },
    ] });
    await tx.payrollPeriod.update({ where: { id: p.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    await audit(tx, { userId: req.user!.id, action: 'PAYROLL_APPROVE', entity: 'PayrollPeriod', entityId: p.id, meta: { name: p.name, gross: Number(t.gross), net: Number(t.net), paye: Number(t.paye) } });
  });
  res.json({ ok: true });
}));

const methodBody = z.object({ method: z.enum(['BANK', 'CASH']), reference: z.string().trim().max(100).optional() });
const src = (m: 'BANK' | 'CASH') => (m === 'BANK' ? ACC.BANK : ACC.CASH);

/** Pay the staff their net salary. */
payrollRouter.post('/payroll/:id/pay', asyncHandler(async (req, res) => {
  const b = parse(methodBody, req.body);
  const p = await loadRun(req.params.id);
  if (p.status !== 'APPROVED') throw new HttpError(409, p.status === 'PAID' ? 'Salaries have already been paid' : 'Approve the payroll first');
  const net = p.payslips.reduce((s, x) => s.plus(x.net), D(0));
  await prisma.$transaction(async (tx) => {
    await postJournal(tx, { description: `Salaries paid: ${p.name}`, reference: `PAYROLL-PAY-${p.id}`, userId: req.user!.id, lines: [{ code: ACC.SALARIES_PAYABLE, debit: net }, { code: src(b.method), credit: net }] });
    await tx.payrollPeriod.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: new Date() } });
    await audit(tx, { userId: req.user!.id, action: 'PAYROLL_PAY', entity: 'PayrollPeriod', entityId: p.id, meta: { name: p.name, net: Number(net), method: b.method } });
  });
  res.json({ ok: true });
}));

const LIAB: Record<RemitKind, string> = { PAYE: ACC.PAYE_PAYABLE, PENSION: ACC.PENSION_PAYABLE, NHF: ACC.NHF_PAYABLE, LEVIES: ACC.LEVIES_PAYABLE };
/** Pay what is owed to the tax office, pension companies, NHF or NSITF/ITF. */
payrollRouter.post('/payroll/:id/remit', asyncHandler(async (req, res) => {
  const b = methodBody.extend({ kind: z.enum(['PAYE', 'PENSION', 'NHF', 'LEVIES']) }).parse(req.body);
  const p = await loadRun(req.params.id);
  if (p.status === 'DRAFT') throw new HttpError(409, 'Approve the payroll first');
  if (p.remittances.some((r) => r.kind === b.kind)) throw new HttpError(409, `${b.kind} has already been remitted for this payroll`);
  const due = amountsDue(p.payslips)[b.kind as RemitKind];
  if (!due.gt(0)) throw new HttpError(400, `There is nothing to remit for ${b.kind}`);
  await prisma.$transaction(async (tx) => {
    await postJournal(tx, { description: `${b.kind} remitted: ${p.name}`, reference: `PAYROLL-REMIT-${b.kind}-${p.id}`, userId: req.user!.id, lines: [{ code: LIAB[b.kind as RemitKind], debit: due }, { code: src(b.method), credit: due }] });
    await tx.payrollRemittance.create({ data: { periodId: p.id, kind: b.kind, amount: due, method: b.method, reference: b.reference, userId: req.user!.id } });
    await audit(tx, { userId: req.user!.id, action: 'PAYROLL_REMIT', entity: 'PayrollPeriod', entityId: p.id, meta: { kind: b.kind, amount: Number(due), reference: b.reference ?? null } });
  });
  res.json({ ok: true, amount: Number(due) });
}));
