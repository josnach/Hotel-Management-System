import { Prisma } from '@prisma/client';
import { config } from '../config';

/**
 * Generates a unique daily stock adjustment number.
 * Example: ADJ-20261111-0001
 */
export async function nextAdjustmentNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.hotelTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const dateParts = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const dateCode = date.replace(/-/g, '');

  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "AdjustmentNumberCounter"
      ("date", "lastNumber", "updatedAt")
    VALUES
      (${date}, 1, NOW())
    ON CONFLICT ("date")
    DO UPDATE SET
      "lastNumber" = "AdjustmentNumberCounter"."lastNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;

  const sequence = Number(rows[0]?.lastNumber);

  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Could not generate stock adjustment number');
  }

  return `ADJ-${dateCode}-${String(sequence).padStart(4, '0')}`;
}