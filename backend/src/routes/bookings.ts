import { Router } from 'express';
import { z } from 'zod';
import { EventRateType, EventStatus, EventType, FacilityType, Prisma } from '@prisma/client';
import { config } from '../config';

import { asyncHandler, HttpError, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { ACC, postJournal } from '../services/accounting';
import { cashAccountFor } from '../services/folio';
import { requireRole } from '../middleware/auth';
import { onReservationConfirmed } from '../messaging/triggers';
import { assertNotBlacklisted } from '../services/crm';
import { generateReservationNumber } from '../lib/reservationNumber';
import { checkIn } from '../services/stays';
import { bounds, ymd } from '../services/period';

const GUARANTEE_TYPES = ['Deposit', 'Credit Card', 'Company Account', 'Guarantee Letter', 'None'] as const;
const AUTO_CONFIRM_GUARANTEES = new Set<string>(['Company Account', 'Guarantee Letter']);
const shouldConfirm = (deposit: number, guaranteeType: string) =>
  deposit > 0 || AUTO_CONFIRM_GUARANTEES.has(guaranteeType);

const monthRange = (q: Record<string, unknown>) => {
  const y = Number(q.year ?? new Date().getFullYear());
  const m = Number(q.month ?? new Date().getMonth() + 1);

  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 1),
  };
};

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

export const eventsRouter = Router();

const clientTypes = ['INDIVIDUAL', 'CORPORATE', 'ORGANIZATION'] as const;

const eventClientBody = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(clientTypes).default('INDIVIDUAL'),
  taxId: z.string().trim().max(60).nullable().optional(),
  contactPerson: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(160).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  groupId: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const eventClientUpdateBody = eventClientBody.partial();

const eventClientTypeQuery = z.enum(clientTypes);

const eventClientBookingStatuses = [
  'CONFIRMED',
  'IN_PROGRESS',
] as const;

// GET /clients
// Search and filter event clients.
eventsRouter.get(
  '/clients',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const activeParam = String(req.query.active ?? '').trim();
    const typeParam = String(req.query.type ?? '').trim();

    const typeResult = typeParam
      ? eventClientTypeQuery.safeParse(typeParam)
      : null;

    if (typeResult && !typeResult.success) {
      throw new HttpError(400, 'Invalid client type');
    }

    if (activeParam && !['true', 'false'].includes(activeParam)) {
      throw new HttpError(400, 'Invalid active filter');
    }

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                contactPerson: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              { phone: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(typeResult?.success ? { type: typeResult.data } : {}),
      ...(activeParam ? { isActive: activeParam === 'true' } : {}),
    };

    const clients = await prisma.eventClient.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { bookings: true },
        },
        bookings: {
          where: {
            status: { in: [...eventClientBookingStatuses] },
          },
          select: { id: true },
        },
      },
    });

    const result = clients.map((client) => ({
      id: client.id,
      name: client.name,
      type: client.type,
      taxId: client.taxId,
      contactPerson: client.contactPerson,
      phone: client.phone,
      email: client.email,
      address: client.address,
      groupId: client.groupId,
      notes: client.notes,
      isActive: client.isActive,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      totalEvents: client._count.bookings,
      activeEvents: client.bookings.length,
    }));

    res.json({
      clients: result,
      summary: {
        totalClients: result.length,
        corporateClients: result.filter(
          (client) => client.type === 'CORPORATE',
        ).length,
        individualClients: result.filter(
          (client) => client.type === 'INDIVIDUAL',
        ).length,
        activeClients: result.filter((client) => client.isActive).length,
        activeEvents: result.reduce(
          (total, client) => total + client.activeEvents,
          0,
        ),
      },
    });
  }),
);

// GET /clients/:id
// View a client and their event booking history.
eventsRouter.get(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const client = await prisma.eventClient.findUnique({
      where: { id: req.params.id },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
        bookings: {
          orderBy: { startsAt: 'desc' },
          include: {
            facility: {
              select: {
                id: true,
                name: true,
              },
            },
            facilities: {
              include: {
                facility: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new HttpError(404, 'Event client not found');
    }

    const activeEvents = client.bookings.filter((booking) =>
      eventClientBookingStatuses.includes(
        booking.status as (typeof eventClientBookingStatuses)[number],
      ),
    ).length;

    res.json({
      client: {
        ...client,
        totalEvents: client.bookings.length,
        activeEvents,
      },
    });
  }),
);

// POST /clients
// Create an individual, corporate or organization event client.
eventsRouter.post(
  '/clients',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(eventClientBody, req.body);

    if (body.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: body.groupId },
        select: { id: true },
      });

      if (!group) {
        throw new HttpError(404, 'Linked group not found');
      }
    }

    const client = await prisma.eventClient.create({
      data: {
        name: body.name,
        type: body.type,
        taxId: body.taxId || null,
        contactPerson: body.contactPerson || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        groupId: body.groupId || null,
        notes: body.notes || null,
        ...(body.isActive !== undefined
          ? { isActive: body.isActive }
          : {}),
      },
    });

    res.status(201).json({ client });
  }),
);

// PUT /clients/:id
// Update client details.
eventsRouter.put(
  '/clients/:id',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(eventClientUpdateBody, req.body);

    const existing = await prisma.eventClient.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      throw new HttpError(404, 'Event client not found');
    }

    if (body.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: body.groupId },
        select: { id: true },
      });

      if (!group) {
        throw new HttpError(404, 'Linked group not found');
      }
    }

    const client = await prisma.eventClient.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.taxId !== undefined ? { taxId: body.taxId || null } : {}),
        ...(body.contactPerson !== undefined
          ? { contactPerson: body.contactPerson || null }
          : {}),
        ...(body.phone !== undefined
          ? { phone: body.phone || null }
          : {}),
        ...(body.email !== undefined
          ? { email: body.email || null }
          : {}),
        ...(body.address !== undefined
          ? { address: body.address || null }
          : {}),
        ...(body.groupId !== undefined
          ? { groupId: body.groupId || null }
          : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes || null }
          : {}),
        ...(body.isActive !== undefined
          ? { isActive: body.isActive }
          : {}),
      },
    });

    res.json({ client });
  }),
);

// DELETE /clients/:id
// Soft-deactivate a client. Booking history is retained.
eventsRouter.delete(
  '/clients/:id',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.eventClient.findUnique({
      where: { id: req.params.id },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      throw new HttpError(404, 'Event client not found');
    }

    const client = await prisma.eventClient.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({
      message: 'Event client deactivated successfully',
      client,
    });
  }),
);



/* =========================================================
   EVENTS: FACILITIES, CALENDAR AND MULTI-FACILITY BOOKINGS
   ========================================================= */

const eventActiveStatuses: EventStatus[] = [
  EventStatus.CONFIRMED,
  EventStatus.IN_PROGRESS,
];

const facilityBody = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.nativeEnum(FacilityType).default(FacilityType.CONFERENCE_HALL),
  description: z.string().trim().max(2000).nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  baseRate: z.coerce.number().positive().nullable().optional(),
  hourlyRate: z.coerce.number().positive().nullable().optional(),
  halfDayRate: z.coerce.number().positive().nullable().optional(),
  fullDayRate: z.coerce.number().positive().nullable().optional(),
  features: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  isActive: z.boolean().optional(),
});

const facilityUpdateBody = facilityBody.partial();

const duplicateName = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const facilityAssignmentBody = z.object({
  facilityId: z.string().min(1),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  setupStartsAt: z.coerce.date().nullable().optional(),
  teardownEndsAt: z.coerce.date().nullable().optional(),
  rateType: z.nativeEnum(EventRateType),
  quantity: z.coerce.number().positive().optional(),
  customRate: z.coerce.number().positive().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const eventCreateBody = z.object({
  title: z.string().trim().min(2).max(200),
  clientId: z.string().optional(),
  clientName: z.string().trim().max(160).optional(),
  clientPhone: z.string().trim().max(40).nullable().optional(),
  groupId: z.string().nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  expectedGuests: z.coerce.number().int().min(0).default(0),
  status: z.nativeEnum(EventStatus).default(EventStatus.INQUIRY),
  notes: z.string().trim().max(5000).nullable().optional(),
  eventType: z.nativeEnum(EventType).default(EventType.OTHER),
  description: z.string().trim().max(5000).nullable().optional(),
  eventManager: z.string().trim().max(160).nullable().optional(),
  specialRequirements: z.string().trim().max(5000).nullable().optional(),
  deposit: z
    .object({
      amount: z.coerce.number().min(0).default(0),
      method: z.enum(['CASH', 'CARD', 'TRANSFER']).optional(),
    })
    .optional(),
  facilities: z.array(facilityAssignmentBody).min(1),
}).superRefine((body, ctx) => {
  if (body.endsAt <= body.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Event end time must be after its start time',
    });
  }

  if (!body.clientId && !body.clientName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clientName'],
      message: 'Select an event client or provide a client name',
    });
  }

  const ids = body.facilities.map((item) => item.facilityId);

  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['facilities'],
      message: 'A facility can only be assigned once to the same booking',
    });
  }

  if ((body.deposit?.amount ?? 0) > 0 && !body.deposit?.method) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deposit', 'method'],
      message: 'Select a payment method for the deposit',
    });
  }
});

const eventUpdateBody = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  clientId: z.string().nullable().optional(),
  clientName: z.string().trim().max(160).optional(),
  clientPhone: z.string().trim().max(40).nullable().optional(),
  groupId: z.string().nullable().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  expectedGuests: z.coerce.number().int().min(0).optional(),
  status: z.nativeEnum(EventStatus).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const eventPaymentBody = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

const eventRefundBody = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().trim().max(160).nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});

type EventFacilityInput = z.infer<typeof facilityAssignmentBody>;

function eventInterval(input: {
  startsAt: Date;
  endsAt: Date;
  setupStartsAt?: Date | null;
  teardownEndsAt?: Date | null;
}) {
  const occupiedStart = input.setupStartsAt ?? input.startsAt;
  const occupiedEnd = input.teardownEndsAt ?? input.endsAt;

  if (input.endsAt <= input.startsAt) {
    throw new HttpError(400, 'Facility end time must be after start time');
  }

  if (occupiedStart > input.startsAt) {
    throw new HttpError(
      400,
      'Setup must start at or before the facility booking time',
    );
  }

  if (occupiedEnd < input.endsAt) {
    throw new HttpError(
      400,
      'Teardown must end at or after the facility booking time',
    );
  }

  if (occupiedEnd <= occupiedStart) {
    throw new HttpError(400, 'Invalid facility occupancy window');
  }

  return { occupiedStart, occupiedEnd };
}

