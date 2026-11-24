
import {
  StaffShiftWeekday,
  StaffWorkShiftStatus,
  UserRole,
} from '@prisma/client';
import { HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { config } from '../config';

const REQUIRED_ROLES: UserRole[] = ['RECEPTIONIST', 'WAITER'];

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const weekdayMap: Record<string, StaffShiftWeekday> = {
  Monday: StaffShiftWeekday.MONDAY,
  Tuesday: StaffShiftWeekday.TUESDAY,
  Wednesday: StaffShiftWeekday.WEDNESDAY,
  Thursday: StaffShiftWeekday.THURSDAY,
  Friday: StaffShiftWeekday.FRIDAY,
  Saturday: StaffShiftWeekday.SATURDAY,
  Sunday: StaffShiftWeekday.SUNDAY,
};

function localParts(date: Date, timeZone = config.hotelTz): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function localDateKey(date: Date): string {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function localDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = target;

  // Reconcile the requested hotel-local time with its UTC instant.
  for (let i = 0; i < 4; i += 1) {
    const actual = localParts(new Date(result));
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    result += target - represented;
  }

  return new Date(result);
}

function addLocalDays(
  year: number,
  month: number,
  day: number,
  days: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    throw new HttpError(400, `Invalid schedule time: ${value}. Use HH:mm.`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function dateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

export function isShiftRequired(role: UserRole): boolean {
  return REQUIRED_ROLES.includes(role);
}

export async function resolveTodaySchedule(userId: string, now = new Date()) {
  const p = localParts(now);
  const dateKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: config.hotelTz,
    weekday: 'long',
  }).format(now);

  const weekday = weekdayMap[weekdayName];

  if (!weekday) {
    throw new HttpError(500, 'Unable to determine the hotel-local weekday');
  }

  const localDayStart = localDateToUtc(p.year, p.month, p.day, 0, 0);
  const localDayEndParts = addLocalDays(p.year, p.month, p.day, 1);
  const localDayEnd = localDateToUtc(
    localDayEndParts.year,
    localDayEndParts.month,
    localDayEndParts.day,
    0,
    0,
  );

  const override = await prisma.staffShiftDateOverride.findUnique({
    where: {
      userId_date: {
        userId,
        date: new Date(`${dateKey}T00:00:00.000Z`),
      },
    },
    include: { workLocation: true },
  });

  if (override?.isDayOff) {
    return {
      date: dateKey,
      isDayOff: true,
      schedule: null,
      source: 'DATE_OVERRIDE' as const,
    };
  }

  const recurring = await prisma.staffShiftSchedule.findFirst({
    where: {
      userId,
      weekday,
      isActive: true,
      effectiveFrom: { lt: localDayEnd },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: localDayStart } },
      ],
    },
    include: { workLocation: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  const startTime = override?.startTime ?? recurring?.startTime;
  const endTime = override?.endTime ?? recurring?.endTime;
  const graceMinutes = override?.graceMinutes ?? recurring?.graceMinutes ?? 30;
  const workLocation = override?.workLocation ?? recurring?.workLocation ?? null;

  if (!startTime || !endTime || !workLocation || !workLocation.isActive) {
    return {
      date: dateKey,
      isDayOff: false,
      schedule: null,
      source: override ? 'DATE_OVERRIDE' as const : 'WEEKLY_SCHEDULE' as const,
    };
  }

  const start = parseTime(startTime);
  const end = parseTime(endTime);

  const scheduledStartAt = localDateToUtc(
    p.year,
    p.month,
    p.day,
    start.hour,
    start.minute,
  );

  // An end time at or before the start time means the shift ends next day.
  const endIsNextDay =
    end.hour < start.hour ||
    (end.hour === start.hour && end.minute <= start.minute);

  const endDate = endIsNextDay
    ? addLocalDays(p.year, p.month, p.day, 1)
    : { year: p.year, month: p.month, day: p.day };

  const scheduledEndAt = localDateToUtc(
    endDate.year,
    endDate.month,
    endDate.day,
    end.hour,
    end.minute,
  );

  const durationMinutes = Math.round(
    (scheduledEndAt.getTime() - scheduledStartAt.getTime()) / 60000,
  );

  if (
    !Number.isInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > 240 ||
    durationMinutes <= 0
  ) {
    throw new HttpError(400, 'The employee schedule has invalid duration or grace settings');
  }

  return {
    date: dateKey,
    isDayOff: false,
    source: override ? 'DATE_OVERRIDE' as const : 'WEEKLY_SCHEDULE' as const,
    schedule: {
      id: recurring?.id ?? null,
      startTime,
      endTime,
      scheduledStartAt,
      scheduledEndAt,
      graceMinutes,
      graceEndsAt: new Date(
        scheduledEndAt.getTime() + graceMinutes * 60000,
      ),
      durationMinutes,
      workLocation,
    },
  };
}

export async function getCurrentWorkShift(userId: string, now = new Date()) {
  const shift = await prisma.staffWorkShift.findFirst({
    where: {
      userId,
      status: StaffWorkShiftStatus.OPEN,
    },
    include: {
      workLocation: true,
      schedule: true,
    },
    orderBy: { startedAt: 'desc' },
  });

  if (!shift) return null;

  if (now.getTime() > shift.graceEndsAt.getTime()) {
    await prisma.staffWorkShift.update({
      where: { id: shift.id },
      data: { status: StaffWorkShiftStatus.EXPIRED },
    });

    return null;
  }

  return shift;
}

export async function requireActiveWorkShift(userId: string) {
  const shift = await getCurrentWorkShift(userId);

  if (!shift) {
    throw new HttpError(
      403,
      'Your work shift is not active. Please clock in or contact your manager.',
    );
  }

  return shift;
}

export async function clockIn(userId: string, role: UserRole) {
  if (!isShiftRequired(role)) {
    throw new HttpError(400, 'Mandatory work shifts do not apply to your role');
  }

  const now = new Date();
  const existing = await getCurrentWorkShift(userId, now);

  if (existing) {
    throw new HttpError(409, 'You already have an open work shift');
  }

  const resolved = await resolveTodaySchedule(userId, now);

  if (resolved.isDayOff) {
    throw new HttpError(403, 'You are not scheduled to work today');
  }

  if (!resolved.schedule) {
    throw new HttpError(
      403,
      'No active work schedule is assigned to you for today. Contact your manager.',
    );
  }

  const schedule = resolved.schedule;

  if (now.getTime() > schedule.graceEndsAt.getTime()) {
    throw new HttpError(
      403,
      'Your scheduled shift and grace period have ended. Contact your manager.',
    );
  }

  try {
    return await prisma.staffWorkShift.create({
      data: {
        userId,
        roleAtStart: role,
        scheduleId: schedule.id,
        workLocationId: schedule.workLocation.id,
        startedAt: now,
        scheduledEndAt: schedule.scheduledEndAt,
        graceEndsAt: schedule.graceEndsAt,
        durationMinutes: schedule.durationMinutes,
        graceMinutes: schedule.graceMinutes,
        status: StaffWorkShiftStatus.OPEN,
      },
      include: {
        workLocation: true,
        schedule: true,
      },
    });
  } catch (error) {
    // The database partial unique index prevents concurrent open shifts.
    const current = await getCurrentWorkShift(userId);

    if (current) {
      throw new HttpError(409, 'You already have an open work shift');
    }

    throw error;
  }
}

export async function clockOut(userId: string, note?: string) {
  const now = new Date();

  const shift = await prisma.staffWorkShift.findFirst({
    where: {
      userId,
      status: StaffWorkShiftStatus.OPEN,
    },
  });

  if (!shift) {
    throw new HttpError(404, 'You do not have an open work shift');
  }

  const expired = now.getTime() > shift.graceEndsAt.getTime();

  return prisma.staffWorkShift.update({
    where: { id: shift.id },
    data: {
      status: expired
        ? StaffWorkShiftStatus.EXPIRED
        : StaffWorkShiftStatus.CLOSED,
      closedAt: now,
      closeNote: note?.trim() || null,
    },
    include: {
      workLocation: true,
      schedule: true,
    },
  });
}

export async function getMyShiftHistory(
  userId: string,
  page = 1,
  pageSize = 20,
) {
  const take = Math.min(100, Math.max(1, pageSize));
  const skip = (Math.max(1, page) - 1) * take;

  const [items, total] = await prisma.$transaction([
    prisma.staffWorkShift.findMany({
      where: { userId },
      include: {
        workLocation: true,
        schedule: true,
      },
      orderBy: { startedAt: 'desc' },
      skip,
      take,
    }),
    prisma.staffWorkShift.count({ where: { userId } }),
  ]);

  return {
    items,
    total,
    page: Math.max(1, page),
    pageSize: take,
  };
}
