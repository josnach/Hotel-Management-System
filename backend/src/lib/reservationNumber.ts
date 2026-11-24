import { randomBytes } from 'node:crypto';

export function generateReservationNumber(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `RES-${year}${month}${day}-${randomBytes(8)
    .toString('hex')
    .toUpperCase()}`;
}