function calculateFacilityPrice(
  facility: {
    baseRate: Prisma.Decimal | null;
    hourlyRate: Prisma.Decimal | null;
    halfDayRate: Prisma.Decimal | null;
    fullDayRate: Prisma.Decimal | null;
  },
  input: EventFacilityInput,
) {
  let unitRate: Prisma.Decimal;
  let quantity: Prisma.Decimal;

  if (input.rateType === EventRateType.HOURLY) {
    // Hourly pricing falls back to the facility's base rate.
    const hourly = facility.hourlyRate ?? facility.baseRate;

    if (!hourly || hourly.lte(0)) {
      throw new HttpError(
        400,
        'This facility does not have an hourly rate configured',
      );
    }

    const startsAt = input.startsAt!;
    const endsAt = input.endsAt!;

    const calculatedHours =
      Math.ceil(
        ((endsAt.getTime() - startsAt.getTime()) / 3_600_000) * 100,
      ) / 100;

    quantity = D(input.quantity ?? calculatedHours);
    unitRate = hourly;
  } else if (input.rateType === EventRateType.HALF_DAY) {
    if (!facility.halfDayRate || facility.halfDayRate.lte(0)) {
      throw new HttpError(
        400,
        'This facility does not have a half-day rate configured',
      );
    }

    quantity = D(input.quantity ?? 1);
    unitRate = facility.halfDayRate;
  } else if (input.rateType === EventRateType.FULL_DAY) {
    if (!facility.fullDayRate || facility.fullDayRate.lte(0)) {
      throw new HttpError(
        400,
        'This facility does not have a full-day rate configured',
      );
    }

    quantity = D(input.quantity ?? 1);
    unitRate = facility.fullDayRate;
  } else {
    if (input.customRate === undefined) {
      throw new HttpError(
        400,
        'A custom rate is required for custom facility pricing',
      );
    }

    quantity = D(input.quantity ?? 1);
    unitRate = D(input.customRate);
  }

  if (quantity.lte(0) || unitRate.lte(0)) {
    throw new HttpError(400, 'Facility quantity and rate must be positive');
  }

  return {
    quantity,
    unitRate,
    quotedAmount: quantity.mul(unitRate).toDecimalPlaces(2),
  };
}

async function lockEventFacilities(
  tx: Prisma.TransactionClient,
  facilityIds: string[],
) {
  const sortedIds = [...new Set(facilityIds)].sort();

  // Lock facility rows in a consistent order. This serializes concurrent
  // booking attempts for the same facilities.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Facility"
    WHERE "id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `;

  if (locked.length !== sortedIds.length) {
    throw new HttpError(404, 'One or more selected facilities do not exist');
  }

  return tx.facility.findMany({
    where: { id: { in: sortedIds } },
  });
}

async function assertFacilityAvailability(
  tx: Prisma.TransactionClient,
  assignments: Array<{
    facilityId: string;
    startsAt: Date;
    endsAt: Date;
    setupStartsAt?: Date | null;
    teardownEndsAt?: Date | null;
  }>,
  excludeBookingId?: string,
) {
  for (const assignment of assignments) {
    const { occupiedStart, occupiedEnd } = eventInterval(assignment);

    const existing = await tx.eventBookingFacility.findMany({
      where: {
        facilityId: assignment.facilityId,
        ...(excludeBookingId
          ? { eventBookingId: { not: excludeBookingId } }
          : {}),
        eventBooking: {
          status: { in: eventActiveStatuses },
        },
      },
      select: {
        startsAt: true,
        endsAt: true,
        setupStartsAt: true,
        teardownEndsAt: true,
        eventBooking: {
          select: { title: true },
        },
      },
    });

    for (const booking of existing) {
      const existingStart =
        booking.setupStartsAt ?? booking.startsAt;
      const existingEnd =
        booking.teardownEndsAt ?? booking.endsAt;

      // Half-open interval comparison: adjacent bookings are allowed.
      if (
        existingStart < occupiedEnd &&
        existingEnd > occupiedStart
      ) {
        throw new HttpError(
          409,
          `${booking.eventBooking.title} already occupies this facility during the selected time`,
        );
      }
    }
  }
}

async function buildEventFacilityAssignments(
  tx: Prisma.TransactionClient,
  facilities: EventFacilityInput[],
  eventStartsAt: Date,
  eventEndsAt: Date,
  userRole?: string,
) {
  const normalized = facilities.map((item) => ({
    ...item,
    startsAt: item.startsAt ?? eventStartsAt,
    endsAt: item.endsAt ?? eventEndsAt,
  }));

  const facilityRecords = await lockEventFacilities(
    tx,
    normalized.map((item) => item.facilityId),
  );

  const facilityById = new Map(
    facilityRecords.map((facility) => [facility.id, facility]),
  );

  const assignments = normalized.map((item) => {
    const facility = facilityById.get(item.facilityId);

    if (!facility) {
      throw new HttpError(404, 'Selected facility not found');
    }

    if (!facility.isActive) {
      throw new HttpError(400, `${facility.name} is not available for booking`);
    }

    if (
      item.rateType === EventRateType.CUSTOM &&
      userRole !== 'ADMIN' &&
      userRole !== 'MANAGER'
    ) {
      throw new HttpError(
        403,
        'Only managers and administrators can set custom facility rates',
      );
    }

    eventInterval(item);

    const price = calculateFacilityPrice(facility, {
      ...item,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    });

    return {
      facilityId: item.facilityId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      setupStartsAt: item.setupStartsAt ?? null,
      teardownEndsAt: item.teardownEndsAt ?? null,
      rateType: item.rateType,
      quantity: price.quantity,
      unitRate: price.unitRate,
      quotedAmount: price.quotedAmount,
      notes: item.notes ?? null,
    };
  });

  return assignments;
}

function calculateEventTotals(baseAmount: Prisma.Decimal) {
  const vatRate = D(config.vatRate);
  const serviceChargeRate = D(config.serviceChargeRate);

  // VAT and service charge are each calculated independently from base.
  const vatAmount = baseAmount.mul(vatRate).toDecimalPlaces(2);
  const serviceChargeAmount = baseAmount
    .mul(serviceChargeRate)
    .toDecimalPlaces(2);

  const totalAmount = baseAmount
    .plus(vatAmount)
    .plus(serviceChargeAmount)
    .toDecimalPlaces(2);

  return {
    baseAmount,
    vatRate,
    vatAmount,
    serviceChargeRate,
    serviceChargeAmount,
    totalAmount,
  };
}

/* -------------------- FACILITIES -------------------- */

// GET /facilities
eventsRouter.get(
  '/facilities',
  asyncHandler(async (_req, res) => {
    const facilities = await prisma.facility.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            events: true,
            eventAssignments: true,
          },
        },
      },
    });

    res.json(facilities);
  }),
);

// GET /facilities/:id
eventsRouter.get(
  '/facilities/:id',
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { events: true, eventAssignments: true } } },
    });
    if (!facility) throw new HttpError(404, 'Facility not found');
    res.json(facility);
  }),
);

// POST /facilities
// Managers and administrators can add facilities.
eventsRouter.post(
  '/facilities',
  requireRole('MANAGER'),
  asyncHandler(async (req, res) => {
    const body = parse(facilityBody, req.body);
    try {
      const facility = await prisma.facility.create({
        data: {
          name: body.name,
          type: body.type,
          description: body.description ?? null,
          capacity: body.capacity ?? null,
          baseRate: body.baseRate ?? null,
          hourlyRate: body.hourlyRate ?? null,
          halfDayRate: body.halfDayRate ?? null,
          fullDayRate: body.fullDayRate ?? null,
          features: body.features ?? [],
          isActive: body.isActive ?? true,
        },
      });
      res.status(201).json(facility);
    } catch (e) {
      if (duplicateName(e)) throw new HttpError(409, 'A facility with this name already exists');
      throw e;
    }
  }),
);

// PUT /facilities/:id
// Managers and administrators can maintain facility information and rates.
eventsRouter.put(
  '/facilities/:id',
  requireRole('MANAGER'),
  asyncHandler(async (req, res) => {
    const body = parse(facilityUpdateBody, req.body);
    const existing = await prisma.facility.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) throw new HttpError(404, 'Facility not found');
    try {
      const updated = await prisma.facility.update({
        where: { id: req.params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          ...(body.baseRate !== undefined ? { baseRate: body.baseRate } : {}),
          ...(body.hourlyRate !== undefined ? { hourlyRate: body.hourlyRate } : {}),
          ...(body.halfDayRate !== undefined ? { halfDayRate: body.halfDayRate } : {}),
          ...(body.fullDayRate !== undefined ? { fullDayRate: body.fullDayRate } : {}),
          ...(body.features !== undefined ? { features: body.features } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      res.json(updated);
    } catch (e) {
      if (duplicateName(e)) throw new HttpError(409, 'A facility with this name already exists');
      throw e;
    }
  }),
);

/* -------------------- DASHBOARD, LIST, DETAIL, REPORTS -------------------- */

const bookingInclude = {
  client: true,
  facilities: { include: { facility: { select: { name: true } } } },
} satisfies Prisma.EventBookingInclude;

const upcomingWhere = (now: Date): Prisma.EventBookingWhereInput => ({
  endsAt: { gte: now },
  status: { notIn: [EventStatus.CANCELLED, EventStatus.COMPLETED] },
});

const bookingTotal = (b: { totalAmount: Prisma.Decimal; quoted: Prisma.Decimal }) =>
  D(b.totalAmount).gt(0) ? D(b.totalAmount) : D(b.quoted);

const shapeBooking = (b: Prisma.EventBookingGetPayload<{ include: typeof bookingInclude }>) => ({
  id: b.id,
  title: b.title,
  eventType: b.eventType,
  clientName: b.client?.name ?? b.clientName,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  status: b.status,
  total: bookingTotal(b),
  paid: b.paid,
  facilities: b.facilities.map((f) => f.facility.name),
});

// GET /dashboard
eventsRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [upcomingCount, activeClients, pendingInquiries, completed, upcoming] = await Promise.all([
      prisma.eventBooking.count({ where: upcomingWhere(now) }),
      prisma.eventClient.count({ where: { isActive: true } }),
      prisma.eventBooking.count({ where: { status: EventStatus.INQUIRY } }),
      prisma.eventBooking.findMany({ where: { status: EventStatus.COMPLETED }, select: { totalAmount: true, quoted: true } }),
      prisma.eventBooking.findMany({ where: upcomingWhere(now), orderBy: { startsAt: 'asc' }, take: 10, include: bookingInclude }),
    ]);
    const totalRevenue = completed.reduce((t, b) => t.plus(bookingTotal(b)), D(0));
    res.json({
      stats: { upcomingEvents: upcomingCount, activeClients, totalRevenue, pendingInquiries },
      upcoming: upcoming.map(shapeBooking),
    });
  }),
);

// GET /bookings?filter=upcoming|active|inquiries|confirmed|all
eventsRouter.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const { filter } = parse(
      z.object({ filter: z.enum(['upcoming', 'active', 'inquiries', 'confirmed', 'all']).default('upcoming') }),
      req.query,
    );
    const where: Prisma.EventBookingWhereInput =
      filter === 'upcoming' ? upcomingWhere(new Date())
      : filter === 'active' ? { status: { in: eventActiveStatuses } }
      : filter === 'inquiries' ? { status: EventStatus.INQUIRY }
      : filter === 'confirmed' ? { status: EventStatus.CONFIRMED }
      : {};
    const rows = await prisma.eventBooking.findMany({
      where,
      orderBy: { startsAt: filter === 'upcoming' ? 'asc' : 'desc' },
      include: bookingInclude,
      take: 500,
    });
    res.json({ bookings: rows.map(shapeBooking) });
  }),
);

