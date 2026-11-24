// backend/src/routes/staff.ts
// In app.ts:  import { staffRouter } from './routes/staff';   then   api.use('/staff', staffRouter);
import { Router } from 'express';
import { EmploymentType, Prisma } from '@prisma/client';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

const router = Router();
// requireRole: ADMIN always passes, MANAGER passes whenever any role is listed.
const canRead = requireRole('ACCOUNTANT'); // Admin, Manager, Accountant (salary data stays restricted)
const canWrite = requireRole('MANAGER');   // Admin, Manager

// ---------- helpers ----------
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const day = (v: unknown) => { const s = str(v); if (!s) return null; const d = new Date(s); return isNaN(+d) ? null : d; };
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const isUnique = (e: unknown, field: string) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target).includes(field);

/** TODO: wire to real comp usage. Orders don't record WHICH employee a complimentary item was for yet. */
const compUsedThisMonth = async (_employeeId: string) => 0;

async function toDto(e: Prisma.EmployeeGetPayload<{}>) {
  const used = await compUsedThisMonth(e.id);
  const limit = Number(e.compLimit);
  return {
   id: e.id, staffId: e.staffId ?? '', employeeNumber: e.employeeNumber ?? '', fullName: e.fullName,
    firstName: e.firstName ?? '', middleName: e.middleName ?? '', lastName: e.lastName ?? '',
    email: e.email ?? '', phone: e.phone ?? '', altPhone: e.altPhone ?? '',
    dateOfBirth: iso(e.dateOfBirth), gender: e.gender ?? '',
    department: e.department ?? '', position: e.position ?? '', jobTitle: e.jobTitle ?? '',
    employmentType: e.employmentType, hireDate: iso(e.hireDate), confirmationDate: iso(e.confirmationDate),
    supervisorId: e.supervisorId ?? '', status: e.isActive ? 'Active' : 'Inactive',
    basicSalary: Number(e.baseSalary), hourlyRate: Number(e.hourlyRate), mealAllowance: Number(e.mealAllowance),
    transportAllowance: Number(e.transportAllowance), housingAllowance: Number(e.housingAllowance),
    compLimit: limit, compUsed: used, compRemaining: limit - used,
    bankName: e.bankName ?? '', accountNumber: e.accountNumber ?? '', accountName: e.accountName ?? '', tin: e.tin ?? '',
    address: e.address ?? '', city: e.city ?? '', state: e.state ?? '',
    emergencyName: e.emergencyName ?? '', emergencyPhone: e.emergencyPhone ?? '', emergencyRelationship: e.emergencyRelationship ?? '',
  };
}

function parse(b: any) {
  const errors: Record<string, string> = {};
  const need = ['firstName', 'lastName', 'email', 'phone', 'department', 'position', 'employmentType', 'hireDate'];
  for (const k of need) if (!str(b[k])) errors[k] = 'This field is required';
  if (str(b.email) && !/^\S+@\S+\.\S+$/.test(b.email)) errors.email = 'Enter a valid email address';
  if (str(b.employmentType) && !(b.employmentType in EmploymentType)) errors.employmentType = 'Choose a valid employment type';
  if (str(b.hireDate) && !day(b.hireDate)) errors.hireDate = 'Enter a valid date';
  const firstName = str(b.firstName), middleName = str(b.middleName), lastName = str(b.lastName);
  const data = {
    firstName, middleName, lastName,
    fullName: [firstName, middleName, lastName].filter(Boolean).join(' '),
    email: str(b.email)?.toLowerCase() ?? null, phone: str(b.phone), altPhone: str(b.altPhone),
    dateOfBirth: day(b.dateOfBirth), gender: str(b.gender),
    department: str(b.department), position: str(b.position), jobTitle: str(b.jobTitle),
    employmentType: (b.employmentType as EmploymentType) ?? 'FULL_TIME',
    hireDate: day(b.hireDate), confirmationDate: day(b.confirmationDate), supervisorId: str(b.supervisorId),
    baseSalary: num(b.basicSalary), hourlyRate: num(b.hourlyRate), mealAllowance: num(b.mealAllowance),
    transportAllowance: num(b.transportAllowance), housingAllowance: num(b.housingAllowance), compLimit: num(b.compLimit),
    bankName: str(b.bankName), accountNumber: str(b.accountNumber), accountName: str(b.accountName), tin: str(b.tin),
    address: str(b.address), city: str(b.city), state: str(b.state),
    emergencyName: str(b.emergencyName), emergencyPhone: str(b.emergencyPhone), emergencyRelationship: str(b.emergencyRelationship),
  };
  return { errors, data };
}

