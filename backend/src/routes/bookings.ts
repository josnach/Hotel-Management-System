import { Router } from 'express';
import { z } from 'zod';
import { EventStatus } from '@prisma/client';
import { asyncHandler, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { onReservationConfirmed } from '../messaging/triggers';
import { assertNotBlacklisted } from '../services/crm';

const monthRange = (q: Record<string, unknown>) => {
  const y = Number(q.year ?? new Date().getFullYear());
  const m = Number(q.month ?? new Date().getMonth() + 1);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
};

// ───── Events ─────
export const eventsRouter = Router();
eventsRouter.get('/facilities', asyncHandler(async (_q, res) => res.json(await prisma.facility.findMany({ orderBy: { name: 'asc' } }))));
eventsRouter.post('/facilities', requireRole(), asyncHandler(async (req, res) => res.status(201).json(await prisma.facility.create({ data: parse(z.object({ name: z.string().min(1), capacity: z.coerce.number().int().optional() }), req.body) }))));
eventsRouter.get('/calendar', asyncHandler(async (req, res) => {
  const { start, end } = monthRange(req.query);
  const facilityId = req.query.facilityId as string | undefined;
  const events = await prisma.eventBooking.findMany({ where: { startsAt: { gte: start, lt: end }, ...(facilityId ? { facilityId } : {}) }, include: { facility: true }, orderBy: { startsAt: 'asc' } });
  const soon = new Date(Date.now() + 7 * 86_400_000);
  res.json({
    kpis: {
      totalEvents: events.length, expectedGuests: events.reduce((s, e) => s + e.expectedGuests, 0),
      totalQuoted: events.reduce((s, e) => s.plus(e.quoted), D(0)), balanceDue: events.reduce((s, e) => s.plus(e.quoted).minus(e.paid), D(0)),
      upcoming7d: events.filter((e) => e.status === 'CONFIRMED' && e.startsAt >= new Date() && e.startsAt <= soon).length,
    },
    events,
  });
}));
const evBody = z.object({ title: z.string().min(1), clientName: z.string().min(1), clientPhone: z.string().optional(), groupId: z.string().optional(), facilityId: z.string(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), expectedGuests: z.coerce.number().int().min(0).default(0), quoted: z.coerce.number().min(0).default(0), paid: z.coerce.number().min(0).default(0), status: z.nativeEnum(EventStatus).default('INQUIRY'), notes: z.string().optional() });
eventsRouter.get('/', asyncHandler(async (_q, res) => res.json(await prisma.eventBooking.findMany({ include: { facility: true }, orderBy: { startsAt: 'desc' } }))));
eventsRouter.post('/', requireRole('RECEPTIONIST'), asyncHandler(async (req, res) => {
  const b = parse(evBody, req.body);
  const clash = await prisma.eventBooking.findFirst({ where: { facilityId: b.facilityId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, startsAt: { lt: b.endsAt }, endsAt: { gt: b.startsAt } } });
  if (clash && ['CONFIRMED', 'IN_PROGRESS'].includes(b.status)) return res.status(409).json({ message: `${clash.title} already holds this facility at that time` });
  res.status(201).json(await prisma.eventBooking.create({ data: b }));
}));
eventsRouter.put('/:id', requireRole('RECEPTIONIST'), asyncHandler(async (req, res) => res.json(await prisma.eventBooking.update({ where: { id: req.params.id }, data: parse(evBody.partial(), req.body) }))));
eventsRouter.delete('/:id', requireRole('RECEPTIONIST'), asyncHandler(async (req, res) => { await prisma.eventBooking.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

// ───── Reservations ─────
export const reservationsRouter = Router();
reservationsRouter.get('/calendar', asyncHandler(async (req, res) => {
  const { start, end } = monthRange(req.query);
  const [totalRooms, reservations] = await Promise.all([
    prisma.room.count(),
    prisma.reservation.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, arrival: { lt: end }, departure: { gt: start } }, include: { guest: true, room: true } }),
  ]);
  const days: { date: string; reserved: number; items: typeof reservations }[] = [];
  let peak = 0;
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const items = reservations.filter((r) => r.arrival <= d && r.departure > d);
    peak = Math.max(peak, items.length);
    days.push({ date: d.toISOString().slice(0, 10), reserved: items.length, items });
  }
  res.json({ kpis: { totalReservations: reservations.length, totalRooms, peakOccupancy: peak, availability: totalRooms - peak }, days });
}));
const rBody = z.object({ guestId: z.string(), roomId: z.string(), arrival: z.coerce.date(), departure: z.coerce.date(), deposit: z.coerce.number().min(0).default(0), notes: z.string().optional() });