// GET /bookings/:id
eventsRouter.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    const b = await prisma.eventBooking.findUnique({
      where: { id: req.params.id },
      include: { client: true, facilities: { include: { facility: true } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!b) throw new HttpError(404, 'Event booking not found');
    res.json({ booking: { ...b, total: bookingTotal(b) } });
  }),
);

// GET /reports?start=&end=
const optDate = z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

eventsRouter.get(
  '/reports',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const q = parse(z.object({ start: optDate, end: optDate }), req.query);
    const today = ymd(new Date());
    const startStr = q.start ?? `${today.slice(0, 7)}-01`;
    const endStr = q.end ?? today;
    if (startStr > endStr) throw new HttpError(400, 'Start date must be on or before end date');
    const from = bounds(startStr).start;
    const to = bounds(endStr).end;
    const inRange: Prisma.EventBookingWhereInput = { startsAt: { gte: from, lt: to } };

    const [bookings, assignments] = await Promise.all([
      prisma.eventBooking.findMany({
        where: inRange,
        select: { status: true, totalAmount: true, quoted: true, paid: true, client: { select: { id: true, name: true } }, clientName: true },
      }),
      prisma.eventBookingFacility.findMany({
        where: { eventBooking: { ...inRange, status: EventStatus.COMPLETED } },
        select: { facilityId: true, quotedAmount: true, facility: { select: { name: true, type: true } } },
      }),
    ]);

    const completed = bookings.filter((b) => b.status === EventStatus.COMPLETED);
    const live = bookings.filter((b) => b.status !== EventStatus.CANCELLED);

    const statusCount = new Map<string, number>();
    bookings.forEach((b) => statusCount.set(b.status, (statusCount.get(b.status) ?? 0) + 1));

    const usage = new Map<string, { facilityId: string; name: string; type: string; bookings: number; revenue: Prisma.Decimal }>();
    for (const a of assignments) {
      const row = usage.get(a.facilityId) ?? { facilityId: a.facilityId, name: a.facility.name, type: a.facility.type, bookings: 0, revenue: D(0) };
      row.bookings += 1;
      row.revenue = row.revenue.plus(a.quotedAmount);
      usage.set(a.facilityId, row);
    }

    const clients = new Map<string, { id: string; name: string; events: number; revenue: Prisma.Decimal }>();
    for (const b of completed) {
      const id = b.client?.id ?? b.clientName;
      const row = clients.get(id) ?? { id, name: b.client?.name ?? b.clientName, events: 0, revenue: D(0) };
      row.events += 1;
      row.revenue = row.revenue.plus(bookingTotal(b));
      clients.set(id, row);
    }

    res.json({
      range: { start: startStr, end: endStr },
      stats: {
        totalEvents: bookings.length,
        completedEvents: completed.length,
        totalRevenue: completed.reduce((t, b) => t.plus(bookingTotal(b)), D(0)),
        outstanding: live.reduce((t, b) => t.plus(bookingTotal(b)).minus(b.paid), D(0)),
      },
      byStatus: [...statusCount.entries()].map(([status, count]) => ({ status, count })),
      facilityUsage: [...usage.values()].sort((a, b) => b.revenue.comparedTo(a.revenue)),
      topClients: [...clients.values()].sort((a, b) => b.revenue.comparedTo(a.revenue)).slice(0, 5),
    });
  }),
);

/* -------------------- CALENDAR -------------------- */

// GET /calendar
eventsRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { start, end } = monthRange(req.query);
    const facilityId = req.query.facilityId as string | undefined;

    const events = await prisma.eventBooking.findMany({
      where: {
        startsAt: { lt: end },
        endsAt: { gte: start },
        ...(facilityId
          ? {
              OR: [
                { facilityId },
                { facilities: { some: { facilityId } } },
              ],
            }
          : {}),
      },
      include: {
        facility: true,
        client: true,
        facilities: {
          include: { facility: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86_400_000);

    res.json({
      kpis: {
        totalEvents: events.length,
        expectedGuests: events.reduce(
          (total, event) => total + event.expectedGuests,
          0,
        ),
        totalQuoted: events.reduce(
          (total, event) => total.plus(event.quoted),
          D(0),
        ),
        balanceDue: events.reduce(
          (total, event) => total.plus(event.quoted).minus(event.paid),
          D(0),
        ),
        upcoming7d: events.filter(
          (event) =>
            event.status === EventStatus.CONFIRMED &&
            event.startsAt >= now &&
            event.startsAt <= soon,
        ).length,
      },
      events,
    });
  }),
);

async function assertEventAccountsActive(
  tx: Prisma.TransactionClient,
  codes: string[],
) {
  const accounts = await tx.account.findMany({
    where: { code: { in: codes } },
    select: {
      code: true,
      isActive: true,
    },
  });

  const accountMap = new Map(
    accounts.map((account) => [account.code, account.isActive]),
  );

  for (const code of codes) {
    if (!accountMap.has(code)) {
      throw new HttpError(
        500,
        `Required event accounting account ${code} is missing`,
      );
    }

    if (!accountMap.get(code)) {
      throw new HttpError(
        400,
        `Required event accounting account ${code} is inactive`,
      );
    }
  }
}

/* -------------------- EVENT BOOKINGS -------------------- */

// GET /events
eventsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const events = await prisma.eventBooking.findMany({
      include: {
        facility: true,
        client: true,
        facilities: {
          include: { facility: true },
        },
        charges: true,
        payments: true,
      },
      orderBy: { startsAt: 'desc' },
    });

    res.json(events);
  }),
);

// POST /events
// One booking can contain multiple facility assignments.
eventsRouter.post(
  '/',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(eventCreateBody, req.body);

    if (body.clientId) {
      const client = await prisma.eventClient.findUnique({
        where: { id: body.clientId },
      });

      if (!client || !client.isActive) {
        throw new HttpError(404, 'Active event client not found');
      }
    }

    if (body.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: body.groupId },
        select: { id: true },
      });

      if (!group) {
        throw new HttpError(404, 'Linked group not found');
      }
    }

    const userRole = req.user?.role;

    const created = await prisma.$transaction(
      async (tx) => {
        const assignments = await buildEventFacilityAssignments(
          tx,
          body.facilities,
          body.startsAt,
          body.endsAt,
          userRole,
        );

        if (eventActiveStatuses.includes(body.status)) {
          await assertFacilityAvailability(tx, assignments);
        }

        const baseAmount = assignments.reduce(
          (total, assignment) => total.plus(assignment.quotedAmount),
          D(0),
        );

        const totals = calculateEventTotals(baseAmount);

        const primaryFacilityId = assignments[0].facilityId;

        const client = body.clientId
          ? await tx.eventClient.findUnique({
              where: { id: body.clientId },
              select: { name: true, phone: true, isActive: true },
            })
          : null;

        if (body.clientId && (!client || !client.isActive)) {
          throw new HttpError(404, 'Active event client not found');
        }

        const booking = await tx.eventBooking.create({
          data: {
            title: body.title,
            clientId: body.clientId ?? null,
            clientName: client?.name ?? body.clientName!,
            clientPhone: body.clientPhone ?? client?.phone ?? null,
            groupId: body.groupId ?? null,
            facilityId: primaryFacilityId,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            expectedGuests: body.expectedGuests,
            status: body.status,
            notes: body.notes ?? null,
            eventType: body.eventType,
            description: body.description ?? null,
            eventManager: body.eventManager ?? null,
            specialRequirements: body.specialRequirements ?? null,
            quoted: totals.totalAmount,
            paid: D(0),
            ...totals,
            facilities: { create: assignments },
          },
        });

        // Optional deposit: same accounting as POST /events/:id/payments before completion.
        const deposit = D(body.deposit?.amount ?? 0);
        if (deposit.gt(0)) {
          if (deposit.gt(totals.totalAmount)) {
            throw new HttpError(400, 'Deposit cannot exceed the booking total');
          }
          const method = body.deposit!.method!;
          const cashCode = cashAccountFor(method);
          await assertEventAccountsActive(tx, [cashCode, ACC.EVENT_DEPOSITS]);
          const payment = await tx.eventPayment.create({
            data: { eventBookingId: booking.id, type: 'PAYMENT', amount: deposit, method, description: 'Event deposit', createdById: req.user?.id },
          });
          const journal = await postJournal(tx, {
            description: `Event deposit: ${body.title}`,
            reference: `EVENT-PAYMENT-${payment.id}`,
            userId: req.user?.id,
            lines: [{ code: cashCode, debit: deposit }, { code: ACC.EVENT_DEPOSITS, credit: deposit }],
          });
          await tx.eventPayment.update({ where: { id: payment.id }, data: { journalId: journal?.id ?? null } });
          await tx.eventBooking.update({ where: { id: booking.id }, data: { paid: deposit } });
        }

        return tx.eventBooking.findUniqueOrThrow({
          where: { id: booking.id },
          include: { facility: true, client: true, facilities: { include: { facility: true } } },
        });
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    res.status(201).json({ event: created });
  }),
);