async function nextStaffId(tx: Prisma.TransactionClient) {
  const prefix = `STAFF-${new Date().getFullYear()}-`;
  const last = await tx.employee.findFirst({
    where: { staffId: { startsWith: prefix } }, orderBy: { staffId: 'desc' }, select: { staffId: true },
  });
  const n = last?.staffId ? parseInt(last.staffId.slice(prefix.length), 10) + 1 : 0;
  return prefix + String(n).padStart(4, '0');
}

async function nextEmployeeNumber(tx: Prisma.TransactionClient) {
  const prefix = `EMP-${new Date().getFullYear()}-`;
  const last = await tx.employee.findFirst({
    where: { employeeNumber: { startsWith: prefix } }, orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true },
  });
  const n = last?.employeeNumber ? parseInt(last.employeeNumber.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(5, '0');
}

// ---------- routes ----------
router.get('/', canRead, asyncHandler(async (req, res) => {
  const { q, department, status } = req.query as Record<string, string | undefined>;
  const where: Prisma.EmployeeWhereInput = {
    ...(department ? { department } : {}),
    ...(status === 'Active' ? { isActive: true } : status === 'Inactive' ? { isActive: false } : {}),
    ...(q?.trim() ? { OR: ['staffId', 'fullName', 'email', 'phone'].map((f) => ({ [f]: { contains: q.trim(), mode: 'insensitive' } })) } : {}),
  };
  const rows = await prisma.employee.findMany({ where, orderBy: [{ staffId: 'desc' }, { createdAt: 'desc' }] });
  res.json(await Promise.all(rows.map(toDto)));
}));

router.get('/:id', canRead, asyncHandler(async (req, res) => {
  const e = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Staff member not found' });
  res.json(await toDto(e));
}));

router.post('/', canWrite, asyncHandler(async (req, res) => {
  const { errors, data } = parse(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', errors });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) =>
        tx.employee.create({
          data: {
            ...data,
            staffId: await nextStaffId(tx),
            employeeNumber: await nextEmployeeNumber(tx),
            isActive: true,
          },
        }));
      return res.status(201).json(await toDto(created));
    } catch (e) {
      if (isUnique(e, 'email')) return res.status(409).json({ error: 'A staff member with this email already exists', errors: { email: 'Already in use' } });
      if (isUnique(e, 'staffId') || isUnique(e, 'employeeNumber')) continue; // two people created at once: retry with the next number
      throw e;
    }
  }
  res.status(503).json({ error: 'Could not generate a staff ID. Try again.' });
}));
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { errors, data } = parse(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', errors });
  if (data.supervisorId === req.params.id) return res.status(400).json({ error: 'A staff member cannot supervise themselves' });
  try {
    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: { ...data, ...(req.body.status ? { isActive: req.body.status === 'Active' } : {}) },
    });
    res.json(await toDto(updated));
  } catch (e) {
    if (isUnique(e, 'email')) return res.status(409).json({ error: 'A staff member with this email already exists', errors: { email: 'Already in use' } });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return res.status(404).json({ error: 'Staff member not found' });
    throw e;
  }
}));

router.delete('/:id', canWrite, asyncHandler(async (req, res) => {
  const id = req.params.id;
  if ((await prisma.payslip.count({ where: { employeeId: id } })) > 0) {
    await prisma.employee.update({ where: { id }, data: { isActive: false } });
    return res.json({ deleted: false, message: 'This person has payroll history, so they were deactivated instead of deleted.' });
  }
  await prisma.employee.delete({ where: { id } });
  res.json({ deleted: true, message: 'Staff member deleted' });
}));

export { router as staffRouter };