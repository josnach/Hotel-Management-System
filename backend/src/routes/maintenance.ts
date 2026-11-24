import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  MaintenanceCategory,
  MaintenanceFrequency,
  MaintenancePriority,
  MaintenanceStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '../lib/prisma';
import { HttpError, asyncHandler, parse } from '../lib/http';
import { audit as writeAudit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { syncMaintenanceRooms } from './rooms';

export const maintenanceRouter = Router();
// Authentication is applied once in app.ts via api.use(authenticate).

/* ───────────── access ─────────────
 * requireRole: ADMIN always passes, MANAGER passes when any role is listed.
 *  - VIEW   → anyone who may report a fault
 *  - MANAGE → maintenance team (plus admin/manager)
 */
const VIEW = requireRole('MAINTENANCE', 'HOUSEKEEPING', 'RECEPTIONIST');
const MANAGE = requireRole('MAINTENANCE');

/* ───────────── helpers ───────────── */

const ACTIVE: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS'];
const DUE_SOON_DAYS = 7;

const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  HVAC: 'HVAC / Air Conditioning',
  FURNITURE: 'Furniture',
  APPLIANCE: 'Appliances',
  STRUCTURAL: 'Structural',
  IT_NETWORK: 'IT / Network',
  GENERAL: 'General',
};

const FREQUENCY_LABELS: Record<MaintenanceFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMI_ANNUALLY: 'Every 6 months',
  ANNUALLY: 'Yearly',
};

const addDays = (d: Date, days: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
};

const addMonths = (d: Date, months: number) => {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
};

function nextDue(from: Date, frequency: MaintenanceFrequency): Date {
  switch (frequency) {
    case 'DAILY':
      return addDays(from, 1);
    case 'WEEKLY':
      return addDays(from, 7);
    case 'MONTHLY':
      return addMonths(from, 1);
    case 'QUARTERLY':
      return addMonths(from, 3);
    case 'SEMI_ANNUALLY':
      return addMonths(from, 6);
    case 'ANNUALLY':
      return addMonths(from, 12);
  }
}

const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

const userName = (u?: { fullName: string | null; username: string } | null) =>
  u ? (u.fullName?.trim() || u.username) : null;

const ticketSelect = {
  id: true,
  ticketNo: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  category: true,
  cost: true,
  createdAt: true,
  startedAt: true,
  resolvedAt: true,
  resolutionNote: true,
  reportedByName: true,
  room: { select: { id: true, number: true } },
  reportedBy: { select: { fullName: true, username: true } },
  assignedTo: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.MaintenanceTicketSelect;

type TicketRow = Prisma.MaintenanceTicketGetPayload<{ select: typeof ticketSelect }>;

const mapTicket = (t: TicketRow) => ({
  id: t.id,
  ticketNo: t.ticketNo,
  ref: `MR-${String(t.ticketNo).padStart(4, '0')}`,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  category: t.category,
  categoryLabel: CATEGORY_LABELS[t.category],
  cost: Number(t.cost),
  room: t.room ? { id: t.room.id, number: t.room.number } : null,
  reportedBy: t.reportedByName?.trim() || userName(t.reportedBy) || '—',
  assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: userName(t.assignedTo) } : null,
  createdAt: t.createdAt,
  startedAt: t.startedAt,
  resolvedAt: t.resolvedAt,
  resolutionNote: t.resolutionNote,
});

type ScheduleRow = Prisma.MaintenanceScheduleGetPayload<{
  include: { room: { select: { id: true; number: true } } };
}>;

function scheduleState(s: { isActive: boolean; nextDueAt: Date }, now = new Date()) {
  if (!s.isActive) return 'INACTIVE' as const;
  if (s.nextDueAt < now) return 'OVERDUE' as const;
  if (s.nextDueAt <= addDays(now, DUE_SOON_DAYS)) return 'DUE_SOON' as const;
  return 'ON_TRACK' as const;
}

const mapSchedule = (s: ScheduleRow) => ({
  id: s.id,
  title: s.title,
  category: s.category,
  categoryLabel: CATEGORY_LABELS[s.category],
  roomId: s.roomId,
  roomNumber: s.room?.number ?? null,
  equipment: s.equipment,
  /** What the "Room/Equipment" column shows. */
  target: s.room ? `Room ${s.room.number}` : s.equipment ?? '—',
  frequency: s.frequency,
  frequencyLabel: FREQUENCY_LABELS[s.frequency],
  lastPerformedAt: s.lastPerformedAt,
  nextDueAt: s.nextDueAt,
  status: scheduleState(s),
  notes: s.notes,
  isActive: s.isActive,
});