// PUT /events/:id
// Update event details and status.
// Revenue is recognized exactly once when an event transitions to COMPLETED.
eventsRouter.put(
  '/:id',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(eventUpdateBody, req.body);

    const updated = await prisma.$transaction(
      async (tx) => {
        // Serialize concurrent updates and completion requests for this event.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "EventBooking"
          WHERE "id" = ${req.params.id}
          FOR UPDATE
        `;

        if (!locked.length) {
          throw new HttpError(404, 'Event booking not found');
        }

        // Always use the latest event state after acquiring the lock.
        const current = await tx.eventBooking.findUnique({
          where: { id: req.params.id },
          include: {
            facilities: {
              include: { facility: true },
            },
            charges: true,
            payments: true,
          },
        });

        if (!current) {
          throw new HttpError(404, 'Event booking not found');
        }

        const nextStartsAt = body.startsAt ?? current.startsAt;
        const nextEndsAt = body.endsAt ?? current.endsAt;
        const nextStatus = body.status ?? current.status;

        if (nextEndsAt <= nextStartsAt) {
          throw new HttpError(
            400,
            'Event end time must be after start time',
          );
        }

        // A completed event cannot be moved backwards in its lifecycle.
        // This prevents recognized revenue from becoming inconsistent.
        if (
          current.status === EventStatus.COMPLETED &&
          nextStatus !== EventStatus.COMPLETED
        ) {
          throw new HttpError(
            400,
            'A completed event cannot be moved to another status',
          );
        }

        if (
          current.status === EventStatus.CANCELLED &&
          nextStatus === EventStatus.COMPLETED
        ) {
          throw new HttpError(
            400,
            'A cancelled event cannot be completed',
          );
        }

        if (body.clientId) {
          const client = await tx.eventClient.findUnique({
            where: { id: body.clientId },
            select: {
              id: true,
              name: true,
              phone: true,
              isActive: true,
            },
          });

          if (!client || !client.isActive) {
            throw new HttpError(404, 'Active event client not found');
          }
        }

        if (body.groupId) {
          const group = await tx.group.findUnique({
            where: { id: body.groupId },
            select: { id: true },
          });

          if (!group) {
            throw new HttpError(404, 'Linked group not found');
          }
        }

        // Lock assigned facilities before validating date/status changes.
        if (current.facilities.length) {
          await lockEventFacilities(
            tx,
            current.facilities.map((item) => item.facilityId),
          );
        }

        if (eventActiveStatuses.includes(nextStatus)) {
          const proposedAssignments = current.facilities.map((item) => ({
            facilityId: item.facilityId,
            startsAt:
              body.startsAt &&
              item.startsAt.getTime() === current.startsAt.getTime()
                ? nextStartsAt
                : item.startsAt,
            endsAt:
              body.endsAt &&
              item.endsAt.getTime() === current.endsAt.getTime()
                ? nextEndsAt
                : item.endsAt,
            setupStartsAt:
              body.startsAt &&
              item.setupStartsAt?.getTime() ===
                current.startsAt.getTime()
                ? nextStartsAt
                : item.setupStartsAt,
            teardownEndsAt:
              body.endsAt &&
              item.teardownEndsAt?.getTime() ===
                current.endsAt.getTime()
                ? nextEndsAt
                : item.teardownEndsAt,
          }));

          await assertFacilityAvailability(
            tx,
            proposedAssignments,
            req.params.id,
          );
        }

        const client = body.clientId
          ? await tx.eventClient.findUnique({
              where: { id: body.clientId },
              select: { name: true, phone: true },
            })
          : null;

        // Recognize revenue only on the first transition to COMPLETED.
        if (
          current.status !== EventStatus.COMPLETED &&
          nextStatus === EventStatus.COMPLETED
        ) {
          const completionReference =
            `EVENT-COMPLETED-${current.id}`;

          // A pre-existing reference must never be posted again.
          const existingCompletionJournal =
            await tx.journalEntry.findFirst({
              where: { reference: completionReference },
              select: { id: true },
            });

          if (existingCompletionJournal) {
            throw new HttpError(
              409,
              'An event completion journal already exists. Please review its accounting records.',
            );
          }

          const baseAmount = D(current.baseAmount);
          const vatAmount = D(current.vatAmount);
          const serviceChargeAmount = D(
            current.serviceChargeAmount,
          );
          const totalAmount = D(current.totalAmount);
          const paidAmount = D(current.paid);

          // Validate the stored financial calculation.
          const calculatedTotal = baseAmount
            .plus(vatAmount)
            .plus(serviceChargeAmount)
            .toDecimalPlaces(2);

          if (!calculatedTotal.equals(totalAmount)) {
            throw new HttpError(
              400,
              'Event financial totals do not reconcile. Review the event quotation before completing it.',
            );
          }

          if (!totalAmount.gt(0)) {
            throw new HttpError(
              400,
              'An event must have a positive total before it can be completed',
            );
          }

          if (paidAmount.lt(0) || paidAmount.gt(totalAmount)) {
            throw new HttpError(
              400,
              'Event payments are outside the permitted total amount',
            );
          }

          // Facility rental is recognized from facility assignments.
          const facilityRentalAmount =
            current.facilities.reduce(
              (sum, item) =>
                sum.plus(D(item.quotedAmount)),
              D(0),
            );

          // EventCharge contains additional charges only.
          // Facility rental must not be duplicated here.
          const facilityRentalCharges = current.charges.filter(
            (charge) => charge.category === 'FACILITY_RENTAL',
          );

          if (facilityRentalCharges.length) {
            throw new HttpError(
              400,
              'Facility rental must be recorded through facility assignments, not additional event charges.',
            );
          }

          const otherEventRevenue =
            current.charges.reduce(
              (sum, charge) =>
                sum.plus(D(charge.amount)),
              D(0),
            );

          const reconciledBaseAmount =
            facilityRentalAmount
              .plus(otherEventRevenue)
              .toDecimalPlaces(2);

          if (!reconciledBaseAmount.equals(baseAmount)) {
            throw new HttpError(
              400,
              'Facility rentals and additional event charges do not match the stored event base amount. Review the event quotation before completing it.',
            );
          }

          // Confirm that the payment/refund records agree with EventBooking.paid.
          const netPayments = current.payments.reduce(
            (sum, payment) => {
              const amount = D(payment.amount);

              return payment.type === 'PAYMENT'
                ? sum.plus(amount)
                : sum.minus(amount);
            },
            D(0),
          );

          if (!netPayments.equals(paidAmount)) {
            throw new HttpError(
              400,
              'Event payment records do not reconcile with the recorded amount paid. Review the payment history before completing this event.',
            );
          }

          const outstandingAmount = totalAmount
            .minus(paidAmount)
            .toDecimalPlaces(2);

          const requiredAccounts = [
            ACC.EVENT_DEPOSITS,
            ACC.EVENT_RECEIVABLES,
            ACC.EVENT_FACILITY_RENTAL_REVENUE,
            ACC.EVENT_REVENUE,
            ACC.VAT_PAYABLE,
            ACC.SERVICE_PAYABLE,
          ];

          await assertEventAccountsActive(
            tx,
            requiredAccounts,
          );

          // Clear deposits already received and recognize
          // the outstanding balance as an event receivable.
          await postJournal(tx, {
            description: `Event revenue recognition - ${current.title}`,
            reference: completionReference,
            lines: [
              {
                code: ACC.EVENT_DEPOSITS,
                debit: paidAmount,
                memo: 'Clear event deposits received',
              },
              {
                code: ACC.EVENT_RECEIVABLES,
                debit: outstandingAmount,
                memo: 'Outstanding event balance',
              },
              {
                code: ACC.EVENT_FACILITY_RENTAL_REVENUE,
                credit: facilityRentalAmount,
                memo: 'Facility rental revenue',
              },
              {
                code: ACC.EVENT_REVENUE,
                credit: otherEventRevenue,
                memo: 'Additional event revenue',
              },
              {
                code: ACC.VAT_PAYABLE,
                credit: vatAmount,
                memo: 'Event VAT payable',
              },
              {
                code: ACC.SERVICE_PAYABLE,
                credit: serviceChargeAmount,
                memo: 'Event service charge payable',
              },
            ],
          });
        }

        return tx.eventBooking.update({
          where: { id: req.params.id },
          data: {
            ...(body.title !== undefined
              ? { title: body.title }
              : {}),
            ...(body.clientId !== undefined
              ? { clientId: body.clientId }
              : {}),
            ...(body.clientName !== undefined
              ? { clientName: body.clientName }
              : client
                ? { clientName: client.name }
                : {}),
            ...(body.clientPhone !== undefined
              ? { clientPhone: body.clientPhone }
              : client
                ? { clientPhone: client.phone }
                : {}),
            ...(body.groupId !== undefined
              ? { groupId: body.groupId }
              : {}),
            ...(body.startsAt !== undefined
              ? { startsAt: body.startsAt }
              : {}),
            ...(body.endsAt !== undefined
              ? { endsAt: body.endsAt }
              : {}),
            ...(body.expectedGuests !== undefined
              ? { expectedGuests: body.expectedGuests }
              : {}),
            ...(body.status !== undefined
              ? { status: body.status }
              : {}),
            ...(body.notes !== undefined
              ? { notes: body.notes }
              : {}),
          },
          include: {
            facility: true,
            client: true,
            facilities: {
              include: { facility: true },
            },
            charges: true,
            payments: true,
          },
        });
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    res.json({ event: updated });
  }),
);


// DELETE /events/:id
eventsRouter.delete(
  '/:id',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.eventBooking.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      throw new HttpError(404, 'Event booking not found');
    }

    await prisma.eventBooking.delete({
      where: { id: req.params.id },
    });

    res.status(204).end();
  }),
);


/* -------------------- EVENT PAYMENTS & REFUNDS -------------------- */

// GET /:id/payments
eventsRouter.get(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const event = await prisma.eventBooking.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!event) {
      throw new HttpError(404, 'Event booking not found');
    }

    const payments = await prisma.eventPayment.findMany({
      where: { eventBookingId: event.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ payments });
  }),
);


// POST /:id/payments
// Before completion: debit cash/bank, credit Event Deposits.
// After completion: debit cash/bank, credit Event Receivables.
eventsRouter.post(
  '/:id/payments',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(eventPaymentBody, req.body);
    const amount = D(body.amount);

    const result = await prisma.$transaction(
      async (tx) => {
        // Serialize payments against event completion and other payments.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "EventBooking"
          WHERE "id" = ${req.params.id}
          FOR UPDATE
        `;

        if (!locked.length) {
          throw new HttpError(404, 'Event booking not found');
        }

        const event = await tx.eventBooking.findUnique({
          where: { id: req.params.id },
        });

        if (!event) {
          throw new HttpError(404, 'Event booking not found');
        }

        if (event.status === EventStatus.CANCELLED) {
          throw new HttpError(
            400,
            'Payments cannot be recorded against a cancelled event',
          );
        }

        const total = D(event.totalAmount).gt(0)
          ? D(event.totalAmount)
          : D(event.quoted);

        const paid = D(event.paid);
        const outstanding = total.minus(paid);

        if (outstanding.lte(0)) {
          throw new HttpError(
            400,
            'This event has no outstanding balance',
          );
        }

        if (amount.gt(outstanding)) {
          throw new HttpError(
            400,
            `Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
          );
        }

        const cashCode = cashAccountFor(body.method);

        let destinationCode: string;

        if (event.status === EventStatus.COMPLETED) {
          // Do not credit receivables unless the completion journal
          // actually recognized this event's revenue and receivable.
          const completionJournal =
            await tx.journalEntry.findFirst({
              where: {
                reference: `EVENT-COMPLETED-${event.id}`,
              },
              select: { id: true },
            });

          if (!completionJournal) {
            throw new HttpError(
              409,
              'This completed event has no completion accounting journal. Please have an accountant review it before recording another payment.',
            );
          }

          destinationCode = ACC.EVENT_RECEIVABLES;
        } else {
          destinationCode = ACC.EVENT_DEPOSITS;
        }

        await assertEventAccountsActive(tx, [
          cashCode,
          destinationCode,
        ]);

        const payment = await tx.eventPayment.create({
          data: {
            eventBookingId: event.id,
            type: 'PAYMENT',
            amount,
            method: body.method,
            reference: body.reference || null,
            description: body.description || 'Event payment received',
            createdById: req.user?.id,
          },
        });

        const journal = await postJournal(tx, {
          description: `Event payment: ${event.title}`,
          reference: `EVENT-PAYMENT-${payment.id}`,
          userId: req.user?.id,
          lines: [
            {
              code: cashCode,
              debit: amount,
            },
            {
              code: destinationCode,
              credit: amount,
            },
          ],
        });

        await tx.eventPayment.update({
          where: { id: payment.id },
          data: { journalId: journal?.id ?? null },
        });

        const updatedEvent = await tx.eventBooking.update({
          where: { id: event.id },
          data: {
            paid: paid.plus(amount),
          },
        });

        return {
          payment: {
            ...payment,
            journalId: journal?.id ?? null,
          },
          event: updatedEvent,
          balanceDue: total.minus(updatedEvent.paid),
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    res.status(201).json(result);
  }),
);



// POST /:id/refunds
// Before completion: debit Event Deposits, credit cash/bank.
// After completion: issue a proportional credit note against facility
// revenue, other event revenue, VAT and service charge.
eventsRouter.post(
  '/:id/refunds',
  requireRole('MANAGER'),
  asyncHandler(async (req, res) => {
    const body = parse(eventRefundBody, req.body);
    const amount = D(body.amount);

    if (!amount.gt(0)) {
      throw new HttpError(400, 'Refund amount must be greater than zero');
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // Serialize payments and refunds for this event.
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "EventBooking"
          WHERE "id" = ${req.params.id}
          FOR UPDATE
        `;

        const event = await tx.eventBooking.findUnique({
          where: { id: req.params.id },
          include: {
            facilities: true,
            charges: true,
          },
        });

        if (!event) {
          throw new HttpError(404, 'Event booking not found');
        }

        const paid = D(event.paid);

        // The event's paid field represents net payments after refunds.
        if (amount.gt(paid)) {
          throw new HttpError(
            400,
            `Refund exceeds the net amount paid of ${paid.toFixed(2)}`,
          );
        }

        const previousRefunds = await tx.eventPayment.aggregate({
          where: {
            eventBookingId: event.id,
            type: 'REFUND',
          },
          _sum: {
            amount: true,
            facilityRentalRefund: true,
            otherRevenueRefund: true,
            vatRefund: true,
            serviceChargeRefund: true,
          },
        });

        const previousFacilityRentalRefund = D(
          previousRefunds._sum.facilityRentalRefund ?? 0,
        );

        const previousOtherRevenueRefund = D(
          previousRefunds._sum.otherRevenueRefund ?? 0,
        );

        const previousVatRefund = D(
          previousRefunds._sum.vatRefund ?? 0,
        );

        const previousServiceChargeRefund = D(
          previousRefunds._sum.serviceChargeRefund ?? 0,
        );

        const totalRefunded = D(previousRefunds._sum.amount ?? 0);

        const cashCode = cashAccountFor(body.method);

        const refund = await tx.eventPayment.create({
          data: {
            eventBookingId: event.id,
            type: 'REFUND',
            amount,
            method: body.method,
            reference: body.reference || null,
            description: 'Event refund',
            reason: body.reason,
            createdById: req.user?.id,
          },
        });

        let journalLines: Array<{
          code: string;
          debit?: Prisma.Decimal;
          credit?: Prisma.Decimal;
        }>;

        let accountCodes: string[];

        // Revenue/tax allocation for this refund. Declared here so the final
        // database update can persist it. Stays zero for pre-completion refunds.
        const refundParts: Record<string, Prisma.Decimal> = {
          facilityRental: D(0),
          otherRevenue: D(0),
          vat: D(0),
          serviceCharge: D(0),
        };

        if (event.status === EventStatus.COMPLETED) {
          // A completed event must already have its revenue-recognition journal.
          const completionJournal = await tx.journalEntry.findFirst({
            where: {
              reference: `EVENT-COMPLETED-${event.id}`,
            },
            select: { id: true },
          });

          if (!completionJournal) {
            throw new HttpError(
              409,
              'This completed event has no completion accounting journal. Please have an accountant review it before issuing a refund.',
            );
          }

          const baseAmount = D(event.baseAmount);
          const vatAmount = D(event.vatAmount);
          const serviceChargeAmount = D(event.serviceChargeAmount);
          const totalAmount = D(event.totalAmount);

          if (
            !totalAmount.gt(0) ||
            !baseAmount.plus(vatAmount).plus(serviceChargeAmount).eq(totalAmount)
          ) {
            throw new HttpError(
              409,
              'The completed event financial totals are inconsistent. Please have an accountant review the event before issuing a refund.',
            );
          }

          if (amount.gt(totalAmount)) {
            throw new HttpError(
              400,
              `Refund exceeds the remaining event value of ${totalAmount.toFixed(2)}`,
            );
          }

          // Original facility and extra-charge values are retained for audit.
          // Subtract all previously issued credit-note allocations to obtain
          // the remaining refundable revenue components.
          const originalFacilityRental = event.facilities.reduce(
            (sum, assignment) =>
              sum.plus(D(assignment.quotedAmount)),
            D(0),
          );

          const originalOtherRevenue = event.charges.reduce(
            (sum, charge) =>
              sum.plus(D(charge.amount)),
            D(0),
          );

          const hasDuplicateFacilityRental = event.charges.some(
            (charge) => charge.category === 'FACILITY_RENTAL',
          );

          if (hasDuplicateFacilityRental) {
            throw new HttpError(
              409,
              'This event contains a duplicate facility-rental charge. Please have an accountant review it before issuing a refund.',
            );
          }

          const facilityRental = originalFacilityRental.minus(
            previousFacilityRentalRefund,
          );

          const otherRevenue = originalOtherRevenue.minus(
            previousOtherRevenueRefund,
          );

          // VAT and service charge are already reduced in EventBooking
          // after each completed-event credit note.
          const remainingVat = vatAmount;
          const remainingServiceCharge = serviceChargeAmount;

          if (
            facilityRental.lt(0) ||
            otherRevenue.lt(0) ||
            !facilityRental.plus(otherRevenue).eq(baseAmount)
          ) {
            throw new HttpError(
              409,
              'The remaining facility rental and additional revenue do not reconcile with the event base amount. Please have an accountant review it before issuing a refund.',
            );
          }

          const remainingComponents = [
            { key: 'facilityRental', value: facilityRental },
            { key: 'otherRevenue', value: otherRevenue },
            { key: 'vat', value: remainingVat },
            { key: 'serviceCharge', value: remainingServiceCharge },
          ];

          if (
            remainingComponents.some((component) => component.value.lt(0)) ||
            !remainingComponents
              .reduce((sum, component) => sum.plus(component.value), D(0))
              .eq(totalAmount)
          ) {
            throw new HttpError(
              409,
              'The remaining refundable event components do not reconcile with the event total. Please have an accountant review the event.',
            );
          }

          const components = remainingComponents.filter(
            (component) => component.value.gt(0),
          );

          if (components.length === 0) {
            throw new HttpError(
              409,
              'There are no refundable event financial components.',
            );
          }

          // Allocate the gross refund proportionately across the remaining
          // components. The final component absorbs any rounding remainder.
          let allocated = D(0);

          components.forEach((component, index) => {
            const componentRefund =
              index === components.length - 1
                ? amount.minus(allocated)
                : amount
                    .mul(component.value)
                    .div(totalAmount)
                    .toDecimalPlaces(2);

            if (
              componentRefund.lt(0) ||
              componentRefund.gt(component.value)
            ) {
              throw new HttpError(
                409,
                'The requested refund cannot be allocated safely across the remaining event components.',
              );
            }

            refundParts[component.key] = componentRefund;
            allocated = allocated.plus(componentRefund);
          });

          if (!allocated.eq(amount)) {
            throw new HttpError(
              409,
              'The refund allocations do not equal the requested refund amount.',
            );
          }

          journalLines = [];

          if (refundParts.facilityRental.gt(0)) {
            journalLines.push({
              code: ACC.EVENT_FACILITY_RENTAL_REVENUE,
              debit: refundParts.facilityRental,
            });
          }

          if (refundParts.otherRevenue.gt(0)) {
            journalLines.push({
              code: ACC.EVENT_REVENUE,
              debit: refundParts.otherRevenue,
            });
          }

          if (refundParts.vat.gt(0)) {
            journalLines.push({
              code: ACC.VAT_PAYABLE,
              debit: refundParts.vat,
            });
          }

          if (refundParts.serviceCharge.gt(0)) {
            journalLines.push({
              code: ACC.SERVICE_PAYABLE,
              debit: refundParts.serviceCharge,
            });
          }

          journalLines.push({
            code: cashCode,
            credit: amount,
          });

          accountCodes = [
            cashCode,
            ...journalLines
              .filter((line) => line.code !== cashCode)
              .map((line) => line.code),
          ];
        } else {
          // Before completion, received money is still held in Event Deposits.
          journalLines = [
            {
              code: ACC.EVENT_DEPOSITS,
              debit: amount,
            },
            {
              code: cashCode,
              credit: amount,
            },
          ];

          accountCodes = [
            ACC.EVENT_DEPOSITS,
            cashCode,
          ];
        }

        await assertEventAccountsActive(tx, accountCodes);

        const journal = await postJournal(tx, {
          description: `Event refund: ${event.title}`,
          reference: `EVENT-REFUND-${refund.id}`,
          userId: req.user?.id,
          lines: journalLines,
        });

        const updatedRefund = await tx.eventPayment.update({
          where: { id: refund.id },
          data: {
            journalId: journal?.id ?? null,

            // Only completed-event refunds receive revenue/tax allocations.
            facilityRentalRefund: refundParts.facilityRental,
            otherRevenueRefund: refundParts.otherRevenue,
            vatRefund: refundParts.vat,
            serviceChargeRefund: refundParts.serviceCharge,
          },
        });

        const isCompleted = event.status === EventStatus.COMPLETED;

        const updatedEvent = await tx.eventBooking.update({
          where: { id: event.id },
          data: {
            paid: paid.minus(amount),

            ...(isCompleted
              ? {
                  baseAmount: D(event.baseAmount)
                    .minus(refundParts.facilityRental)
                    .minus(refundParts.otherRevenue),

                  vatAmount: D(event.vatAmount)
                    .minus(refundParts.vat),

                  serviceChargeAmount: D(event.serviceChargeAmount)
                    .minus(refundParts.serviceCharge),

                  totalAmount: D(event.totalAmount)
                    .minus(amount),

                  quoted: D(event.quoted)
                    .minus(amount),
                }
              : {}),
          },
        });

        const updatedTotal = D(updatedEvent.totalAmount).gt(0)
          ? D(updatedEvent.totalAmount)
          : D(updatedEvent.quoted);

        const updatedTotalRefunded = totalRefunded.plus(amount);

        return {
          refund: updatedRefund,
          event: updatedEvent,
          totalRefunded: updatedTotalRefunded,
          balanceDue: updatedTotal.minus(updatedEvent.paid),
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    res.status(201).json(result);
  }),
);


// ─────────────────────────────────────────────
// RESERVATIONS
// ─────────────────────────────────────────────

export const reservationsRouter = Router();

// ───── Reservation calendar ─────

reservationsRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { start, end } = monthRange(req.query);

    const [totalRooms, reservations] = await Promise.all([
      prisma.room.count(),

      prisma.reservation.findMany({
        where: {
          status: {
            in: ['PENDING', 'CONFIRMED'],
          },
          arrival: {
            lt: end,
          },
          departure: {
            gt: start,
          },
        },
        include: {
          guest: true,
          room: true,
        },
      }),
    ]);

    const days: {
      date: string;
      reserved: number;
      items: typeof reservations;
    }[] = [];

    let peak = 0;

    for (
      let date = new Date(start);
      date < end;
      date.setDate(date.getDate() + 1)
    ) {
      const items = reservations.filter(
        (reservation) =>
          reservation.arrival <= date &&
          reservation.departure > date,
      );

      peak = Math.max(peak, items.length);

      days.push({
        date: date.toISOString().slice(0, 10),
        reserved: items.length,
        items,
      });
    }

    res.json({
      kpis: {
        totalReservations: reservations.length,
        totalRooms,
        peakOccupancy: peak,
        availability: totalRooms - peak,
      },
      days,
    });
  }),
);

