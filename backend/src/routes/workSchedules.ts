
import { Router } from 'express';
import {
  StaffShiftWeekday,
  StaffWorkLocationType,
  UserRole,
} from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, parse, HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

export const workSchedulesRouter = Router();

workSchedulesRouter.use(requireRole('MANAGER'));

const timeSchema = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  'Time must use HH:mm format',
);
const staffRoles: UserRole[] = [
  UserRole.RECEPTIONIST,
  UserRole.WAITER,
];

const scheduleBody = z.object({
  weekday: z.nativeEnum(StaffShiftWeekday),
  startTime: timeSchema,
  endTime: timeSchema,
  graceMinutes: z.number().int().min(0).max(180).default(30),
  workLocationId: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

const overrideBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isDayOff: z.boolean().default(false),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  graceMinutes: z.number().int().min(0).max(180).nullable().optional(),
  workLocationId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

async function getEligibleStaff(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, fullName: true, role: true, isActive: true },
  });

  if (!user || !staffRoles.includes(user.role)) {
    throw new HttpError(404, 'Receptionist or waiter not found');
  }

  return user;
}

async function validateLocation(workLocationId: string) {
  const location = await prisma.staffWorkLocation.findFirst({
    where: { id: workLocationId, isActive: true },
  });

  if (!location) {
    throw new HttpError(400, 'Selected work location is not active');
  }

  return location;
}

// List eligible staff and their recurring schedules.
workSchedulesRouter.get('/staff', asyncHandler(async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: staffRoles }, isActive: true },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      workShiftSchedules: {
        where: { isActive: true },
        include: { workLocation: true },
        orderBy: { weekday: 'asc' },
      },
    },
    orderBy: { username: 'asc' },
  });

  res.json(staff);
}));

// List work locations and available sales points.
workSchedulesRouter.get('/locations', asyncHandler(async (_req, res) => {
  const [locations, salesPoints] = await Promise.all([
    prisma.staffWorkLocation.findMany({
      orderBy: { name: 'asc' },
      include: { salesPoint: true },
    }),
    prisma.salesPoint.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.json({ locations, salesPoints });
}));

// Create a receptionist desk or a location linked to a sales point.
workSchedulesRouter.post('/locations', asyncHandler(async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(100),
      type: z.nativeEnum(StaffWorkLocationType),
      salesPointId: z.string().nullable().optional(),
    }),
    req.body,
  );

  if (body.type === StaffWorkLocationType.SALES_POINT && !body.salesPointId) {
    throw new HttpError(400, 'A sales point must be selected for this location');
  }

  if (body.type === StaffWorkLocationType.RECEPTION_DESK && body.salesPointId) {
    throw new HttpError(400, 'Reception desks cannot be linked to a sales point');
  }

  if (body.salesPointId) {
    const point = await prisma.salesPoint.findFirst({
      where: { id: body.salesPointId, isActive: true },
    });

    if (!point) throw new HttpError(400, 'Active sales point not found');
  }

  const location = await prisma.staffWorkLocation.create({
    data: {
      name: body.name,
      type: body.type,
      salesPointId: body.salesPointId ?? null,
    },
    include: { salesPoint: true },
  });

  res.status(201).json(location);
}));

// Activate/deactivate a work location.
workSchedulesRouter.put('/locations/:id', asyncHandler(async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      isActive: z.boolean().optional(),
    }),
    req.body,
  );

  const location = await prisma.staffWorkLocation.update({
    where: { id: req.params.id },
    data: body,
    include: { salesPoint: true },
  });

  res.json(location);
}));

