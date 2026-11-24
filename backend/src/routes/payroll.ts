import { Router, type Response } from 'express';
import { z } from 'zod';
import { config, mailConfigured } from '../config';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { ACC, postJournal } from '../services/accounting';
import { amountsDue, computePay, getPayrollConfig, PayrollConfig, RemitKind, savePayrollConfig } from '../services/payroll';
import { methodFor, slipView, summarize } from '../services/payrollView';
import { renderPayslip, renderPeriodPayslips } from '../pdf/payslipPdf';
import { sendEmail } from '../delivery/mail';

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

// ───────────── Settings: rates, reliefs and tax bands (unchanged) ─────────────
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

// ───────────── Pay calculation helpers ─────────────
const mealOf = (e: { mealAllowance?: unknown }) => D((e.mealAllowance as any) ?? 0);

/** The meal allowance from the Staff form is regular pay too, so it joins "other allowances" for tax and gross. */
const payIn = (e: any, extra: { bonus?: unknown; otherDeductions?: unknown } = {}) => ({
  basic: e.baseSalary, housing: e.housingAllowance, transport: e.transportAllowance,
  otherAllow: D(e.otherAllowances ?? 0).plus(mealOf(e)),
  annualRent: e.annualRent, rentProofOnFile: e.rentProofOnFile, otherAnnualReliefs: e.otherAnnualReliefs,
  pensionEnrolled: e.pensionEnrolled, nhfEnrolled: e.nhfEnrolled,
  bonus: extra.bonus as any, otherDeductions: extra.otherDeductions as any,
});

/** What is stored on a payslip. Meal is kept on its own line so the payslip can show it. */
const slipData = (c: ReturnType<typeof computePay>, e: { mealAllowance?: unknown }) => ({
  gross: c.gross, deductions: c.deductions, net: c.net, basic: c.basic, housing: c.housing, transport: c.transport,
  otherAllow: c.otherAllow.minus(mealOf(e)), meal: mealOf(e), overtime: D(0),
  // Complimentary-excess is not recorded per employee yet (see compUsedThisMonth in routes/staff.ts), so it stays at zero.
  compExcess: D(0),
  bonus: c.bonus, pensionEmployee: c.pensionEmployee, pensionEmployer: c.pensionEmployer, nhf: c.nhf, rentRelief: c.rentRelief,
  taxableAnnual: c.taxableAnnual, paye: c.paye, otherDeductions: c.otherDeductions, nsitf: c.nsitf, itf: c.itf,
});

const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
/** PAY-YYYY-MM-DD from the last day of the period; a second run for the same day gets -2, -3... */
async function periodName(end: Date) {
  const base = `PAY-${ymd(end)}`;
  const taken = await prisma.payrollPeriod.count({ where: { name: { startsWith: base } } });
  return taken ? `${base}-${taken + 1}` : base;
}

async function pickEmployees(ids?: string[]) {
  const emps = await prisma.employee.findMany({
    where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ staffId: 'asc' }, { fullName: 'asc' }],
  });
  if (!emps.length) throw new HttpError(400, ids ? 'None of the selected staff are active' : 'Add at least one employee first');
  if (ids && emps.length !== new Set(ids).size) throw new HttpError(400, 'Some of the selected staff are no longer active');
  return emps;
}

// ───────────── Payroll runs ─────────────
payrollRouter.get('/payroll', asyncHandler(async (_q, res) => {
  const ps = await prisma.payrollPeriod.findMany({ orderBy: { startDate: 'desc' }, include: { payslips: true } });
  res.json(ps.map((p) => ({
    id: p.id, name: p.name, frequency: p.frequency, startDate: p.startDate, endDate: p.endDate, paymentDate: p.paymentDate, status: p.status,
    employees: p.payslips.length,
    totalGross: p.payslips.reduce((s, x) => s + num(x.gross), 0),
    totalNet: p.payslips.reduce((s, x) => s + num(x.net), 0),
    totalPaye: p.payslips.reduce((s, x) => s + num(x.paye), 0),
  })));
}));