// ───── Basic reservation validation ─────
const rBody = z
  .object({
    guestId: z.string(),
    roomId: z.string(),
    groupId: z.string().optional(),
    arrival: z.coerce.date(),
    departure: z.coerce.date(),
    numberOfGuests: z.coerce.number().int().min(1).default(1),
    deposit: z.coerce.number().min(0).default(0),
    paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']).optional(),
    guaranteeType: z.enum(GUARANTEE_TYPES).default('Deposit'),
    specialRequests: z.string().trim().optional(),
    notes: z.string().optional(),
  })
  .refine((b) => b.deposit <= 0 || Boolean(b.paymentMethod), {
    message: 'Select the actual payment method for the reservation deposit',
    path: ['paymentMethod'],
  });

// ───── Reservations that can be checked in (used by the Check-in page) ─────
reservationsRouter.get(
  '/for-check-in',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (_req, res) => {
    // Window is deliberately generous; the page does the exact "arrives today or earlier, leaves after today" filter.
    const rows = await prisma.reservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        arrival: { lt: new Date(Date.now() + 2 * 86_400_000) },
        departure: { gt: new Date(Date.now() - 86_400_000) },
      },
      include: { guest: true, room: { include: { roomType: true } } },
      orderBy: { arrival: 'asc' },
    });
    res.json(rows);
  }),
);
// ───── Available rooms for a date range ─────

reservationsRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const query = parse(
      z.object({
        arrival: z.coerce.date(),
        departure: z.coerce.date(),
      }),
      req.query,
    );

    if (query.departure <= query.arrival) {
      throw new HttpError(
        400,
        'Departure must be after arrival',
      );
    }

    const [rooms, reservations, stays] = await Promise.all([
      prisma.room.findMany({
        include: {
          roomType: true,
        },
        orderBy: {
          number: 'asc',
        },
      }),

      prisma.reservation.findMany({
        where: {
          status: {
            in: ['PENDING', 'CONFIRMED'],
          },
          arrival: {
            lt: query.departure,
          },
          departure: {
            gt: query.arrival,
          },
        },
        select: {
          roomId: true,
        },
      }),

      prisma.stay.findMany({
        where: {
          status: 'CHECKED_IN',
          checkOutAt: null,
          checkInAt: {
            lt: query.departure,
          },
          expectedDeparture: {
            gt: query.arrival,
          },
        },
        select: {
          roomId: true,
        },
      }),
    ]);

    const busy = new Set([
      ...reservations,
      ...stays,
    ].map((item) => item.roomId));

    res.json(
      rooms
        .filter((room) => !busy.has(room.id))
        .map((room) => ({
          id: room.id,
          number: room.number,
          floor: room.floor,
          type: room.roomType.name,
          capacity: room.roomType.capacity,
          nightlyRate: Number(
            room.rateOverride ?? room.roomType.nightlyRate,
          ),
        })),
    );
  }),
);

// ───── New reservation form ─────
// Supports:
// - Existing guest selection or new guest registration
// - Guest address and identity details
// - Multiple rooms
// - Optional group association
// - Guest count
// - Estimated reservation total
// - Deposit and payment method
// - Guarantee type
// - Special requests and internal notes

const formBody = z
  .object({
    guestId: z.string().optional(),

    guest: z
      .object({
        firstName: z.string().trim().min(1),
        lastName: z.string().trim().min(1),
        phone: z.string().trim().min(5),
        email: z
          .string()
          .trim()
          .email()
          .optional()
          .or(z.literal('')),
        address: z.string().trim().optional(),
        idType: z.string().trim().optional(),
        idNumber: z.string().trim().optional(),
        nationality: z.string().trim().optional(),
      })
      .optional(),

    roomIds: z
      .array(z.string())
      .min(1, 'Select at least one room'),

    groupId: z.string().optional(),

    arrival: z.coerce.date(),
    departure: z.coerce.date(),

    numberOfGuests: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    deposit: z.coerce
      .number()
      .min(0)
      .default(0),

    paymentMethod: z
      .enum(['CASH', 'CARD', 'TRANSFER'])
      .optional(),

    guaranteeType: z.enum(GUARANTEE_TYPES).default('Deposit'),

    specialRequests: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine(
    (body) => Boolean(body.guestId || body.guest),
    {
      message:
        'Select an existing guest or enter new guest details',
    },
  )
  .refine(
    (body) => body.deposit <= 0 || Boolean(body.paymentMethod),
    {
      message:
        'Select the actual payment method for the reservation deposit',
      path: ['paymentMethod'],
    },
  );

reservationsRouter.post(
  '/form',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(formBody, req.body);

    // Validate reservation dates.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (body.arrival < today) {
      throw new HttpError(
        400,
        'Arrival date cannot be in the past',
      );
    }

    if (body.departure <= body.arrival) {
      throw new HttpError(
        400,
        'Departure must be after arrival',
      );
    }

    // Remove duplicate room IDs and sort them consistently.
    const roomIds = [...new Set(body.roomIds)].sort();

    if (roomIds.length !== body.roomIds.length) {
      throw new HttpError(
        400,
        'Duplicate room selections are not allowed',
      );
    }

    const nights = Math.round(
      (body.departure.getTime() - body.arrival.getTime()) /
        86_400_000,
    );

    // Resolve the guest before starting the room transaction.
    let existingGuest: Awaited<
      ReturnType<typeof prisma.guest.findUnique>
    > = null;

    if (body.guestId) {
      existingGuest = await prisma.guest.findUnique({
        where: {
          id: body.guestId,
        },
      });

      if (!existingGuest) {
        throw new HttpError(
          404,
          'Selected guest was not found',
        );
      }
    } else if (body.guest) {
      existingGuest = await prisma.guest.findFirst({
        where: {
          phone: body.guest.phone,
        },
      });
    }

    // Check the selected or matched guest against the blacklist.
    if (existingGuest) {
      await assertNotBlacklisted(
        prisma,
        {
          guestId: existingGuest.id,
        },
        req.user!.id,
      );
    } else if (body.guest) {
      await assertNotBlacklisted(
        prisma,
        {
          phone: body.guest.phone,
          idNumber: body.guest.idNumber,
          email: body.guest.email || undefined,
        },
        req.user!.id,
      );
    }

    const confirmed = shouldConfirm(body.deposit, body.guaranteeType);

    const created = await prisma.$transaction(
      async (tx) => {
        // Lock rooms in a stable order to prevent concurrent
        // booking requests from reserving the same rooms.
        for (const roomId of roomIds) {
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${roomId})::bigint
            )::text AS lock_result
          `;
        }

        // Confirm that all selected rooms exist.
        const rooms = await tx.room.findMany({
          where: {
            id: {
              in: roomIds,
            },
          },
          include: {
            roomType: true,
          },
        });

        if (rooms.length !== roomIds.length) {
          throw new HttpError(
            400,
            'One or more selected rooms do not exist',
          );
        }

        // Check for overlapping pending or confirmed reservations.
        const reservationClash =
          await tx.reservation.findFirst({
            where: {
              roomId: {
                in: roomIds,
              },
              status: {
                in: ['PENDING', 'CONFIRMED'],
              },
              arrival: {
                lt: body.departure,
              },
              departure: {
                gt: body.arrival,
              },
            },
            include: {
              room: {
                select: {
                  number: true,
                },
              },
            },
          });

        if (reservationClash) {
          throw new HttpError(
            409,
            `Room ${reservationClash.room.number} is already reserved for those dates`,
          );
        }

        // Check for rooms currently occupied by checked-in guests.
        const stayClash = await tx.stay.findFirst({
          where: {
            roomId: {
              in: roomIds,
            },
            status: 'CHECKED_IN',
            checkOutAt: null,
            checkInAt: {
              lt: body.departure,
            },
            expectedDeparture: {
              gt: body.arrival,
            },
          },
          include: {
            room: {
              select: {
                number: true,
              },
            },
          },
        });

        if (stayClash) {
          throw new HttpError(
            409,
            `Room ${stayClash.room.number} is occupied during those dates`,
          );
        }

        // Validate the optional group.
        let validatedGroupId: string | null = null;

        if (body.groupId) {
          const group = await tx.group.findUnique({
            where: {
              id: body.groupId,
            },
            select: {
              id: true,
            },
          });

          if (!group) {
            throw new HttpError(
              404,
              'Selected group was not found',
            );
          }

          validatedGroupId = group.id;
        }

        if (body.guaranteeType === 'Company Account' && !validatedGroupId) {
          throw new HttpError(400, 'Select a group to use a Company Account guarantee');
        }

        // Reuse the existing guest or create a new guest record.
        const guest =
          existingGuest ??
          (await tx.guest.create({
            data: {
              firstName: body.guest!.firstName,
              lastName: body.guest!.lastName,
              phone: body.guest!.phone,
              email: body.guest!.email || null,
              address: body.guest!.address || null,
              idType: body.guest!.idType || null,
              idNumber: body.guest!.idNumber || null,
              nationality: body.guest!.nationality || null,
            },
          }));

        const roomById = new Map(
          rooms.map((room) => [room.id, room]),
        );

        // Calculate the total using the actual room rates.
        const estimatedTotal = rooms.reduce(
          (total, room) => {
            const nightlyRate = Number(
              room.rateOverride ??
                room.roomType.nightlyRate,
            );

            return total + nightlyRate * nights;
          },
          0,
        );

        if (body.deposit > estimatedTotal) {
          throw new HttpError(
            400,
            'Deposit cannot exceed the estimated reservation total',
          );
        }

        const rows: Array<
          Awaited<ReturnType<typeof tx.reservation.create>>
        > = [];

        // Create one reservation for each selected room.
        for (const [index, roomId] of roomIds.entries()) {
          const room = roomById.get(roomId);

          if (!room) {
            throw new HttpError(
              400,
              'A selected room could not be found',
            );
          }

          const nightlyRate = Number(
            room.rateOverride ??
              room.roomType.nightlyRate,
          );

          const roomTotal = nightlyRate * nights;

          // Record the deposit once, against the first room.
          const roomDeposit =
            index === 0 ? body.deposit : 0;

          const reservation = await tx.reservation.create({
            data: {
              reservationNumber: generateReservationNumber(),
              guestId: guest.id,
              roomId,
              groupId: validatedGroupId,
              arrival: body.arrival,
              departure: body.departure,
              numberOfGuests: body.numberOfGuests,
              deposit: roomDeposit,
              estimatedTotal: roomTotal,
              paymentMethod: body.paymentMethod ?? null,
              guaranteeType: body.guaranteeType,
              specialRequests: body.specialRequests,
              notes: body.notes,
              status: confirmed ? 'CONFIRMED' : 'PENDING',
            },
          });

          // Save the initial deposit with its actual payment method.
          if (roomDeposit > 0) {
            await tx.reservationPayment.create({
              data: {
                reservationId: reservation.id,
                amount: roomDeposit,
                description: 'Reservation deposit',
                method: body.paymentMethod!,
              },
            });
          }

          rows.push(reservation);
        }

        return rows;
      },
    );

    // Send confirmation notifications after the transaction succeeds.
    if (confirmed) {
      for (const reservation of created) {
        void onReservationConfirmed(reservation.id);
      }
    }

    res.status(201).json(created);
  }),
);

// ───── Create a single reservation ─────

reservationsRouter.post(
  '/',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(rBody, req.body);

    if (body.departure <= body.arrival) {
      return res.status(400).json({ message: 'Departure must be after arrival' });
    }

    await assertNotBlacklisted(prisma, { guestId: body.guestId }, req.user!.id);

    const confirmed = shouldConfirm(body.deposit, body.guaranteeType);

    const reservation = await prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(hashtext(${body.roomId})::bigint)::text AS lock_result
          `;

          const room = await tx.room.findUnique({
            where: { id: body.roomId },
            include: { roomType: true },
          });
          if (!room) throw new HttpError(400, 'Select a valid room');

          let groupId: string | null = null;
          if (body.groupId) {
            const group = await tx.group.findUnique({ where: { id: body.groupId }, select: { id: true } });
            if (!group) throw new HttpError(404, 'Selected group was not found');
            groupId = group.id;
          }
          if (body.guaranteeType === 'Company Account' && !groupId) {
            throw new HttpError(400, 'Select a group to use a Company Account guarantee');
          }

          const nights = Math.max(1, Math.round((body.departure.getTime() - body.arrival.getTime()) / 86_400_000));
          const estimatedTotal = Number(room.rateOverride ?? room.roomType.nightlyRate) * nights;

          if (body.deposit > estimatedTotal) {
            throw new HttpError(400, 'Deposit cannot exceed the estimated reservation total');
          }

          const reservationClash = await tx.reservation.findFirst({
            where: {
              roomId: body.roomId,
              status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
              arrival: { lt: body.departure },
              departure: { gt: body.arrival },
            },
            select: { id: true },
          });
          if (reservationClash) throw new Error('ROOM_RESERVATION_CONFLICT');

          const stayClash = await tx.stay.findFirst({
            where: {
              roomId: body.roomId,
              status: 'CHECKED_IN',
              checkOutAt: null,
              checkInAt: { lt: body.departure },
              expectedDeparture: { gt: body.arrival },
            },
            select: { id: true },
          });
          if (stayClash) throw new Error('ROOM_STAY_CONFLICT');

          return tx.reservation.create({
            data: {
              reservationNumber: generateReservationNumber(),
              guestId: body.guestId,
              roomId: body.roomId,
              groupId,
              arrival: body.arrival,
              departure: body.departure,
              numberOfGuests: body.numberOfGuests,
              estimatedTotal,
              deposit: body.deposit,
              paymentMethod: body.paymentMethod ?? null,
              guaranteeType: body.guaranteeType,
              specialRequests: body.specialRequests || null,
              notes: body.notes,
              status: confirmed ? 'CONFIRMED' : 'PENDING',
              ...(body.deposit > 0
                ? {
                    payments: {
                      create: {
                        amount: D(body.deposit),
                        description: 'Reservation deposit',
                        method: body.paymentMethod!,
                      },
                    },
                  }
                : {}),
            },
          });
        },
        { maxWait: 10_000, timeout: 15_000 },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          (error.message === 'ROOM_RESERVATION_CONFLICT' || error.message === 'ROOM_STAY_CONFLICT')
        ) {
          return null;
        }
        throw error;
      });

    if (!reservation) {
      return res.status(409).json({ message: 'That room is unavailable for the requested dates.' });
    }

    if (confirmed) void onReservationConfirmed(reservation.id);

    return res.status(201).json(reservation);
  }),
);


