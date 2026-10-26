
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../lib/http';
import { prisma } from '../lib/prisma';

export const publicRoomsRouter = Router();

const datesSchema = z.object({
  arrival: z.coerce.date(),
  departure: z.coerce.date(),
});

function validDates(arrival: Date, departure: Date): boolean {
  return (
    Number.isFinite(arrival.getTime()) &&
    Number.isFinite(departure.getTime()) &&
    departure > arrival
  );
}

/**
 * Public room categories and advertised base prices.
 * Does not expose room numbers, occupants, or internal room status.
 */
publicRoomsRouter.get(
  '/types',
  asyncHandler(async (_req, res) => {
    const types = await prisma.roomType.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        nightlyRate: true,
        capacity: true,
      },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json(
      types.map((type) => ({
        id: type.id,
        name: type.name,
        description: type.description,
        nightlyRate: Number(type.nightlyRate),
        capacity: type.capacity,
      })),
    );
  }),
);

/**
 * Public availability search.
 *
 * Example:
 * GET /api/public/rooms/availability
 *     ?arrival=2026-11-10
 *     &departure=2026-11-12
 *
 * Returns available room counts and starting nightly rates by room type.
 */
publicRoomsRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const parsed = datesSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Provide valid arrival and departure dates.',
      });
    }

    const { arrival, departure } = parsed.data;

    if (!validDates(arrival, departure)) {
      return res.status(400).json({
        message: 'Departure must be after arrival.',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (arrival < today) {
      return res.status(400).json({
        message: 'Arrival cannot be in the past.',
      });
    }

    const [types, rooms] = await Promise.all([
      prisma.roomType.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          nightlyRate: true,
          capacity: true,
        },
      }),

      prisma.room.findMany({
        where: { status: 'AVAILABLE' },
        select: {
          id: true,
          roomTypeId: true,
          rateOverride: true,
        },
      }),
    ]);

    const results = await Promise.all(
      types.map(async (type) => {
        const typeRooms = rooms.filter(
          (room) => room.roomTypeId === type.id,
        );

        const availableRooms = await Promise.all(
          typeRooms.map(async (room) => {
            const [reservationClash, stayClash] = await Promise.all([
              prisma.reservation.findFirst({
                where: {
                  roomId: room.id,
                  status: { in: ['PENDING', 'CONFIRMED'] },
                  arrival: { lt: departure },
                  departure: { gt: arrival },
                },
                select: { id: true },
              }),

              prisma.stay.findFirst({
                where: {
                  roomId: room.id,
                  status: 'CHECKED_IN',
                  checkOutAt: null,
                  checkInAt: { lt: departure },
                  expectedDeparture: { gt: arrival },
                },
                select: { id: true },
              }),
            ]);

            return !reservationClash && !stayClash ? room : null;
          }),
        );

        const freeRooms = availableRooms.filter(
          (room) => room !== null,
        );

        const prices = freeRooms.map((room) =>
          Number(room.rateOverride ?? type.nightlyRate),
        );

        return {
          roomTypeId: type.id,
          name: type.name,
          description: type.description,
          capacity: type.capacity,
          availableRooms: freeRooms.length,
          startingNightlyRate:
            prices.length > 0 ? Math.min(...prices) : null,
          currency: 'NGN',
        };
      }),
    );

    res.setHeader('Cache-Control', 'no-store');

    return res.json({
      arrival,
      departure,
      roomTypes: results,
    });
  }),
);
