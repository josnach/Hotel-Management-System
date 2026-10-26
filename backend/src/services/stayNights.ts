
import { config } from '../config';

/**
 * Returns the hotel-local calendar date as an integer day number.
 * This avoids treating a hotel night as a fixed 24-hour duration.
 */
function hotelDayNumber(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.hotelTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return Math.floor(
    Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000,
  );
}

/** Number of calendar-date nights between two instants, with a one-night minimum. */
export function nightsBetween(from: Date, to: Date): number {
  return Math.max(1, hotelDayNumber(to) - hotelDayNumber(from));
}

/**
 * Counts checkout boundaries passed after the expected departure date.
 * Intended for overdue-stay extension processing.
 */
export function overdueNights(expectedDeparture: Date, now: Date): number {
  const days = hotelDayNumber(now) - hotelDayNumber(expectedDeparture);

  if (days < 0) return 0;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.hotelTz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const checkoutMinutes = config.checkoutHour * 60;

  return Math.max(0, days + (hour * 60 + minute >= checkoutMinutes ? 1 : 0));
}
