
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';

import { asyncHandler, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { assertNotBlacklisted } from '../services/crm';

export const publicBookingsRouter = Router();

const bookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const publicBookingBody = z.object({
  roomTypeId: z.string().min(1),
  arrival: z.coerce.date(),
  departure: z.coerce.date(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z.union([
    z.string().trim().email().max(254),
    z.literal(''),
  ]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const normalizeName = (value: string) => value.trim().toLowerCase();

publicBookingsRouter.post(
  '/',
  bookingRateLimit,
  asyncHandler(async (req, res) => {
    const b = parse(publicBookingBody, req.body);
    const idempotencyKey = req.get('Idempotency-Key')?.trim();

    if (
      !idempotencyKey ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)
    ) {
      return res.status(400).json({
        message:
          'Provide a valid Idempotency-Key header of 16–128 letters, numbers, underscores, or hyphens.',
      });
    }

    if (
      Number.isNaN(b.arrival.getTime()) ||
      Number.isNaN(b.departure.getTime()) ||
      b.departure <= b.arrival
    ) {
      return res.status(400).json({
        message: 'Departure must be after arrival.',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (b.arrival < today) {
      return res.status(400).json({
        message: 'Arrival cannot be in the past.',
      });
    }

    const email = b.email?.trim().toLowerCase() || undefined;
    const phone = b.phone.trim();
    const firstName = b.firstName.trim();
    const lastName = b.lastName.trim();
    const notes = b.notes?.trim() || null;

    await assertNotBlacklisted(prisma, {
      phone,
      email,
    });

    const result = await prisma.$transaction(
      async (tx) => {
        // Serialize requests that reuse the same idempotency key.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`website-booking:${idempotencyKey}`})::bigint
          )::text AS lock_result
        `;

        const previous = await tx.reservation.findFirst({
          where: {
            externalProvider: 'WEBSITE',
            externalReservationId: idempotencyKey,
          },
          include: {
            guest: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
            room: {
              select: {
                number: true,
                roomTypeId: true,
              },
            },
          },
        });

        if (previous) {
          // A retry must represent the same submitted booking.
          const sameRequest =
            previous.room.roomTypeId === b.roomTypeId &&
            previous.arrival.getTime() === b.arrival.getTime() &&
            previous.departure.getTime() === b.departure.getTime() &&
            normalizeName(previous.guest.firstName) ===
              normalizeName(firstName) &&
            normalizeName(previous.guest.lastName) ===
              normalizeName(lastName) &&
            previous.guest.phone.trim() === phone &&
            (previous.guest.email?.trim().toLowerCase() || undefined) ===
              email &&
            (previous.notes || null) === notes;

          if (!sameRequest) {
            return { kind: 'KEY_REUSED' as const };
          }

          return {
            kind: 'EXISTING' as const,
            reservation: previous,
          };
        }

        const roomType = await tx.roomType.findUnique({
          where: { id: b.roomTypeId },
          select: { id: true },
        });

        if (!roomType) {
          return { kind: 'INVALID_ROOM_TYPE' as const };
        }

        // Match existing guests by phone and, when provided, email.
        // Never silently attach a booking to an ambiguous or conflicting
        // guest identity.
        const phoneGuest = await tx.guest.findFirst({
          where: { phone },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        });

        const emailGuest = email
          ? await tx.guest.findFirst({
              where: { email },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            })
          : null;

        if (
          phoneGuest &&
          emailGuest &&
          phoneGuest.id !== emailGuest.id
        ) {
          return { kind: 'GUEST_IDENTITY_CONFLICT' as const };
        }

        const existingGuest = phoneGuest ?? emailGuest;

        if (existingGuest) {
          const sameName =
            normalizeName(existingGuest.firstName) ===
              normalizeName(firstName) &&
            normalizeName(existingGuest.lastName) ===
              normalizeName(lastName);

          const phoneMatches = existingGuest.phone.trim() === phone;

          const existingEmail =
            existingGuest.email?.trim().toLowerCase() || undefined;

          const emailMatches =
            !email ||
            !existingEmail ||
            existingEmail === email;

          if (!sameName || !phoneMatches || !emailMatches) {
            return { kind: 'GUEST_IDENTITY_CONFLICT' as const };
          }

          // Attach a newly supplied email only when this guest has none.
          // The email lookup above ensures it wasn't found on another guest.
          if (email && !existingEmail) {
            await tx.guest.update({
              where: { id: existingGuest.id },
              data: { email },
            });
          }
        }

        const rooms = await tx.room.findMany({
          where: {
            roomTypeId: b.roomTypeId,
            status: 'AVAILABLE',
          },
          select: {
            id: true,
            number: true,
          },
          orderBy: { number: 'asc' },
        });

        for (const room of rooms) {
          // Use the same room-lock convention as the other booking paths.
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${room.id})::bigint
            )::text AS lock_result
          `;

          // Recheck room state after obtaining the lock.
          const currentRoom = await tx.room.findUnique({
            where: { id: room.id },
            select: {
              id: true,
              number: true,
              roomTypeId: true,
              status: true,
            },
          });

          if (
            !currentRoom ||
            currentRoom.status !== 'AVAILABLE' ||
            currentRoom.roomTypeId !== b.roomTypeId
          ) {
            continue;
          }

          const reservationClash =
            await tx.reservation.findFirst({
              where: {
                roomId: currentRoom.id,
                status: {
                  in: ['PENDING', 'CONFIRMED'],
                },
                arrival: { lt: b.departure },
                departure: { gt: b.arrival },
              },
              select: { id: true },
            });

          if (reservationClash) continue;

          const stayClash = await tx.stay.findFirst({
            where: {
              roomId: currentRoom.id,
              status: 'CHECKED_IN',
              checkOutAt: null,
              checkInAt: { lt: b.departure },
              expectedDeparture: { gt: b.arrival },
            },
            select: { id: true },
          });

          if (stayClash) continue;

          const guest = existingGuest
            ? { id: existingGuest.id }
            : await tx.guest.create({
                data: {
                  firstName,
                  lastName,
                  phone,
                  ...(email ? { email } : {}),
                  securityStatus: 'PENDING',
                },
                select: { id: true },
              });

          const reservation = await tx.reservation.create({
            data: {
              guestId: guest.id,
              roomId: currentRoom.id,
              arrival: b.arrival,
              departure: b.departure,
              notes,
              source: 'WEBSITE',
              externalProvider: 'WEBSITE',
              externalReservationId: idempotencyKey,
              syncStatus: 'NOT_REQUIRED',
              deposit: new Prisma.Decimal(0),
            },
            include: {
              room: {
                select: { number: true },
              },
            },
          });

          return {
            kind: 'CREATED' as const,
            reservation,
          };
        }

        return { kind: 'NO_AVAILABILITY' as const };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

    if (result.kind === 'KEY_REUSED') {
      return res.status(409).json({
        message:
          'This Idempotency-Key was already used for a different booking request.',
      });
    }

    if (result.kind === 'GUEST_IDENTITY_CONFLICT') {
      return res.status(409).json({
        message:
          'The supplied guest details conflict with an existing guest record. Please contact the hotel to complete this booking.',
      });
    }

    if (result.kind === 'INVALID_ROOM_TYPE') {
      return res.status(400).json({
        message: 'The selected room type does not exist.',
      });
    }

    if (result.kind === 'NO_AVAILABILITY') {
      return res.status(409).json({
        message: 'No rooms of this type are available for those dates.',
      });
    }

    const reservation = result.reservation;

    return res.status(
      result.kind === 'CREATED' ? 201 : 200,
    ).json({
      bookingReference: reservation.id,
      status: reservation.status,
      arrival: reservation.arrival,
      departure: reservation.departure,
      roomNumber: reservation.room.number,
      message:
        result.kind === 'CREATED'
          ? 'Your booking request has been received and is pending confirmation.'
          : 'This booking request was already received.',
    });
  }),
);