const periodBody = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  frequency: z.enum(['MONTHLY']).default('MONTHLY'),
  trackTime: z.boolean().default(false),
  trackLeave: z.boolean().default(false),
  employeeIds: z.array(z.string()).min(1, 'Select at least one employee').optional(),
});

/** Works out pay for the chosen staff without saving anything. The "Generate Preview" button. */
payrollRouter.post('/payroll/preview', asyncHandler(async (req, res) => {
  const b = parse(z.object({ employeeIds: z.array(z.string()).min(1, 'Select at least one employee') }), req.body);
  const emps = await pickEmployees(b.employeeIds);
  const cfg = await getPayrollConfig();
  const rows = emps.map((e) =>
    slipView({ employeeId: e.id, ...slipData(computePay(payIn(e), cfg), e), paymentMethod: methodFor(e), paymentStatus: 'PENDING', employee: e }, 'DRAFT'));
  res.json({ config: cfg, summary: summarize(rows), rows });
}));

/** Creates the payroll. With no employeeIds it covers every active employee, as it always did. */
payrollRouter.post('/payroll', asyncHandler(async (req, res) => {
  const b = parse(periodBody.extend({ name: z.string().trim().min(1).max(60).optional() }), req.body);
  if (b.endDate < b.startDate) throw new HttpError(400, 'The end date must be after the start date');
  const emps = await pickEmployees(b.employeeIds);
  const cfg = await getPayrollConfig();
  const name = b.name ?? (await periodName(b.endDate));
  const p = await prisma.payrollPeriod.create({
    data: {
      name, startDate: b.startDate, endDate: b.endDate, paymentDate: b.paymentDate ?? null,
      frequency: b.frequency, trackTime: b.trackTime, trackLeave: b.trackLeave, configSnapshot: cfg as any,
      payslips: { create: emps.map((e) => ({ employeeId: e.id, paymentMethod: methodFor(e), ...slipData(computePay(payIn(e), cfg), e) })) },
    },
  });
  await audit(prisma, { userId: req.user!.id, action: 'PAYROLL_CREATE', entity: 'PayrollPeriod', entityId: p.id, meta: { name, employees: emps.length } });
  res.status(201).json({ id: p.id, name });
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
  const rows = p.payslips.map((s) => slipView(s, p.status));
  res.json({
    id: p.id, name: p.name, frequency: p.frequency, startDate: p.startDate, endDate: p.endDate, paymentDate: p.paymentDate,
    trackTime: p.trackTime, trackLeave: p.trackLeave, status: p.status, approvedAt: p.approvedAt, paidAt: p.paidAt, config: p.configSnapshot,
    payslips: rows,
    summary: summarize(rows),
    totals: { gross: p.payslips.reduce((s, x) => s + num(x.gross), 0), net: p.payslips.reduce((s, x) => s + num(x.net), 0), employerCost: p.payslips.reduce((s, x) => s + num(x.gross) + num(x.pensionEmployer) + num(x.nsitf) + num(x.itf), 0) },
    remittances: (['PAYE', 'PENSION', 'NHF', 'LEVIES'] as RemitKind[]).map((k) => ({ kind: k, due: num(due[k]), remitted: paid(k) })),
  });
}));