const log = (req: Request, action: string, entityId: string, meta?: Prisma.InputJsonValue) =>
  writeAudit(prisma, { userId: req.user!.id, action, entity: 'Maintenance', entityId, meta });

/** Give a room back to the hotel once its last active ticket is closed. Only acts on rooms already in MAINTENANCE. */
async function releaseRoomIfClear(roomId: string | null) {
  if (!roomId) return;
  const stillActive = await prisma.maintenanceTicket.count({
    where: { roomId, status: { in: ACTIVE } },
  });
  if (!stillActive) {
    await prisma.room.updateMany({ where: { id: roomId, status: 'MAINTENANCE' }, data: { status: 'AVAILABLE' } });
  }
}

/* ───────────── GET /maintenance/dashboard ───────────── */

maintenanceRouter.get(
  '/dashboard',
  VIEW,
  asyncHandler(async (_req, res) => {
    await syncMaintenanceRooms();
    const now = new Date();
    const soon = addDays(now, DUE_SOON_DAYS);

    const [activeRequests, emergency, overduePm, dueSoon] = await Promise.all([
      prisma.maintenanceTicket.count({ where: { status: { in: ACTIVE } } }),
      prisma.maintenanceTicket.count({ where: { status: { in: ACTIVE }, priority: 'EMERGENCY' } }),
      prisma.maintenanceSchedule.count({ where: { isActive: true, nextDueAt: { lt: now } } }),
      prisma.maintenanceSchedule.count({
        where: { isActive: true, nextDueAt: { gte: now, lte: soon } },
      }),
    ]);

    res.json({ activeRequests, emergency, overduePm, dueSoon });
  }),
);

/* ───────────── GET /maintenance/options ─────────────
 * Everything the "Create Request" form needs in one call.
 */

maintenanceRouter.get(
  '/options',
  VIEW,
  asyncHandler(async (req, res) => {
    const [rooms, staff, me] = await Promise.all([
      prisma.room.findMany({
        select: { id: true, number: true, floor: true },
        orderBy: { number: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'MAINTENANCE', isActive: true },
        select: { id: true, fullName: true, username: true },
        orderBy: { username: 'asc' },
      }),
      prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { fullName: true, username: true },
      }),
    ]);

    res.json({
      rooms,
      categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
      priorities: [
        { value: 'EMERGENCY', label: 'Emergency' },
        { value: 'HIGH', label: 'High' },
        { value: 'NORMAL', label: 'Normal' },
      ],
      statuses: [
        { value: 'OPEN', label: 'Open' },
        { value: 'IN_PROGRESS', label: 'In Progress' },
        { value: 'RESOLVED', label: 'Completed' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
      frequencies: Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label })),
      staff: staff.map((s) => ({ id: s.id, name: userName(s) })),
      reportedBy: userName(me) ?? req.user!.username,
    });
  }),
);

/* ───────────── requests ───────────── */

const createRequestSchema = z.object({
  roomId: z.string().min(1, 'Room is required'),
  category: z.nativeEnum(MaintenanceCategory, { errorMap: () => ({ message: 'Category is required' }) }),
  priority: z.nativeEnum(MaintenancePriority).default('NORMAL'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(4000),
  reportedByName: z.string().trim().max(120).optional(),
});

const listQuerySchema = z.object({
  /** "active" (default) = OPEN + IN_PROGRESS, "all", or one exact status. */
  status: z.union([z.literal('active'), z.literal('all'), z.nativeEnum(MaintenanceStatus)]).default('active'),
  priority: z.union([z.literal('all'), z.nativeEnum(MaintenancePriority)]).default('all'),
});

maintenanceRouter.get(
  '/requests',
  VIEW,
  asyncHandler(async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    await syncMaintenanceRooms();

    const where: Prisma.MaintenanceTicketWhereInput = {};
    if (q.status === 'active') where.status = { in: ACTIVE };
    else if (q.status !== 'all') where.status = q.status;
    if (q.priority !== 'all') where.priority = q.priority;

    const rows = await prisma.maintenanceTicket.findMany({
      where,
      select: ticketSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });

    // Emergencies first among the same list, then newest.
    const rank: Record<MaintenancePriority, number> = { EMERGENCY: 0, HIGH: 1, NORMAL: 2 };
    const items = rows.map(mapTicket).sort((a, b) => rank[a.priority] - rank[b.priority]);

    res.json({ items });
  }),
);

