import { prisma } from '../lib/prisma';
import { toWaNumber } from './phone';

export interface EnqueueInput {
  /** Unique per logical message. Re-enqueueing the same key is a no-op, so retries and double-clicks are harmless. */
  dedupeKey: string;
  phone: string;
  template: string;
  params: string[];
  guestId?: string;
  lang?: string;
  sendAfter?: Date;
}

/** Returns true if a new row was queued, false if skipped (bad number or already queued/sent). */
export async function enqueue(i: EnqueueInput): Promise<boolean> {
  const to = toWaNumber(i.phone);
  if (!to) return false;
  const existing = await prisma.messageOutbox.findUnique({ where: { dedupeKey: i.dedupeKey }, select: { id: true } });
  if (existing) return false;
  try {
    await prisma.messageOutbox.create({
      data: {
        dedupeKey: i.dedupeKey, toPhone: to, template: i.template, lang: i.lang ?? 'en', params: i.params,
        guestId: i.guestId, nextAttemptAt: i.sendAfter ?? new Date(),
      },
    });
    return true;
  } catch (e: any) {
    if (e?.code === 'P2002') return false; // lost a race with a concurrent enqueue of the same key
    throw e;
  }
}