/** The "Update Payroll" button: new payment date plus bonuses and deductions for several employees at once. Tax is recalculated. */
payrollRouter.put('/payroll/:id', asyncHandler(async (req, res) => {
  const b = parse(z.object({
    paymentDate: z.coerce.date().optional(),
    adjustments: z.array(z.object({
      payslipId: z.string(), bonus: money.default(0), otherDeductions: money.default(0), deductionNote: z.string().trim().max(200).optional(),
    })).default([]),
  }), req.body);

  await prisma.$transaction(async (tx) => {
    const p = await tx.payrollPeriod.findUnique({ where: { id: req.params.id }, include: { payslips: { include: { employee: true } } } });
    if (!p) throw new HttpError(404, 'Payroll period not found');
    if (p.status !== 'DRAFT') throw new HttpError(409, 'This payroll has been approved and can no longer be changed');
    const cfg = (p.configSnapshot as unknown as PayrollConfig) ?? (await getPayrollConfig());

    for (const a of b.adjustments) {
      const s = p.payslips.find((x) => x.id === a.payslipId);
      if (!s) throw new HttpError(400, 'A payslip in this request does not belong to this payroll');
      const c = computePay(payIn(s.employee, a), cfg);
      if (c.net.lt(0)) throw new HttpError(400, `These deductions are more than the pay for ${s.employee.fullName}`);
      await tx.payslip.update({ where: { id: s.id }, data: { ...slipData(c, s.employee), deductionNote: a.deductionNote || null } });
    }
    if (b.paymentDate) await tx.payrollPeriod.update({ where: { id: p.id }, data: { paymentDate: b.paymentDate } });
    await audit(tx, { userId: req.user!.id, action: 'PAYROLL_EDIT', entity: 'PayrollPeriod', entityId: p.id, meta: { name: p.name, adjusted: b.adjustments.length } });
  });
  res.json({ ok: true });
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
  await prisma.payslip.update({ where: { id: s.id }, data: { ...slipData(c, s.employee), deductionNote: b.deductionNote } });
  res.json({ ok: true });
}));

payrollRouter.delete('/payroll/:id', asyncHandler(async (req, res) => {
  const p = await prisma.payrollPeriod.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'Payroll period not found');
  if (p.status !== 'DRAFT') throw new HttpError(409, 'Only a draft payroll can be discarded');
  await prisma.payrollPeriod.delete({ where: { id: p.id } });
  await audit(prisma, { userId: req.user!.id, action: 'PAYROLL_DELETE', entity: 'PayrollPeriod', entityId: p.id, meta: { name: p.name } });
  res.status(204).end();
}));

/** Approving posts the whole run to the books and splits what is owed to each authority into its own liability account. (unchanged) */
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

/**
 * Pay the staff their net salary ("Process Payments").
 * With no body each employee is paid the way their payslip says (bank transfer or cash).
 * The older screen still sends { method } to pay everyone one way.
 */