maintenanceRouter.post(
  '/requests',
  VIEW,
  asyncHandler(async (req, res) => {
    const body = parse(createRequestSchema, req.body);

    const room = await prisma.room.findUnique({ where: { id: body.roomId }, select: { id: true } });
    if (!room) throw new HttpError(400, 'Selected room does not exist');

    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { fullName: true, username: true },
    });

    const created = await prisma.maintenanceTicket.create({
      data: {
        roomId: body.roomId,
        category: body.category,
        priority: body.priority,
        title: body.title,
        description: body.description,
        reportedById: req.user!.id,
        reportedByName: body.reportedByName || userName(me) || req.user!.username,
      },
      select: ticketSelect,
    });

    await log(req, 'MAINTENANCE_REQUEST_CREATED', created.id, {
      ticketNo: created.ticketNo,
      priority: created.priority,
      roomId: body.roomId,
    });

    res.status(201).json(mapTicket(created));
  }),
);

maintenanceRouter.get(
  '/requests/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const row = await prisma.maintenanceTicket.findUnique({
      where: { id: req.params.id },
      select: ticketSelect,
    });
    if (!row) throw new HttpError(404, 'Maintenance request not found');
    res.json(mapTicket(row));
  }),
);

const updateRequestSchema = z.object({
  status: z.nativeEnum(MaintenanceStatus).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  category: z.nativeEnum(MaintenanceCategory).optional(),
  assignedToId: z.string().min(1).nullable().optional(),
  cost: z.coerce.number().min(0).max(1_000_000_000).optional(),
  resolutionNote: z.string().trim().max(4000).nullable().optional(),
});

maintenanceRouter.patch(
  '/requests/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const body = parse(updateRequestSchema, req.body);

    const existing = await prisma.maintenanceTicket.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, startedAt: true, roomId: true },
    });
    if (!existing) throw new HttpError(404, 'Maintenance request not found');

    if (body.assignedToId) {
      const staff = await prisma.user.findUnique({
        where: { id: body.assignedToId },
        select: { isActive: true },
      });
      if (!staff?.isActive) throw new HttpError(400, 'Assignee not found or inactive');
    }

    const data: Prisma.MaintenanceTicketUncheckedUpdateInput = {};
    if (body.priority) data.priority = body.priority;
    if (body.category) data.category = body.category;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId;
    if (body.cost !== undefined) data.cost = body.cost;
    if (body.resolutionNote !== undefined) data.resolutionNote = body.resolutionNote;

    if (body.status && body.status !== existing.status) {
      data.status = body.status;
      if (body.status === 'IN_PROGRESS') {
        if (!existing.startedAt) data.startedAt = new Date();
        data.resolvedAt = null;
      } else if (body.status === 'RESOLVED') {
        if (!existing.startedAt) data.startedAt = new Date();
        data.resolvedAt = new Date();
      } else if (body.status === 'OPEN') {
        data.resolvedAt = null;
      } else if (body.status === 'CANCELLED') {
        data.resolvedAt = null;
      }
    }

    const updated = await prisma.maintenanceTicket.update({
      where: { id: existing.id },
      data,
      select: ticketSelect,
    });

    if (data.status === 'RESOLVED' || data.status === 'CANCELLED') await releaseRoomIfClear(existing.roomId);

    await log(req, 'MAINTENANCE_REQUEST_UPDATED', existing.id, body as Prisma.InputJsonValue);

    res.json(mapTicket(updated));
  }),
);

/* ───────────── preventive schedules ───────────── */

const scheduleBase = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: z.nativeEnum(MaintenanceCategory).default('GENERAL'),
  roomId: z.string().min(1).nullable().optional(),
  equipment: z.string().trim().max(200).nullable().optional(),
  frequency: z.nativeEnum(MaintenanceFrequency),
  /** Optional first due date; defaults to one interval from now. */
  nextDueAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const createScheduleSchema = scheduleBase.refine((v) => v.roomId || v.equipment, {
  message: 'Choose a room or enter the equipment',
  path: ['equipment'],
});

const updateScheduleSchema = scheduleBase.partial().extend({ isActive: z.boolean().optional() });

const scheduleInclude = { room: { select: { id: true, number: true } } } as const;

maintenanceRouter.get(
  '/schedules',
  VIEW,
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.all === '1';
    const rows = await prisma.maintenanceSchedule.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: scheduleInclude,
      orderBy: { nextDueAt: 'asc' },
    });
    const items = rows.map(mapSchedule);
    res.json({ activeCount: items.filter((i) => i.isActive).length, items });
  }),
);

