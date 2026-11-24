import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { asyncHandler, clientIp, HttpError, page, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { bounds, ymd } from '../services/period';

export const securityExtraRouter = Router();
securityExtraRouter.use(requireRole('RECEPTIONIST'));

const blank = (v: unknown) => (v === '' ? undefined : v);
const dateOpt = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional());
const isForeign = (nat?: string | null) => !!nat?.trim() && !/nigeria/i.test(nat);
const SECURITY_ACTIONS = ['GUEST_SECURITY_STATUS', 'GUEST_CONTACT_EXPORT'];
const userName = (u: { fullName: string | null; username: string } | null | undefined) => u?.fullName ?? u?.username ?? null;

/* ───────── DSS reports are derived: one per stay checked in on the date ───────── */
const reportNo = (checkInAt: Date, stayId: string) => `DSS-${ymd(checkInAt).replace(/-/g, '')}-${stayId.slice(-5).toUpperCase()}`;
const dssStatus = (s: string) => (s === 'VERIFIED' ? 'SUBMITTED' : s === 'FLAGGED' ? 'FLAGGED' : 'PENDING') as 'SUBMITTED' | 'FLAGGED' | 'PENDING';

async function dssFor(from: Date, to: Date) {
  const stays = await prisma.stay.findMany({
    where: { checkInAt: { gte: from, lt: to } },
    include: { guest: true, room: true },
    orderBy: { checkInAt: 'asc' },
  });
  return stays.map((s) => ({
    id: s.id,
    reportNo: reportNo(s.checkInAt, s.id),
    guestId: s.guestId,
    guestName: `${s.guest.firstName} ${s.guest.lastName}`,
    nationality: s.guest.nationality?.trim() || 'Not specified',
    passportId: s.guest.idNumber?.trim() || null,
    status: dssStatus(s.guest.securityStatus),
    submittedAt: s.guest.securityStatus === 'VERIFIED' ? s.guest.securityAt : null,
    room: s.room.number,
    checkInAt: s.checkInAt,
    foreign: isForeign(s.guest.nationality),
  }));
}
const dssStats = (list: Awaited<ReturnType<typeof dssFor>>) => {
  const submitted = list.filter((r) => r.status === 'SUBMITTED').length;
  return {
    totalGuests: new Set(list.map((r) => r.guestId)).size,
    foreignGuests: new Set(list.filter((r) => r.foreign).map((r) => r.guestId)).size,
    submitted,
    pending: list.length - submitted,
  };
};

async function logsBetween(from: Date, to: Date, take = 5) {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: SECURITY_ACTIONS }, createdAt: { gte: from, lt: to } },
    include: { user: { select: { fullName: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r) => {
    const m = (r.meta ?? {}) as Record<string, any>;
    const detail =
      r.action === 'GUEST_CONTACT_EXPORT' ? `Exported ${m.count ?? 0} guest contact records (${m.format ?? 'csv'})`
      : m.from === m.to ? `Security note updated for ${m.guest ?? 'a guest'}`
      : `${m.guest ?? 'A guest'} marked ${String(m.to ?? '').toLowerCase()}`;
    return { id: r.id, action: r.action, user: userName(r.user), at: r.createdAt, detail };
  });
}

securityExtraRouter.get('/dss-reports', asyncHandler(async (req, res) => {
  const { date } = parse(z.object({ date: dateOpt }), req.query);
  const day = date ?? ymd(new Date());
  const { start, end } = bounds(day);
  const [reports, logs] = await Promise.all([dssFor(start, end), logsBetween(start, end)]);
  res.json({ date: day, stats: dssStats(reports), reports, incidents: [], logs });
}));

securityExtraRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const today = ymd(new Date());
  const { start, end } = bounds(today);
  const threeDaysAgo = new Date(end.getTime() - 3 * 86_400_000);
  const [todays, recent, logsToday] = await Promise.all([
    dssFor(start, end),
    dssFor(threeDaysAgo, end),
    prisma.auditLog.count({ where: { action: { in: SECURITY_ACTIONS }, createdAt: { gte: start, lt: end } } }),
  ]);
  const submitted = todays.filter((r) => r.status === 'SUBMITTED').length;
  res.json({
    date: today,
    stats: {
      dssReports: todays.length, submitted,
      submissionRate: todays.length ? Math.round((submitted / todays.length) * 100) : 0,
      securityIncidents: 0, securityLogs: logsToday,
    },
    recentIncidents: [],
    pendingReports: recent.filter((r) => r.status !== 'SUBMITTED').slice(0, 10),
  });
}));

