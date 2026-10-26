
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

export const revenueForecastRouter = Router();

revenueForecastRouter.use(
  requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'),
);

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const DAY_MS = 86_400_000;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  const result = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(result.getTime()) ||
    dateOnly(result) !== value
  ) {
    throw new HttpError(400, 'Invalid date. Use YYYY-MM-DD.');
  }

  return result;
}

function plusDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function occupancyPercent(occupied: number, capacity: number): number {
  return capacity > 0
    ? Math.round((occupied / capacity) * 10000) / 100
    : 0;
}

function roomRate(room: {
  rateOverride: { toString(): string } | null;
  roomType: { nightlyRate: { toString(): string } };
}): number {
  return Number(
    room.rateOverride ?? room.roomType.nightlyRate,
  );
}

revenueForecastRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(querySchema, req.query);

    const start = query.start
      ? parseDate(query.start)
      : new Date(`${dateOnly(new Date())}T00:00:00.000Z`);

    const end = plusDays(start, query.days);
    const historyStart = plusDays(start, -56);

    const [rooms, historicalStays, futureStays, reservations] =
      await Promise.all([
        prisma.room.findMany({
          where: { status: { not: 'MAINTENANCE' } },
          select: {
            id: true,
            number: true,
            status: true,
            rateOverride: true,
            roomTypeId: true,
            roomType: {
              select: {
                id: true,
                name: true,
                nightlyRate: true,
              },
            },
          },
        }),

        prisma.stay.findMany({
          where: {
            checkInAt: { lt: start },
            expectedDeparture: { gt: historyStart },
          },
          select: {
            checkInAt: true,
            expectedDeparture: true,
            checkOutAt: true,
            status: true,
            nightlyRate: true,
            discountType: true,
            discountValue: true,
            isComplimentary: true,
            roomId: true,
          },
        }),

        prisma.stay.findMany({
          where: {
            checkInAt: { lt: end },
            expectedDeparture: { gt: start },
            status: 'CHECKED_IN',
          },
          select: {
            roomId: true,
            checkInAt: true,
            expectedDeparture: true,
            nightlyRate: true,
          },
        }),

        prisma.reservation.findMany({
          where: {
            arrival: { lt: end },
            departure: { gt: start },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: {
            roomId: true,
            arrival: true,
            departure: true,
          },
        }),
      ]);

    const capacity = rooms.length;

    if (!capacity) {
      throw new HttpError(
        409,
        'No saleable rooms were found for forecasting.',
      );
    }

    // Historical occupancy and room revenue are approximations based
    // on stay dates and the recorded nightly rate. They are not an
    // audited accounting report.
    const history: Array<{
      date: string;
      occupied: number;
      revenue: number;
    }> = [];

    for (
      let day = new Date(historyStart);
      day < start;
      day = plusDays(day, 1)
    ) {
      const dayEnd = plusDays(day, 1);

      const activeStays = historicalStays.filter((stay) => {
        const checkout = stay.checkOutAt ?? stay.expectedDeparture;

        // Count the room for the night only if departure is on or
// after the following midnight.
return stay.checkInAt < dayEnd && checkout >= dayEnd;
      });

      const occupiedRoomIds = new Set(
        activeStays.map((stay) => stay.roomId),
      );

      const revenue = activeStays.reduce((sum, stay) => {
        if (stay.isComplimentary) return sum;

        let rate = Number(stay.nightlyRate);
        const discount = Number(stay.discountValue);

        if (stay.discountType === 'PERCENTAGE') {
          rate *= 1 - Math.min(100, Math.max(0, discount)) / 100;
        } else if (stay.discountType === 'FIXED') {
          rate = Math.max(0, rate - discount);
        }

        return sum + rate;
      }, 0);

      history.push({
        date: dateOnly(day),
        occupied: Math.min(capacity, occupiedRoomIds.size),
        revenue: money(revenue),
      });
    }

    const overallOccupancy = mean(
      history.map((day) => day.occupied / capacity),
    );

    const overallAdr = mean(
      history
        .filter((day) => day.occupied > 0)
        .map((day) => day.revenue / day.occupied),
    );

    const days = Array.from({ length: query.days }, (_, offset) => {
      const date = plusDays(start, offset);
      const nextDate = plusDays(date, 1);
      const key = dateOnly(date);

      const weekdayHistory = history.filter(
        (day) => parseDate(day.date).getUTCDay() === date.getUTCDay(),
      );

      const weekdayOccupancy = mean(
        weekdayHistory.map((day) => day.occupied / capacity),
      );

      const weekdayAdr = mean(
        weekdayHistory
          .filter((day) => day.occupied > 0)
          .map((day) => day.revenue / day.occupied),
      );

      // Smooth weekday estimates toward the overall average when
      // there are fewer weekday observations.
      const weight = weekdayHistory.length /
        (weekdayHistory.length + 4);

      const baselineOccupancy =
        weekdayHistory.length > 0
          ? weight * weekdayOccupancy +
            (1 - weight) * overallOccupancy
          : overallOccupancy;

      const baselineAdr =
        weekdayHistory.some((day) => day.occupied > 0)
          ? weight * weekdayAdr + (1 - weight) * overallAdr
          : overallAdr;

      const reservedRoomIds = new Set(
        reservations
          .filter(
            (booking) =>
           booking.arrival < nextDate &&
            booking.departure >= nextDate
          )
          .map((booking) => booking.roomId),
      );

      const inHouseRoomIds = new Set(
        futureStays
          .filter(
            (stay) =>
             stay.checkInAt < nextDate &&
            stay.expectedDeparture >= nextDate
          )
          .map((stay) => stay.roomId),
      );

      const bookedRoomIds = new Set([
        ...reservedRoomIds,
        ...inHouseRoomIds,
      ]);

      const bookedRooms = Math.min(capacity, bookedRoomIds.size);
      const projectedOccupied = Math.max(
        bookedRooms,
        capacity * baselineOccupancy,
      );

      const forecastRevenue = Math.max(
        projectedOccupied * baselineAdr,
        bookedRooms * baselineAdr,
      );

      return {
        date: key,
        availableRooms: capacity,
        bookedRooms,
        forecastOccupiedRooms: Math.round(projectedOccupied * 100) / 100,
        forecastOccupancy: occupancyPercent(projectedOccupied, capacity),
        forecastRoomRevenue: money(forecastRevenue),
        averageDailyRate: money(
          projectedOccupied > 0
            ? forecastRevenue / projectedOccupied
            : 0,
        ),
        revPar: money(forecastRevenue / capacity),
        historicalSamples: historicalStays.length,
        confidence:
  historicalStays.length >= 28
    ? 'medium'
    : historicalStays.length >= 7
      ? 'low'
      : 'very-low',
      };
    });

    const pricingSuggestions = days.map((day) => {
      const currentRates = rooms.map(roomRate);
      const currentRate = mean(currentRates);

      // Conservative initial bounds. These are suggested-rate limits,
      // not live changes. Make them configurable before production use.
      const minimumRate = currentRate * 0.8;
      const maximumRate = currentRate * 1.3;

      let adjustment = 0;
      let reason = 'Normal demand: retain current room rates.';

      if (day.historicalSamples < 14) {
        reason = 'Insufficient history: retain current rates.';
      } else if (day.forecastOccupancy >= 85) {
        adjustment = 0.1;
        reason = 'High forecast occupancy: consider a 10% increase.';
      } else if (day.forecastOccupancy >= 70) {
        adjustment = 0.05;
        reason = 'Strong forecast occupancy: consider a 5% increase.';
      } else if (day.forecastOccupancy < 30) {
        adjustment = -0.1;
        reason = 'Low forecast occupancy: consider a 10% reduction.';
      } else if (day.forecastOccupancy < 45) {
        adjustment = -0.05;
        reason = 'Soft forecast demand: consider a 5% reduction.';
      }

      const suggestedRate = Math.round(
        Math.min(
          maximumRate,
          Math.max(minimumRate, currentRate * (1 + adjustment)),
        ),
      );

      return {
        date: day.date,
        currentAverageRate: money(currentRate),
        suggestedAverageRate: suggestedRate,
        changePercent: currentRate
          ? money(((suggestedRate - currentRate) / currentRate) * 100)
          : 0,
        reason,
        requiresManagerApproval: true,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      currency: 'NGN',
      period: {
        start: dateOnly(start),
        endExclusive: dateOnly(end),
        days: query.days,
      },
      summary: {
        roomCount: capacity,
        averageForecastOccupancy: money(
          mean(days.map((day) => day.forecastOccupancy)),
        ),
        forecastRoomRevenue: money(
          days.reduce((sum, day) => sum + day.forecastRoomRevenue, 0),
        ),
        averageRevPar: money(mean(days.map((day) => day.revPar))),
        historicalDays: history.length,
      },
      days,
      pricingSuggestions,
      limitations: [
        'Forecasts are estimates, not guaranteed revenue.',
        'Historical room revenue uses stay nightly rates and discounts; it is not an audited folio total.',
        'Pricing suggestions do not modify live room rates.',
        'Occupancy does not yet account for date-specific maintenance closures.',
      ],
    });
  }),
);