maintenanceRouter.post(
  '/schedules',
  MANAGE,
  asyncHandler(async (req, res) => {
    const body = parse(createScheduleSchema, req.body);

    if (body.roomId) {
      const room = await prisma.room.findUnique({ where: { id: body.roomId }, select: { id: true } });
      if (!room) throw new HttpError(400, 'Selected room does not exist');
    }

    const created = await prisma.maintenanceSchedule.create({
      data: {
        title: body.title,
        category: body.category,
        roomId: body.roomId ?? null,
        equipment: body.equipment || null,
        frequency: body.frequency,
        nextDueAt: body.nextDueAt ?? nextDue(new Date(), body.frequency),
        notes: body.notes || null,
      },
      include: scheduleInclude,
    });

    await log(req, 'MAINTENANCE_SCHEDULE_CREATED', created.id, { title: created.title });
    res.status(201).json(mapSchedule(created));
  }),
);

maintenanceRouter.patch(
  '/schedules/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const body = parse(updateScheduleSchema, req.body);

    const existing = await prisma.maintenanceSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found');

    const updated = await prisma.maintenanceSchedule.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        category: body.category,
        roomId: body.roomId,
        equipment: body.equipment,
        frequency: body.frequency,
        nextDueAt: body.nextDueAt,
        notes: body.notes,
        isActive: body.isActive,
      },
      include: scheduleInclude,
    });

    await log(req, 'MAINTENANCE_SCHEDULE_UPDATED', existing.id, body as Prisma.InputJsonValue);
    res.json(mapSchedule(updated));
  }),
);

/** Mark a preventive job as done; the next due date rolls forward by the frequency. */
maintenanceRouter.post(
  '/schedules/:id/complete',
  MANAGE,
  asyncHandler(async (req, res) => {
    const { performedAt } = parse(z.object({ performedAt: z.coerce.date().optional() }), req.body ?? {});

    const existing = await prisma.maintenanceSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found');
    if (!existing.isActive) throw new HttpError(400, 'Schedule is inactive');

    const done = performedAt ?? new Date();
    const updated = await prisma.maintenanceSchedule.update({
      where: { id: existing.id },
      data: { lastPerformedAt: done, nextDueAt: nextDue(done, existing.frequency) },
      include: scheduleInclude,
    });

    await log(req, 'MAINTENANCE_SCHEDULE_COMPLETED', existing.id, { performedAt: done.toISOString() });
    res.json(mapSchedule(updated));
  }),
);

/* ───────────── GET /maintenance/reports?start=YYYY-MM-DD&end=YYYY-MM-DD ───────────── */

const reportQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start must be YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end must be YYYY-MM-DD'),
});

maintenanceRouter.get(
  '/reports',
  MANAGE,
  asyncHandler(async (req, res) => {
    const q = parse(reportQuerySchema, req.query);
    const start = new Date(`${q.start}T00:00:00.000Z`);
    const end = new Date(`${q.end}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new HttpError(400, 'Invalid date range');
    }

    const tickets = await prisma.maintenanceTicket.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
      select: {
        category: true,
        status: true,
        cost: true,
        createdAt: true,
        startedAt: true,
        resolvedAt: true,
      },
    });

    const completed = tickets.filter((t) => t.status === 'RESOLVED');
    const totalCost = tickets.reduce((sum, t) => sum + Number(t.cost), 0);

    const completionHours = completed
      .filter((t) => t.resolvedAt)
      .map((t) => hours(t.createdAt, t.resolvedAt!));
    const responseHours = tickets.filter((t) => t.startedAt).map((t) => hours(t.createdAt, t.startedAt!));

    const byCategory = new Map<MaintenanceCategory, { count: number; cost: number }>();
    for (const t of tickets) {
      const row = byCategory.get(t.category) ?? { count: 0, cost: 0 };
      row.count += 1;
      row.cost += Number(t.cost);
      byCategory.set(t.category, row);
    }

    res.json({
      range: { start: q.start, end: q.end },
      totalRequests: tickets.length,
      completedRequests: completed.length,
      avgCompletionHours: round1(mean(completionHours)),
      avgCost: completed.length
        ? Math.round((completed.reduce((s, t) => s + Number(t.cost), 0) / completed.length) * 100) / 100
        : 0,
      completionRate: tickets.length ? Math.round((completed.length / tickets.length) * 100) : 0,
      totalCost: Math.round(totalCost * 100) / 100,
      avgResponseHours: round1(mean(responseHours)),
      byCategory: [...byCategory.entries()]
        .map(([category, v]) => ({
          category,
          label: CATEGORY_LABELS[category],
          count: v.count,
          cost: Math.round(v.cost * 100) / 100,
        }))
        .sort((a, b) => b.count - a.count),
    });
  }),
);