reservationsRouter.post(
  '/',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const b = parse(rBody, req.body);

    if (b.departure <= b.arrival) {
      return res.status(400).json({
        message: 'Departure must be after arrival',
      });
    }

    await assertNotBlacklisted(
      prisma,
      { guestId: b.guestId },
      req.user!.id,
    );

    const reservation = await prisma.$transaction(
      async (tx) => {
        // Serialize reservation requests for the same room.
        // The lock is released automatically when the transaction ends.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${b.roomId})::bigint
          )::text AS lock_result
        `;

        // Check for overlapping pending or confirmed reservations.
        const reservationClash = await tx.reservation.findFirst({
          where: {
            roomId: b.roomId,
            status: {
              in: ['PENDING', 'CONFIRMED'],
            },
            arrival: {
              lt: b.departure,
            },
            departure: {
              gt: b.arrival,
            },
          },
          select: {
            id: true,
          },
        });

        if (reservationClash) {
          throw new Error('ROOM_RESERVATION_CONFLICT');
        }

        // Check for a guest who is still checked into this room.
        const stayClash = await tx.stay.findFirst({
          where: {
            roomId: b.roomId,
            status: 'CHECKED_IN',
            checkOutAt: null,
            checkInAt: {
              lt: b.departure,
            },
            expectedDeparture: {
              gt: b.arrival,
            },
          },
          select: {
            id: true,
          },
        });

        if (stayClash) {
          throw new Error('ROOM_STAY_CONFLICT');
        }

        return tx.reservation.create({
          data: {
            guestId: b.guestId,
            roomId: b.roomId,
            arrival: b.arrival,
            departure: b.departure,
            deposit: b.deposit,
            notes: b.notes,
          },
        });
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    ).catch((error: unknown) => {
      if (
        error instanceof Error &&
        (
          error.message === 'ROOM_RESERVATION_CONFLICT' ||
          error.message === 'ROOM_STAY_CONFLICT'
        )
      ) {
        return null;
      }

      throw error;
    });

    if (!reservation) {
      return res.status(409).json({
        message:
          'That room is unavailable for the requested dates.',
      });
    }

    return res.status(201).json(reservation);
  }),
);

reservationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const reservations = await prisma.reservation.findMany({
      include: {
        guest: true,
        room: {
          include: {
            roomType: true,
          },
        },
      },
      orderBy: { arrival: 'asc' },
    });

    res.json(reservations);
  }),
);

reservationsRouter.patch(
  '/:id/status',
  requireRole('RECEPTIONIST'),
  asyncHandler(async (req, res) => {
    const { status } = parse(
      z.object({
        status: z.enum(['CONFIRMED', 'CANCELLED']),
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

        // Use the same lock key as booking and check-in.
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

        // Make repeated cancellation requests harmless.
        if (
          status === 'CANCELLED' &&
          reservation.status === 'CANCELLED'
        ) {
          return { kind: 'OK' as const, reservation };
        }

     
// A checked-in reservation cannot transition back to
// CONFIRMED or CANCELLED.
if (reservation.status === 'CHECKED_IN') {
  return { kind: 'CHECKED_IN' as const };
}

        // Also protect an active stay linked to this reservation.
        if (status === 'CANCELLED') {
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
        if (
          status === 'CONFIRMED' &&
          reservation.status === 'CANCELLED'
        ) {
          return { kind: 'INVALID_TRANSITION' as const };
        }

        const updated = await tx.reservation.update({
          where: { id: reservation.id },
          data: { status },
        });

        return { kind: 'OK' as const, reservation: updated };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
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
      res.status(409).json({
        message:
          'A cancelled reservation cannot be confirmed again. Create a new reservation instead.',
      });
      return;
    }

    if (status === 'CONFIRMED') {
      void onReservationConfirmed(result.reservation.id);
    }

    res.json(result.reservation);
  }),
);