// List one employee's schedules, date overrides and recent shift history.
workSchedulesRouter.get('/staff/:userId', asyncHandler(async (req, res) => {
  const user = await getEligibleStaff(req.params.userId);

  const [schedules, overrides, shifts] = await Promise.all([
    prisma.staffShiftSchedule.findMany({
      where: { userId: user.id },
      include: { workLocation: true },
      orderBy: [{ weekday: 'asc' }, { effectiveFrom: 'desc' }],
    }),
    prisma.staffShiftDateOverride.findMany({
      where: { userId: user.id },
      include: { workLocation: true },
      orderBy: { date: 'desc' },
      take: 90,
    }),
    prisma.staffWorkShift.findMany({
      where: { userId: user.id },
      include: { workLocation: true },
      orderBy: { startedAt: 'desc' },
      take: 50,
    }),
  ]);

  res.json({ user, schedules, overrides, shifts });
}));

// Create an individual recurring weekly schedule.
workSchedulesRouter.post('/staff/:userId/schedules', asyncHandler(async (req, res) => {
  const user = await getEligibleStaff(req.params.userId);
  const body = parse(scheduleBody, req.body);

  await validateLocation(body.workLocationId);

  if (body.effectiveTo && body.effectiveFrom && body.effectiveTo < body.effectiveFrom) {
    throw new HttpError(400, 'Effective end date cannot be before the start date');
  }

  const schedule = await prisma.staffShiftSchedule.create({
    data: {
      userId: user.id,
      weekday: body.weekday,
      startTime: body.startTime,
      endTime: body.endTime,
      graceMinutes: body.graceMinutes,
      workLocationId: body.workLocationId,
      effectiveFrom: body.effectiveFrom ?? new Date(),
      effectiveTo: body.effectiveTo ?? null,
    },
    include: { workLocation: true },
  });

  res.status(201).json(schedule);
}));

// Update an individual recurring schedule.
workSchedulesRouter.put('/schedules/:id', asyncHandler(async (req, res) => {
  const body = parse(scheduleBody.partial(), req.body);

  if (body.workLocationId) {
    await validateLocation(body.workLocationId);
  }

  if (body.effectiveTo && body.effectiveFrom && body.effectiveTo < body.effectiveFrom) {
    throw new HttpError(400, 'Effective end date cannot be before the start date');
  }

  const schedule = await prisma.staffShiftSchedule.update({
    where: { id: req.params.id },
    data: body,
    include: { workLocation: true },
  });

  res.json(schedule);
}));

// Deactivate instead of deleting schedule history.
workSchedulesRouter.delete('/schedules/:id', asyncHandler(async (req, res) => {
  const schedule = await prisma.staffShiftSchedule.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ ok: true, schedule });
}));

// Add or replace a date-specific rota override.
workSchedulesRouter.put('/staff/:userId/overrides', asyncHandler(async (req, res) => {
  const user = await getEligibleStaff(req.params.userId);
  const body = parse(overrideBody, req.body);

  if (!body.isDayOff && (!body.startTime || !body.endTime)) {
    throw new HttpError(400, 'Start and end times are required unless this date is a day off');
  }

  if (body.workLocationId) {
    await validateLocation(body.workLocationId);
  }

  const date = new Date(`${body.date}T00:00:00.000Z`);

  const override = await prisma.staffShiftDateOverride.upsert({
    where: {
      userId_date: { userId: user.id, date },
    },
    create: {
      userId: user.id,
      date,
      isDayOff: body.isDayOff,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      graceMinutes: body.graceMinutes ?? null,
      workLocationId: body.workLocationId ?? null,
      note: body.note ?? null,
    },
    update: {
      isDayOff: body.isDayOff,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      graceMinutes: body.graceMinutes ?? null,
      workLocationId: body.workLocationId ?? null,
      note: body.note ?? null,
    },
    include: { workLocation: true },
  });

  res.json(override);
}));

// Remove a date override.
workSchedulesRouter.delete('/staff/:userId/overrides/:id', asyncHandler(async (req, res) => {
  const user = await getEligibleStaff(req.params.userId);

  const existing = await prisma.staffShiftDateOverride.findFirst({
    where: { id: req.params.id, userId: user.id },
  });

  if (!existing) throw new HttpError(404, 'Schedule override not found');

  await prisma.staffShiftDateOverride.delete({
    where: { id: existing.id },
  });

  res.json({ ok: true });
}));
