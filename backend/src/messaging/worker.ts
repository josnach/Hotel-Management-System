import cron from 'node-cron';
import { config, whatsappConfigured } from '../config';
import { prisma } from '../lib/prisma';
import { metaProvider } from './meta';
import { SendError } from './provider';
import { queueBirthdayGreetings, queueCheckoutReminders } from './triggers';
import { queueOwnerDigests } from './digest';

const MAX_ATTEMPTS = 5;
const STUCK_AFTER_MS = 5 * 60_000;
let running = false;

/** Sends due messages. Safe to call concurrently (a run in progress makes the next call a no-op). */
export async function drainOutbox() {
  if (running || !whatsappConfigured()) return;
  running = true;
  try {
    // A crash mid-send leaves rows in SENDING forever; put them back in the queue.
    await prisma.messageOutbox.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      data: { status: 'QUEUED' },
    });
    const batch = await prisma.messageOutbox.findMany({
      where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' }, take: 25,
    });
    for (const msg of batch) {
      const claimed = await prisma.messageOutbox.updateMany({ where: { id: msg.id, status: 'QUEUED' }, data: { status: 'SENDING' } });
      if (claimed.count === 0) continue; // another instance took it

      // Consent can be withdrawn between queueing and sending (e.g. guest replies STOP).
      if (msg.guestId) {
        const g = await prisma.guest.findUnique({ where: { id: msg.guestId }, select: { whatsappOptIn: true } });
        if (!g?.whatsappOptIn) {
          await prisma.messageOutbox.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Guest has not opted in to WhatsApp' } });
          continue;
        }
      }
      try {
        const { providerMsgId } = await metaProvider.send({ to: msg.toPhone, template: msg.template, lang: msg.lang, params: msg.params as string[] });
        await prisma.messageOutbox.update({ where: { id: msg.id }, data: { status: 'SENT', providerMsgId, attempts: { increment: 1 }, error: null } });
      } catch (e) {
        const err = e instanceof SendError ? e : new SendError((e as Error).message, true);
        const attempts = msg.attempts + 1;
        const giveUp = !err.retryable || attempts >= MAX_ATTEMPTS;
        await prisma.messageOutbox.update({
          where: { id: msg.id },
          data: {
            status: giveUp ? 'FAILED' : 'QUEUED', attempts, error: err.message.slice(0, 500),
            nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000), // 2, 4, 8, 16 minutes
          },
        });
      }
    }
  } finally {
    running = false;
  }
}

export function startMessagingJobs() {
  if (!whatsappConfigured()) console.warn('WhatsApp is not configured (WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN): messages will queue but not send.');
  const timezone = config.hotelTz;
  const safe = (name: string, fn: () => Promise<unknown>) => () => { fn().catch((e) => console.error(`${name} failed`, e)); };
  cron.schedule('* * * * *', safe('drainOutbox', drainOutbox), { timezone });
  cron.schedule('0 8 * * *', safe('queueCheckoutReminders', queueCheckoutReminders), { timezone });
  if (process.env.BIRTHDAY_GREETINGS === 'true') cron.schedule('0 9 * * *', safe('queueBirthdayGreetings', () => queueBirthdayGreetings()), { timezone });
  cron.schedule('0 * * * *', safe('queueOwnerDigests', () => queueOwnerDigests()), { timezone });
}
