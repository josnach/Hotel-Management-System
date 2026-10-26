import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { Prisma, prisma } from '../lib/prisma';
import { samePhone } from '../messaging/phone';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Refuses a booking or check-in for a blacklisted guest. A known guest is checked by id; a new registration is checked by
 * ID number, email and phone, so a blacklisted guest cannot simply be registered again under a fresh profile.
 */
export async function assertNotBlacklisted(db: Db, who: { guestId?: string; phone?: string; idNumber?: string; email?: string }, userId?: string) {
  const list = await db.guest.findMany({ where: { isBlacklisted: true }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, idNumber: true, blacklistReason: true } });
  if (!list.length) return;
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
  const hit = list.find((g) =>
    (who.guestId && g.id === who.guestId) ||
    (norm(who.idNumber) && norm(who.idNumber) === norm(g.idNumber)) ||
    (norm(who.email) && norm(who.email) === norm(g.email)) ||
    (who.phone && samePhone(who.phone, g.phone)));
  if (!hit) return;
  const sameProfile = who.guestId === hit.id;
  await audit(prisma, { userId, action: 'BLACKLIST_BLOCKED', entity: 'Guest', entityId: hit.id, meta: { name: `${hit.firstName} ${hit.lastName}`, matchedBy: sameProfile ? 'profile' : 'details' } });
  throw new HttpError(403, `${sameProfile ? `${hit.firstName} ${hit.lastName} is` : `These details match ${hit.firstName} ${hit.lastName}, who is`} on the hotel's blacklist${hit.blacklistReason ? ` (${hit.blacklistReason})` : ''}. A manager must remove the blacklist before this guest can be booked.`);
}

const DAY = 86_400_000;
const num = (v: unknown) => Number(v ?? 0);

/** Visits, nights, total billed and last stay for a set of guests. */
export async function guestStats(ids: string[]) {
  if (!ids.length) return new Map<string, { visits: number; nights: number; totalBilled: number; lastStay: Date | null; firstStay: Date | null }>();
  const [stays, folios] = await Promise.all([
    prisma.stay.findMany({ where: { guestId: { in: ids } }, select: { guestId: true, checkInAt: true, checkOutAt: true, expectedDeparture: true } }),
    prisma.folio.findMany({ where: { guestId: { in: ids } }, select: { id: true, guestId: true } }),
  ]);
  const billed = await prisma.folioTransaction.groupBy({ by: ['folioId'], where: { folioId: { in: folios.map((f) => f.id) } }, _sum: { bill: true } });
  const byFolio = new Map(billed.map((b) => [b.folioId, num(b._sum.bill)]));
  const out = new Map<string, { visits: number; nights: number; totalBilled: number; lastStay: Date | null; firstStay: Date | null }>();
  for (const id of ids) out.set(id, { visits: 0, nights: 0, totalBilled: 0, lastStay: null, firstStay: null });
  for (const s of stays) {
    const o = out.get(s.guestId)!;
    o.visits++;
    o.nights += Math.max(1, Math.round(((s.checkOutAt ?? s.expectedDeparture).getTime() - s.checkInAt.getTime()) / DAY));
    if (!o.lastStay || s.checkInAt > o.lastStay) o.lastStay = s.checkInAt;
    if (!o.firstStay || s.checkInAt < o.firstStay) o.firstStay = s.checkInAt;
  }
  for (const f of folios) if (f.guestId) out.get(f.guestId)!.totalBilled += byFolio.get(f.id) ?? 0;
  for (const o of out.values()) o.totalBilled = Math.round(o.totalBilled * 100) / 100;
  return out;
}

/** Days until the next occurrence of a month/day birthday (0 = today). 29 February is celebrated on 28 February in other years. */
export function daysUntilBirthday(month: number, day: number, from = new Date()) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const at = (year: number) => { const leap = new Date(year, 1, 29).getMonth() === 1; return new Date(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day); };
  let next = at(today.getFullYear());
  if (next < today) next = at(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}

/** True when a month/day pair is a real calendar date (29 February is allowed). */
export const validBirthday = (month: number, day: number) => month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate();