payrollRouter.post('/payroll/:id/pay', asyncHandler(async (req, res) => {
  const b = parse(z.object({ method: z.enum(['BANK', 'CASH']).optional() }), req.body ?? {});
  const p = await loadRun(req.params.id);
  if (p.status !== 'APPROVED') throw new HttpError(409, p.status === 'PAID' ? 'Salaries have already been paid' : 'Approve the payroll first');

  const via = (s: (typeof p.payslips)[number]) =>
    b.method ? (b.method === 'BANK' ? 'BANK_TRANSFER' : 'CASH') : (s.paymentMethod ?? methodFor(s.employee));
  const bank = p.payslips.filter((s) => via(s) === 'BANK_TRANSFER');
  const cash = p.payslips.filter((s) => via(s) !== 'BANK_TRANSFER');
  const sum = (l: typeof bank) => l.reduce((t, s) => t.plus(s.net), D(0));
  const bankNet = sum(bank), cashNet = sum(cash), net = bankNet.plus(cashNet);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Claim the run first so two people clicking at once cannot pay twice.
    const claimed = await tx.payrollPeriod.updateMany({ where: { id: p.id, status: 'APPROVED' }, data: { status: 'PAID', paidAt: now } });
    if (claimed.count !== 1) throw new HttpError(409, 'Salaries have already been paid');
    await postJournal(tx, {
      description: `Salaries paid: ${p.name}`, reference: `PAYROLL-PAY-${p.id}`, userId: req.user!.id,
      lines: [{ code: ACC.SALARIES_PAYABLE, debit: net }, { code: ACC.BANK, credit: bankNet }, { code: ACC.CASH, credit: cashNet }],
    });
    if (bank.length) await tx.payslip.updateMany({ where: { id: { in: bank.map((s) => s.id) } }, data: { paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PAID', paidAt: now } });
    if (cash.length) await tx.payslip.updateMany({ where: { id: { in: cash.map((s) => s.id) } }, data: { paymentMethod: 'CASH', paymentStatus: 'PAID', paidAt: now } });
    await audit(tx, { userId: req.user!.id, action: 'PAYROLL_PAY', entity: 'PayrollPeriod', entityId: p.id, meta: { name: p.name, net: Number(net), bank: Number(bankNet), cash: Number(cashNet), method: b.method ?? 'PER_EMPLOYEE' } });
  });
  res.json({ ok: true });
}));

const LIAB: Record<RemitKind, string> = { PAYE: ACC.PAYE_PAYABLE, PENSION: ACC.PENSION_PAYABLE, NHF: ACC.NHF_PAYABLE, LEVIES: ACC.LEVIES_PAYABLE };
/** Pay what is owed to the tax office, pension companies, NHF or NSITF/ITF. (unchanged) */
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

// ───────────── Payslips: one employee's page, PDFs and email ─────────────

/** Everything the payslip page needs. */
payrollRouter.get('/payroll/payslips/:id', asyncHandler(async (req, res) => {
  const s = await prisma.payslip.findUnique({ where: { id: req.params.id }, include: { employee: true, period: true } });
  if (!s) throw new HttpError(404, 'Payslip not found');
  res.json({
    slip: slipView(s, s.period.status),
    email: s.employee.email ?? '',
    period: { id: s.period.id, name: s.period.name, startDate: s.period.startDate, endDate: s.period.endDate, paymentDate: s.period.paymentDate, status: s.period.status },
    hotel: { name: config.hotelName, address: config.hotelAddress, phone: config.hotelPhone },
  });
}));

const sendPdf = (res: Response, f: { buffer: Buffer; filename: string }, download: boolean) => {
  res.set({
    'Content-Type': 'application/pdf', 'Content-Length': String(f.buffer.length),
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${f.filename}"`, 'Cache-Control': 'no-store',
  });
  res.end(f.buffer);
};

payrollRouter.get('/payroll/payslips/:id/pdf', asyncHandler(async (req, res) =>
  sendPdf(res, await renderPayslip(req.params.id, req.user!.username), req.query.download === '1')));

/** "Download All Payslips (PDF)": every employee in the payroll, one per page. */
payrollRouter.get('/payroll/:id/payslips.pdf', asyncHandler(async (req, res) =>
  sendPdf(res, await renderPeriodPayslips(req.params.id, req.user!.username), req.query.download === '1')));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Emails the payslip PDF to the employee's own address on file. It cannot be sent anywhere else. */
payrollRouter.post('/payroll/payslips/:id/email', asyncHandler(async (req, res) => {
  if (!mailConfigured()) throw new HttpError(409, 'Email is not set up for this hotel yet');
  const s = await prisma.payslip.findUnique({ where: { id: req.params.id }, include: { employee: true, period: true } });
  if (!s) throw new HttpError(404, 'Payslip not found');
  if (s.period.status === 'DRAFT') throw new HttpError(409, 'Approve the payroll before emailing payslips');
  const to = s.employee.email;
  if (!to) throw new HttpError(400, `${s.employee.fullName} has no email address on file`);

  const pdf = await renderPayslip(s.id, req.user!.username);
  const first = s.employee.firstName ?? s.employee.fullName;
  await sendEmail({
    to,
    subject: `Your payslip for ${s.period.name} - ${config.hotelName}`,
    text: `Dear ${first},\n\nYour payslip for ${s.period.name} is attached.\n\n${config.hotelName}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111"><p>Dear ${esc(first)},</p><p>Your payslip for <b>${esc(s.period.name)}</b> is attached.</p><p>${esc(config.hotelName)}</p></div>`,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }],
  });
  await audit(prisma, { userId: req.user!.id, action: 'PAYSLIP_EMAIL', entity: 'Payslip', entityId: s.id, meta: { period: s.period.name, to } });
  res.json({ ok: true, to });
}));