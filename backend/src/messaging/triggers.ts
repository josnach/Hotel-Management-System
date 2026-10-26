import { config } from '../config';
import { dayRange } from '../lib/http';
import { prisma } from '../lib/prisma';
import { enqueue } from './outbox';
import { folioLink } from './signing';
import { emailFolioAtCheckout } from '../delivery/folioDelivery';

const naira = (n: unknown) => '₦' + Math.round(Number(n ?? 0)).toLocaleString('en-NG');
const fmtDate = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: config.hotelTz });
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.hotelTz }).format(d);
const clock = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

/** Call after a reservation is set to CONFIRMED. Never throws: messaging must not break the booking. */
export async function onReservationConfirmed(reservationId: string) {
  try {
    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { guest: true, room: { include: { roomType: true } } } });
    if (!r || !r.guest.whatsappOptIn || !r.guest.phone) return;
    await enqueue({
      dedupeKey: `booking-confirm:${r.id}`, phone: r.guest.phone, template: 'booking_confirmation', guestId: r.guestId,
      params: [r.guest.firstName, config.hotelName, r.room.roomType.name, fmtDate(r.arrival), fmtDate(r.departure), naira(r.deposit)],
    });
  } catch (e) { console.error('onReservationConfirmed failed', e); }
}

/** Call after check-out has committed. Sends a signed, expiring link to the folio. */
export async function onCheckedOut(stayId: string) {
  void emailFolioAtCheckout(stayId); // email the PDF too when AUTO_EMAIL_FOLIO=true (independent of WhatsApp consent)
  try {
    const s = await prisma.stay.findUnique({ where: { id: stayId }, include: { guest: true, folio: true } });
    if (!s?.folio || !s.guest.whatsappOptIn || !s.guest.phone) return;
    const t = await prisma.folioTransaction.aggregate({ where: { folioId: s.folio.id }, _sum: { bill: true } });
    await enqueue({
      dedupeKey: `folio-link:${s.folio.id}`, phone: s.guest.phone, template: 'folio_receipt', guestId: s.guestId,
      params: [s.guest.firstName, config.hotelName, naira(t._sum.bill), folioLink(s.folio.id, 168)],
    });
  } catch (e) { console.error('onCheckedOut failed', e); }
}

/** 08:00 daily: remind everyone due out today. The key includes the departure date, so an extended stay is reminded again on its new day. */
export async function queueCheckoutReminders() {
  const { start, end } = dayRange();
  const stays = await prisma.stay.findMany({
    where: { status: 'CHECKED_IN', expectedDeparture: { gte: start, lt: end }, guest: { whatsappOptIn: true } },
    include: { guest: true, room: true },
  });
  let queued = 0;
  for (const s of stays) {
    const ok = await enqueue({
      dedupeKey: `checkout-reminder:${s.id}:${ymd(s.expectedDeparture)}`, phone: s.guest.phone, template: 'checkout_reminder', guestId: s.guestId,
      params: [s.guest.firstName, s.room.number, clock(config.checkoutHour)],
    });
    if (ok) queued++;
  }
  return queued;
}

/**
 * 09:00 daily: a birthday greeting to opted-in guests. Off unless BIRTHDAY_GREETINGS=true, because the template
 * is a marketing message that Meta must approve first. One greeting per guest per year.
 */
export async function queueBirthdayGreetings(now = new Date()) {
  const month = now.getMonth() + 1, day = now.getDate();
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
  const days = month === 2 && day === 28 && !leap ? [28, 29] : [day]; // a 29 February birthday is greeted on 28 February in other years
  const guests = await prisma.guest.findMany({ where: { birthMonth: month, birthDay: { in: days }, whatsappOptIn: true, isBlacklisted: false } });
  let queued = 0;
  for (const g of guests) {
    if (await enqueue({ dedupeKey: `birthday:${g.id}:${now.getFullYear()}`, phone: g.phone, template: 'birthday_greeting', guestId: g.id, params: [g.firstName, config.hotelName] })) queued++;
  }
  return queued;
}
