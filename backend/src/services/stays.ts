import { DiscountType, PaymentMethod } from '@prisma/client';
import { Prisma, D, Tx, prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { config } from '../config';
import { ACC, postJournal } from './accounting';
import { folioBalance, newFolioNo, postFolioCharge, postFolioPayment } from './folio';
import { audit } from '../lib/audit';
import { consentData } from '../messaging/consent';
import { canApprove, getMaxDiscountPercent } from './policy';
import { createTask } from './housekeeping';
import { checkCredit } from './receivables';
import { assertNotBlacklisted } from './crm';
import { newPin } from './portal';

import {
  nightsBetween,
  overdueNights,
} from './stayNights';



export function priceStay(p: {
  rate: Prisma.Decimal.Value;
  nights: number;
  discountType: DiscountType;
  discountValue: Prisma.Decimal.Value;
  complimentary: boolean;
  vat: boolean;
  service: boolean;
}) {
  const gross = D(p.rate).times(p.nights);
  let discount = D(0);
  if (p.discountType === 'PERCENTAGE') discount = gross.times(D(p.discountValue)).div(100);
  if (p.discountType === 'FIXED') discount = D(p.discountValue);
  if (discount.gt(gross)) discount = gross;
  const net = p.complimentary ? D(0) : gross.minus(discount);
  const service = p.service ? net.times(config.serviceChargeRate) : D(0);
  const vat = p.vat ? net.times(config.vatRate) : D(0);
  return { gross, discount, net, service, vat, total: net.plus(service).plus(vat) };
}

export interface CheckInInput {
  guestId?: string;
  guest?: { firstName: string; lastName: string; phone: string; email?: string; address?: string; idType?: string; idNumber?: string; nationality?: string; whatsappOptIn?: boolean };
  reservationId?: string;
  roomId: string;
  groupId?: string;
  numGuests: number;
  expectedDeparture: Date;
  discountType: DiscountType;
  discountValue: number;
  discountReason?: string;
  isComplimentary: boolean;
  complimentaryReason?: string;
  authorizedBy?: string;
  applyVat: boolean;
  applyServiceCharge: boolean;
  advancePayment: number;
  paymentMethod?: PaymentMethod;
  specialRequests?: string;
}

export async function checkIn(input: CheckInInput, userId: string, role?: string) {
  const maxDiscount = canApprove(role) ? 100 : await getMaxDiscountPercent();
  
return prisma.$transaction(async (tx) => {
  // Must use the same lock key as reservation creation.
await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(
    hashtext(${input.roomId})::bigint
  )::text AS lock_result
`;

  const room = await tx.room.findUnique({
    where: { id: input.roomId },
    include: { roomType: true },
  });

    if (!room) throw new HttpError(404, 'Room not found');
    if (room.status !== 'AVAILABLE' && room.status !== 'RESERVED')
      throw new HttpError(409, `Room ${room.number} is ${room.status.toLowerCase()} and cannot be assigned`);
    if (input.discountType !== 'NONE' && !input.discountReason) throw new HttpError(400, 'A discount reason is required');
    if (input.isComplimentary && !input.complimentaryReason) throw new HttpError(400, 'A reason is required for complimentary stays');
  
if (input.expectedDeparture <= new Date()) {
  throw new HttpError(400, 'Departure must be in the future');
}

const now = new Date();

let linkedReservation = null as Awaited<
  ReturnType<typeof tx.reservation.findUnique>
>;

if (input.reservationId) {
  linkedReservation = await tx.reservation.findUnique({
    where: { id: input.reservationId },
  });

  if (!linkedReservation) {
    throw new HttpError(404, 'Reservation not found');
  }

  if (
    linkedReservation.status !== 'PENDING' &&
    linkedReservation.status !== 'CONFIRMED'
  ) {
    throw new HttpError(
      409,
      `This reservation cannot be checked in because its status is ${linkedReservation.status}.`,
    );
  }

  if (linkedReservation.roomId !== input.roomId) {
    throw new HttpError(
      409,
      'The selected room does not match the reservation.',
    );
  }

  if (linkedReservation.arrival > now) {
    throw new HttpError(
      409,
      'This reservation is not due for check-in yet.',
    );
  }

  if (linkedReservation.departure <= now) {
    throw new HttpError(
      409,
      'This reservation has passed its departure date.',
    );
  }

  if (
    input.guestId &&
    input.guestId !== linkedReservation.guestId
  ) {
    throw new HttpError(
      409,
      'The selected guest does not match the reservation.',
    );
  }

  if (input.guest) {
    throw new HttpError(
      400,
      'Do not submit new guest details when checking in against an existing reservation.',
    );
  }

  // Compare calendar dates because the reservation departure may be
  // stored at midnight while the hotel's checkout time is later.
  const departureDay = new Date(
    input.expectedDeparture.getFullYear(),
    input.expectedDeparture.getMonth(),
    input.expectedDeparture.getDate(),
  );

  const reservedDepartureDay = new Date(
    linkedReservation.departure.getFullYear(),
    linkedReservation.departure.getMonth(),
    linkedReservation.departure.getDate(),
  );

  if (departureDay > reservedDepartureDay) {
    throw new HttpError(
      409,
      'The requested departure is later than the reservation. Check in for the reserved dates and use Extend Stay for additional nights.',
    );
  }
}

// A walk-in must not take a room during another guest's reservation.
// For a reserved check-in, ignore only its own reservation.
const conflictingReservation = await tx.reservation.findFirst({
  where: {
    roomId: input.roomId,
    status: { in: ['PENDING', 'CONFIRMED'] },
    arrival: { lt: input.expectedDeparture },
    departure: { gt: now },
    ...(linkedReservation
      ? { id: { not: linkedReservation.id } }
      : {}),
  },
  select: { id: true },
});

if (conflictingReservation) {
  throw new HttpError(
    409,
    'This room has another reservation overlapping the requested stay.',
  );
}

let guestId = linkedReservation?.guestId ?? input.guestId;

await assertNotBlacklisted(
  tx,
  guestId
    ? { guestId }
    : {
        phone: input.guest?.phone,
        idNumber: input.guest?.idNumber,
        email: input.guest?.email,
      },
  userId,
);

if (!guestId) {
  if (!input.guest) {
    throw new HttpError(400, 'Select or register a guest');
  }

  guestId = (
    await tx.guest.create({
      data: consentData(input.guest),
    })
  ).id;
}

    const rate = room.rateOverride ?? room.roomType.nightlyRate;
    const nights = nightsBetween(new Date(), input.expectedDeparture);
    const price = priceStay({
      rate, nights, discountType: input.discountType, discountValue: input.discountValue,
      complimentary: input.isComplimentary, vat: input.applyVat, service: input.applyServiceCharge,
    });
    if (input.groupId) await checkCredit(input.groupId, price.total, role, userId); // the stay is billed to the company's account
    // Free stays and large discounts need a manager or admin to be the one entering them.
    if (!canApprove(role)) {
      if (input.isComplimentary) throw new HttpError(403, 'Only a manager or admin can give a complimentary stay');
      const pct = price.gross.gt(0) ? price.discount.div(price.gross).times(100) : D(0);
      if (pct.gt(maxDiscount)) throw new HttpError(403, `Discounts above ${maxDiscount}% need a manager or admin (this one is ${pct.toFixed(1)}%)`);
    }

    const stay = await tx.stay.create({
      data: {
         reservationId: linkedReservation?.id,
        guestId, roomId: room.id, groupId: input.groupId, numGuests: input.numGuests,
        expectedDeparture: input.expectedDeparture, nightlyRate: rate,
        discountType: input.discountType, discountValue: input.discountValue, discountReason: input.discountReason,
        isComplimentary: input.isComplimentary, complimentaryReason: input.complimentaryReason, authorizedBy: input.authorizedBy,
        applyVat: input.applyVat, applyServiceCharge: input.applyServiceCharge, specialRequests: input.specialRequests,
        portalPin: newPin(), // lets the guest unlock the room QR page
      },
    });
    if (linkedReservation) {
  await tx.reservation.update({
    where: { id: linkedReservation.id },
    data: { status: 'CHECKED_IN' },
  });
}
    const folio = await tx.folio.create({
      data: { folioNo: newFolioNo(), stayId: stay.id, guestId, groupId: input.groupId },
    });
    const grp = !!input.groupId;
    const ref = `STAY:${stay.id}`;

    if (input.isComplimentary) {
      await postJournal(tx, {
        description: `Complimentary room for ${room.number}`, reference: ref, userId,
        lines: [{ code: ACC.COMPLIMENTARY, debit: price.gross }, { code: ACC.ROOM_REVENUE, credit: price.gross }],
      });
    } else {
      await chargeRoom(tx, folio.id, room.number, price, grp, userId, ref);
    }

    if (input.advancePayment > 0) {
      await postFolioPayment(tx, {
        folioId: folio.id, amount: input.advancePayment, method: input.paymentMethod ?? 'CASH',
        description: 'Advance payment/deposit', userId, groupFolio: grp, reference: ref,
      });
    }
    await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    await audit(tx, { userId, action: 'CHECK_IN', entity: 'Stay', entityId: stay.id, meta: {
      room: room.number, nights, nightlyRate: Number(rate), discountType: input.discountType, discountValue: input.discountValue,
      complimentary: input.isComplimentary, authorizedBy: input.authorizedBy ?? null, advancePayment: input.advancePayment,
    } });
     return { stay, folio };
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  });
}
async function chargeRoom(
  tx: Tx, folioId: string, roomNo: string,
  price: ReturnType<typeof priceStay>, group: boolean, userId: string | undefined, reference: string,
) {
  const base = { folioId, groupFolio: group, userId, reference };
  await postFolioCharge(tx, { ...base, description: `Room charge for ${roomNo}`, amount: price.net, creditCode: ACC.ROOM_REVENUE });
  await postFolioCharge(tx, { ...base, description: `Service Charge (10%) on room charge for ${roomNo}`, amount: price.service, creditCode: ACC.SERVICE_PAYABLE });
  await postFolioCharge(tx, { ...base, description: `VAT (7.5%) on room charge for ${roomNo}`, amount: price.vat, creditCode: ACC.VAT_PAYABLE });
}

export async function extendStay(stayId: string, nights: number, userId: string | undefined, auto = false) {

return prisma.$transaction(async (tx) => {
  // Find the room so we can acquire its shared allocation lock.
  const initialStay = await tx.stay.findUnique({
    where: { id: stayId },
    select: { roomId: true },
  });

  if (!initialStay) {
    throw new HttpError(404, 'Active stay not found');
  }

await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(
    hashtext(${initialStay.roomId})::bigint
  )::text AS lock_result
`;

  // Re-read after acquiring the lock.
  const stay = await tx.stay.findUnique({
    where: { id: stayId },
    include: { room: true, folio: true },
  });

    if (!stay || stay.status !== 'CHECKED_IN' || !stay.folio) throw new HttpError(404, 'Active stay not found');
    const price = priceStay({
      rate: stay.nightlyRate, nights, discountType: stay.discountType, discountValue: stay.discountType === 'PERCENTAGE' ? stay.discountValue : D(0),
      complimentary: stay.isComplimentary, vat: stay.applyVat, service: stay.applyServiceCharge,
    });
    const grp = !!stay.groupId;
    if (!stay.isComplimentary) await chargeRoom(tx, stay.folio.id, stay.room.number, price, grp, userId, `STAY:${stay.id}`);
   const next = standardCheckout(stay.expectedDeparture, nights);

const reservationClash = await tx.reservation.findFirst({
  where: {
    roomId: stay.roomId,
    status: { in: ['PENDING', 'CONFIRMED'] },
    arrival: { lt: next },
    departure: { gt: stay.expectedDeparture },
    ...(stay.reservationId
      ? { id: { not: stay.reservationId } }
      : {}),
  },
  select: { id: true },
});

if (reservationClash) {
  throw new HttpError(
    409,
    'This stay cannot be extended because the room has a reservation during the extension period.',
  );
}

    await tx.stay.update({ where: { id: stayId }, data: { expectedDeparture: next } });
    await tx.stayExtension.create({ data: { stayId, nights, amount: price.total, auto, userId } });
    await tx.auditLog.create({ data: { userId, action: auto ? 'AUTO_EXTEND' : 'EXTEND', entity: 'Stay', entityId: stayId, meta: { nights } } });
    return { expectedDeparture: next, charged: price.total };
  });
}

/** Today's standard checkout time (12:00) shifted by `offsetDays`. */
export const standardCheckout = (d: Date, offsetDays = 0) => {
  const x = new Date(d);
  x.setHours(config.checkoutHour, 0, 0, 0);
  x.setDate(x.getDate() + offsetDays);
  return x;
};

export async function checkOut(stayId: string, userId: string, pay?: { amount: number; method: PaymentMethod }, moveToCityLedger = false) {
  return prisma.$transaction(async (tx) => {
    const stay = await tx.stay.findUnique({ where: { id: stayId }, include: { folio: true, room: true } });
    if (!stay || stay.status !== 'CHECKED_IN' || !stay.folio) throw new HttpError(404, 'Active stay not found');
    if (pay && pay.amount > 0)
      await postFolioPayment(tx, { folioId: stay.folio.id, amount: pay.amount, method: pay.method, description: 'Payment at checkout', userId, groupFolio: !!stay.groupId });
    let bal = await folioBalance(stay.folio.id, tx);
    if (bal.gt(0) && !moveToCityLedger && !stay.groupId)
      throw new HttpError(409, `Outstanding balance of ₦${bal.toFixed(2)} must be settled before checkout`);
    await tx.stay.update({ where: { id: stayId }, data: { status: 'CHECKED_OUT', checkOutAt: new Date() } });
    await tx.folio.update({ where: { id: stay.folio.id }, data: { status: bal.lte(0) ? 'SETTLED' : 'CHECKED_OUT' } });
    await tx.room.update({ where: { id: stay.roomId }, data: { status: 'CLEANING' } });
    await createTask(tx, stay.roomId, 'CHECKOUT_CLEAN'); // the housekeeping board picks it up from here
    await audit(tx, { userId, action: 'CHECK_OUT', entity: 'Stay', entityId: stayId, meta: { balance: Number(bal), movedToCityLedger: moveToCityLedger } });
    return { balance: bal };
  });
}

/** Extends every checked-in guest whose departure has passed. Runs daily at 14:00. */
export async function runAutoExtension(userId?: string, ip?: string, action = 'AUTO_RUN') {
  const now = new Date();
  const due = await prisma.stay.findMany({ where: { status: 'CHECKED_IN', expectedDeparture: { lte: now } } });
  let count = 0;
  let revenue = D(0);
  for (const s of due) {
    try {
      const nights = overdueNights(s.expectedDeparture, now);

      if (nights < 1) continue;
      const r = await extendStay(s.id, nights, userId, true);
      revenue = revenue.plus(r.charged);
      count++;
    } catch (e) {
      console.error('Auto extension failed for stay', s.id, e);
    }
  }
  await prisma.autoExtensionLog.create({ data: { action, userId, ip, count, revenue } });
  return { count, revenue };
}