// ───── Get reservation details by ID ─────

reservationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const reservation = await prisma.reservation.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        guest: true,
        room: {
          include: {
            roomType: true,
          },
        },
        group: true,
        payments: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!reservation) {
      throw new HttpError(404, 'Reservation not found');
    }

    const paymentRecords = reservation.payments;

    // Use payment records when available. Preserve legacy deposits
    // for older reservations that do not have payment records.
    const paidAmount =
      paymentRecords.length > 0
        ? paymentRecords.reduce(
            (total, payment) => total + Number(payment.amount),
            0,
          )
        : Number(reservation.deposit);

    const estimatedTotal = Number(reservation.estimatedTotal);

    const nights = Math.max(
      1,
      Math.ceil(
        (reservation.departure.getTime() -
          reservation.arrival.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    return res.json({
      id: reservation.id,
      reservationNumber: reservation.reservationNumber,
      createdAt: reservation.createdAt,
      status: reservation.status,

      guest: {
        name: `${reservation.guest.firstName} ${reservation.guest.lastName}`.trim(),
        phone: reservation.guest.phone,
        email: reservation.guest.email,
        idNumber: reservation.guest.idNumber,
      },

      room: {
        id: reservation.room.id,
        number: reservation.room.number,
        type: reservation.room.roomType.name,
        pricePerNight: Number(
          reservation.room.rateOverride ??
            reservation.room.roomType.nightlyRate,
        ),
      },

      group: reservation.group
        ? {
            id: reservation.group.id,
            name: reservation.group.name,
          }
        : null,

      checkIn: reservation.arrival,
      checkOut: reservation.departure,
      nights,
      numberOfGuests: reservation.numberOfGuests,

      estimatedTotal,
      paidAmount,
      balanceDue: Math.max(0, estimatedTotal - paidAmount),

      paymentMethod: reservation.paymentMethod,
      guaranteeType: reservation.guaranteeType,
      specialRequests: reservation.specialRequests,

      payments: paymentRecords.map((payment) => ({
        id: payment.id,
        date: payment.createdAt,
        description: payment.description,
        amount: Number(payment.amount),
        method: payment.method,
      })),
    });
  }),
);

// ───── Check in a reservation ─────

reservationsRouter.post(
  '/:id/check-in',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const reservation = await prisma.reservation.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!reservation) {
      throw new HttpError(404, 'Reservation not found');
    }

    // Reuse the existing hotel check-in workflow.
    const paymentMethod =
      reservation.paymentMethod === 'CASH' ||
      reservation.paymentMethod === 'CARD' ||
      reservation.paymentMethod === 'TRANSFER'
        ? reservation.paymentMethod
        : undefined;

    await checkIn(
      {
        reservationId: reservation.id,
        guestId: reservation.guestId,
        roomId: reservation.roomId,
        groupId: reservation.groupId ?? undefined,
        numGuests: reservation.numberOfGuests,
        expectedDeparture: reservation.departure,

        discountType: 'NONE',
        discountValue: 0,

        isComplimentary: false,
        applyVat: false,
        applyServiceCharge: false,
        advancePayment: 0,

        paymentMethod,
        specialRequests:
          reservation.specialRequests ?? undefined,
      },
      req.user!.id,
      req.user!.role,
    );

    // Return the updated reservation in the format
    // expected by ReservationDetail and ReservationList.
    const updated = await prisma.reservation.findUnique({
      where: {
        id: reservation.id,
      },
      include: {
        guest: true,
        room: {
          include: {
            roomType: true,
          },
        },
        group: true,
        payments: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!updated) {
      throw new HttpError(
        404,
        'Reservation not found after check-in',
      );
    }

    const paymentRecords = updated.payments;

    const paidAmount =
      paymentRecords.length > 0
        ? paymentRecords.reduce(
            (total, payment) =>
              total + Number(payment.amount),
            0,
          )
        : Number(updated.deposit);

    const estimatedTotal = Number(updated.estimatedTotal);

    const nights = Math.max(
      1,
      Math.ceil(
        (updated.departure.getTime() -
          updated.arrival.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    return res.status(201).json({
      id: updated.id,
      reservationNumber: updated.reservationNumber,
      createdAt: updated.createdAt,
      status: updated.status,

      guest: {
        name: `${updated.guest.firstName} ${updated.guest.lastName}`.trim(),
        phone: updated.guest.phone,
        email: updated.guest.email,
        idNumber: updated.guest.idNumber,
      },

      room: {
        id: updated.room.id,
        number: updated.room.number,
        type: updated.room.roomType.name,
        pricePerNight: Number(
          updated.room.rateOverride ??
            updated.room.roomType.nightlyRate,
        ),
      },

      group: updated.group
        ? {
            id: updated.group.id,
            name: updated.group.name,
          }
        : null,

      checkIn: updated.arrival,
      checkOut: updated.departure,
      nights,
      numberOfGuests: updated.numberOfGuests,

      estimatedTotal,
      paidAmount,
      balanceDue: Math.max(
        0,
        estimatedTotal - paidAmount,
      ),

      paymentMethod: updated.paymentMethod,
      guaranteeType: updated.guaranteeType,
      specialRequests: updated.specialRequests,

      payments: paymentRecords.map((payment) => ({
        id: payment.id,
        date: payment.createdAt,
        description: payment.description,
        amount: Number(payment.amount),
        method: payment.method,
      })),
    });
  }),
);

// ───── Edit confirmed reservation ─────

const reservationEditBody = z.object({
  roomId: z.string().min(1),
  groupId: z.string().nullable().optional(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  numberOfGuests: z.coerce.number().int().min(1),
  paymentMethod: z.string().min(1),
  guaranteeType: z.string().min(1),
  specialRequests: z.string().optional(),
});

reservationsRouter.put(
  '/:id',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(reservationEditBody, req.body);

    if (body.checkOut <= body.checkIn) {
      throw new HttpError(
        400,
        'Check-out must be after check-in',
      );
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Reservation not found');
    }

    if (existing.status !== 'CONFIRMED' && existing.status !== 'PENDING') {
      throw new HttpError(409, 'Only pending or confirmed reservations can be edited');
    }

    const room = await prisma.room.findUnique({
      where: { id: body.roomId },
      include: { roomType: true },
    });

    if (!room) {
      throw new HttpError(400, 'Please select a valid room');
    }

    if (body.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: body.groupId },
        select: { id: true },
      });

      if (!group) {
        throw new HttpError(400, 'Selected group was not found');
      }
    }

    // Prevent assigning a room that is already reserved
    // for an overlapping period by another reservation.
    const clash = await prisma.reservation.findFirst({
      where: {
        id: { not: existing.id },
        roomId: body.roomId,
        status: {
          in: ['CONFIRMED', 'CHECKED_IN'],
        },
        arrival: { lt: body.checkOut },
        departure: { gt: body.checkIn },
      },
      select: {
        id: true,
      },
    });

    if (clash) {
      throw new HttpError(
        409,
        `Room ${room.number} is already booked for those dates`,
      );
    }

    const nights = Math.max(
      1,
      Math.ceil(
        (body.checkOut.getTime() - body.checkIn.getTime()) /
          86_400_000,
      ),
    );

    const nightlyRate = Number(
      room.rateOverride ?? room.roomType.nightlyRate,
    );

    const updated = await prisma.reservation.update({
      where: { id: existing.id },
      data: {
        roomId: body.roomId,
        groupId: body.groupId || null,
        arrival: body.checkIn,
        departure: body.checkOut,
        numberOfGuests: body.numberOfGuests,
        estimatedTotal: nightlyRate * nights,
        paymentMethod: body.paymentMethod,
        guaranteeType: body.guaranteeType,
        specialRequests: body.specialRequests?.trim() || null,
      },
    });

    res.json({
      id: updated.id,
      message: 'Reservation updated successfully',
    });
  }),
);