/** Same contract as the old route, now with an audit entry so the Security Logs have something to count. */
securityExtraRouter.post('/guests/:id/report', asyncHandler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['VERIFIED', 'FLAGGED', 'PENDING']), note: z.string().optional() }), req.body);
  const before = await prisma.guest.findUnique({ where: { id: req.params.id }, select: { firstName: true, lastName: true, securityStatus: true } });
  if (!before) throw new HttpError(404, 'Guest not found');
  const guest = await prisma.guest.update({
    where: { id: req.params.id },
    data: { securityStatus: b.status, securityNote: b.note, securityAt: new Date() },
  });
  await audit(prisma, {
    userId: req.user!.id, action: 'GUEST_SECURITY_STATUS', entity: 'Guest', entityId: guest.id, ip: clientIp(req),
    meta: { guest: `${before.firstName} ${before.lastName}`, from: before.securityStatus, to: b.status },
  });
  res.json(guest);
}));

/* ───────── Guest Contact Information ───────── */
const searchWhere = (q: string): Prisma.GuestWhereInput => {
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.length
    ? { AND: tokens.map((t) => ({ OR: [
        { firstName: { contains: t, mode: 'insensitive' } }, { lastName: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } }, { phone: { contains: t } },
      ] })) }
    : {};
};
const order: Prisma.GuestOrderByWithRelationInput[] = [{ firstName: 'asc' }, { lastName: 'asc' }];
const inHouse = { where: { status: 'CHECKED_IN' as const }, take: 1, select: { id: true } };

securityExtraRouter.get('/guests-info', asyncHandler(async (req, res) => {
  const { skip, take, page: p, pageSize } = page(req.query, 20);
  const where = searchWhere(String(req.query.q ?? '').trim());
  const [total, rows, totalGuests, checkedIn, withEmail, withPhone] = await Promise.all([
    prisma.guest.count({ where }),
    prisma.guest.findMany({
      where, skip, take, orderBy: order,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, idType: true, idNumber: true,
        nationality: true, securityStatus: true, securityAt: true, stays: inHouse,
      },
    }),
    prisma.guest.count(),
    prisma.guest.count({ where: { stays: { some: { status: 'CHECKED_IN' } } } }),
    prisma.guest.count({ where: { AND: [{ email: { not: null } }, { email: { not: '' } }] } }),
    prisma.guest.count({ where: { phone: { not: '' } } }),
  ]);
  res.json({
    total, page: p, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    stats: { totalGuests, checkedIn, withEmail, withPhone },
    rows: rows.map(({ stays, ...g }) => ({ ...g, checkedIn: stays.length > 0 })),
  });
}));

securityExtraRouter.get('/guests-info/export', asyncHandler(async (req, res) => {
  const { format, q } = parse(z.object({ format: z.enum(['csv', 'xlsx']).default('csv'), q: z.string().optional() }), req.query);
  const guests = await prisma.guest.findMany({
    where: searchWhere((q ?? '').trim()), orderBy: order, take: 20_000,
    select: { firstName: true, lastName: true, email: true, phone: true, idType: true, idNumber: true, nationality: true, securityStatus: true, stays: inHouse },
  });
  const head = ['Name', 'Email', 'Phone', 'ID Type', 'ID Number', 'Nationality', 'Security Status', 'Checked In'];
  const rows = guests.map((g) => [
    `${g.firstName} ${g.lastName}`, g.email ?? '', g.phone, g.idType ?? '', g.idNumber ?? '',
    g.nationality ?? '', g.securityStatus, g.stays.length ? 'Yes' : 'No',
  ]);
  await audit(prisma, { userId: req.user!.id, action: 'GUEST_CONTACT_EXPORT', entity: 'Guest', ip: clientIp(req), meta: { format, count: rows.length } });

  const stamp = ymd(new Date());
  if (format === 'csv') {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="guest-contact-info-${stamp}.csv"`);
    res.send('\uFEFF' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'));
    return;
  }
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Guests');
  ws.addRow(head).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c: any) => { c.width = 24; });
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="guest-contact-info-${stamp}.xlsx"`);
  res.send(Buffer.from(buf));
}));