// ───── List reservations ─────

reservationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? 'ALL').toUpperCase();
    const search = String(req.query.q ?? '').trim();

    const validStatuses = [
      'PENDING',
      'CONFIRMED',
      'CHECKED_IN',
      'CHECKED_OUT',
      'CANCELLED',
      'NO_SHOW',
    ] as const;

    if (
      status !== 'ALL' &&
      !validStatuses.includes(status as (typeof validStatuses)[number])
    ) {
      throw new HttpError(400, 'Invalid reservation status');
    }

    // Search across reservation number, guest details and room number.
    const searchWhere = search
      ? {
          OR: [
            {
              reservationNumber: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              guest: {
                is: {
                  OR: [
                    {
                      firstName: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      lastName: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      phone: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              },
            },
            {
              room: {
                is: {
                  number: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            },
          ],
        }
      : {};

    // Fetch matching reservations before applying the selected status.
    // This allows the status counts to remain accurate across filters.
    const reservations = await prisma.reservation.findMany({
      where: searchWhere,
      include: {
        guest: true,
        room: {
          include: {
            roomType: true,
          },
        },
        group: true,
        payments: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        arrival: 'asc',
      },
    });

    // Calculate status counts using all search-matching reservations.
    const counts = {
      all: reservations.length,
      pending: 0,
      confirmed: 0,
      checkedIn: 0,
      cancelled: 0,
    };

    for (const reservation of reservations) {
      if (reservation.status === 'PENDING') {
        counts.pending++;
      }

      if (reservation.status === 'CONFIRMED') {
        counts.confirmed++;
      }

      if (reservation.status === 'CHECKED_IN') {
        counts.checkedIn++;
      }

      if (reservation.status === 'CANCELLED') {
        counts.cancelled++;
      }
    }

    // Apply the selected status filter.
    const filteredReservations =
      status === 'ALL'
        ? reservations
        : reservations.filter(
            (reservation) => reservation.status === status,
          );

    // Convert Prisma records into the response format expected by
    // frontend/src/lib/reservations.ts and ReservationList.tsx.
    const data = filteredReservations.map((reservation) => {
      const paymentRecords = reservation.payments;

      // Use payment records when available. For older reservations
      // without payment records, retain the existing deposit value.
      const paidAmount =
        paymentRecords.length > 0
          ? paymentRecords.reduce(
              (total, payment) => total + Number(payment.amount),
              0,
            )
          : Number(reservation.deposit);

      const estimatedTotal = Number(reservation.estimatedTotal);

      const nights = Math.max(
        1,
        Math.ceil(
          (reservation.departure.getTime() -
            reservation.arrival.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      return {
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        createdAt: reservation.createdAt,
        status: reservation.status,

        guest: {
          name: `${reservation.guest.firstName} ${reservation.guest.lastName}`.trim(),
          phone: reservation.guest.phone,
          email: reservation.guest.email,
          idNumber: reservation.guest.idNumber,
        },

        room: {
          id: reservation.room.id,
          number: reservation.room.number,
          type: reservation.room.roomType.name,
          pricePerNight: Number(
            reservation.room.rateOverride ??
              reservation.room.roomType.nightlyRate,
          ),
        },

        group: reservation.group
          ? {
              id: reservation.group.id,
              name: reservation.group.name,
            }
          : null,

        checkIn: reservation.arrival,
        checkOut: reservation.departure,
        nights,
        numberOfGuests: reservation.numberOfGuests,

        estimatedTotal,
        paidAmount,
        balanceDue: Math.max(0, estimatedTotal - paidAmount),

        paymentMethod: reservation.paymentMethod,
        guaranteeType: reservation.guaranteeType,
        specialRequests: reservation.specialRequests,

        payments: paymentRecords.map((payment) => ({
          id: payment.id,
          date: payment.createdAt,
          description: payment.description,
          amount: Number(payment.amount),
          method: payment.method,
        })),
      };
    });

    res.json({
      data,
      counts,
    });
  }),
);


// ───── Add reservation deposit payment ─────

const reservationPaymentBody = z.object({
  amount: z.coerce.number().finite().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  description: z
    .string()
    .trim()
    .min(1)
    .max(250)
    .default('Additional reservation deposit'),
});

reservationsRouter.post(
  '/:id/payments',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const body = parse(
      reservationPaymentBody,
      req.body,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        // Find the reservation and its room before locking.
        const initial =
          await tx.reservation.findUnique({
            where: {
              id: req.params.id,
            },
            select: {
              id: true,
              roomId: true,
            },
          });

        if (!initial) {
          throw new HttpError(
            404,
            'Reservation not found',
          );
        }

        // Use the same room lock used by reservation creation
        // and check-in to prevent concurrent changes.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${initial.roomId})::bigint
          )::text AS lock_result
        `;

        // Re-read after acquiring the lock.
        const reservation =
          await tx.reservation.findUnique({
            where: {
              id: initial.id,
            },
            include: {
              payments: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          });

        if (!reservation) {
          throw new HttpError(
            404,
            'Reservation not found',
          );
        }

        if (
          reservation.status !== 'PENDING' &&
          reservation.status !== 'CONFIRMED'
        ) {
          throw new HttpError(
            409,
            'Additional deposits can only be recorded against pending or confirmed reservations.',
          );
        }

        // Reconcile the stored deposit against its payment records.
        const recordedTotal =
          reservation.payments.reduce(
            (total, payment) =>
              total.plus(payment.amount),
            D(0),
          );

        const currentDeposit = D(
          reservation.deposit,
        );

        if (
          !recordedTotal.equals(currentDeposit)
        ) {
          throw new HttpError(
            409,
            `Reservation deposit records are inconsistent. Stored deposit: ${currentDeposit.toFixed(2)}; recorded payments: ${recordedTotal.toFixed(2)}. Reconcile the existing records before adding another payment.`,
          );
        }

        const newDeposit = currentDeposit.plus(
          D(body.amount),
        );

        if (
          newDeposit.greaterThan(
            D(reservation.estimatedTotal),
          )
        ) {
          throw new HttpError(
            400,
            'The additional payment would make the total deposit exceed the estimated reservation amount.',
          );
        }

        // Create the individual payment record.
        const payment =
          await tx.reservationPayment.create({
            data: {
              reservationId: reservation.id,
              amount: D(body.amount),
              description: body.description,
              method: body.method,
            },
          });

        // Update the reservation's running deposit total.
        const wasPending = reservation.status === 'PENDING';

        const updatedReservation = await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            deposit: { increment: D(body.amount) },
            ...(wasPending ? { status: 'CONFIRMED' as const } : {}),
          },
          include: {
            payments: { orderBy: { createdAt: 'asc' } },
            guest: true,
            room: { include: { roomType: true } },
          },
        });

        return {
          reservation: updatedReservation,
          payment,
          recordedTotal: newDeposit,
          confirmedNow: wasPending,
        };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

    if (result.confirmedNow) {
      void onReservationConfirmed(result.reservation.id);
    }

    res.status(201).json(result);
  }),
);

// ───── Update reservation status ─────

reservationsRouter.patch(
  '/:id/status',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const { status } = parse(
      z.object({
        status: z.enum(['CONFIRMED', 'CANCELLED', 'NO_SHOW']),
      }),
      req.body,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        // Read the reservation to determine which room to lock.
        const initial = await tx.reservation.findUnique({
          where: { id: req.params.id },
          select: { id: true, roomId: true },
        });

        if (!initial) {
          return { kind: 'NOT_FOUND' as const };
        }

        // Use the same lock key as reservation creation and check-in.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${initial.roomId})::bigint
          )::text AS lock_result
        `;

        // Re-read after acquiring the lock.
        const reservation = await tx.reservation.findUnique({
          where: { id: initial.id },
        });

        if (!reservation) {
          return { kind: 'NOT_FOUND' as const };
        }

        // Make repeated requests for the same status harmless.
        if (reservation.status === status) {
          return { kind: 'OK' as const, reservation, changed: false };
        }

        // A checked-in reservation cannot be confirmed, cancelled or marked no-show.
        if (reservation.status === 'CHECKED_IN') {
          return { kind: 'CHECKED_IN' as const };
        }

        // Protect any active stay linked to this reservation.
        if (status === 'CANCELLED' || status === 'NO_SHOW') {
          const activeStay = await tx.stay.findFirst({
            where: {
              reservationId: reservation.id,
              status: 'CHECKED_IN',
              checkOutAt: null,
            },
            select: { id: true },
          });

          if (activeStay) {
            return { kind: 'CHECKED_IN' as const };
          }
        }

        // Do not silently confirm a cancelled reservation.
        if (status === 'CONFIRMED' && reservation.status === 'CANCELLED') {
          return {
            kind: 'INVALID_TRANSITION' as const,
            message:
              'A cancelled reservation cannot be confirmed again. Create a new reservation instead.',
          };
        }

        // No-show only applies to reservations that are still open.
        if (
          status === 'NO_SHOW' &&
          reservation.status !== 'PENDING' &&
          reservation.status !== 'CONFIRMED'
        ) {
          return {
            kind: 'INVALID_TRANSITION' as const,
            message:
              'Only pending or confirmed reservations can be marked as No Show.',
          };
        }

        const updated = await tx.reservation.update({
          where: { id: reservation.id },
          data: { status },
        });

        return { kind: 'OK' as const, reservation: updated, changed: true };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    if (result.kind === 'NOT_FOUND') {
      res.status(404).json({ message: 'Reservation not found' });
      return;
    }

    if (result.kind === 'CHECKED_IN') {
      res.status(409).json({
        message:
          'This reservation is already checked in. Check out the guest before making changes to its reservation status.',
      });
      return;
    }

    if (result.kind === 'INVALID_TRANSITION') {
      res.status(409).json({ message: result.message });
      return;
    }

    // Only notify when the status actually changed to Confirmed.
    if (status === 'CONFIRMED' && result.changed) {
      void onReservationConfirmed(result.reservation.id);
    }

    res.json(result.reservation);
  }),
);