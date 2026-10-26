import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '../lib/prisma';

/** Four digits the guest types to unlock the room page. Given at check-in; wrong guesses lock the room for a while. */
export const newPin = () => String(randomInt(0, 10_000)).padStart(4, '0');

/** An unguessable id for a room's QR code (printed once, replaced if it leaks). */
export const newRoomToken = () => randomBytes(12).toString('base64url');

/** Gives every room a QR token and every in-house stay a PIN (older stays, created before this feature, have none). */
export async function ensurePortalCredentials() {
  for (const r of await prisma.room.findMany({ where: { qrToken: null }, select: { id: true } }))
    await prisma.room.update({ where: { id: r.id }, data: { qrToken: newRoomToken() } });
  for (const s of await prisma.stay.findMany({ where: { status: 'CHECKED_IN', portalPin: null }, select: { id: true } }))
    await prisma.stay.update({ where: { id: s.id }, data: { portalPin: newPin() } });
}

/** The Room Service menu: active items with a price, in stock (or makeable from ingredients). */
export async function roomServiceMenu() {
  const sp = await prisma.salesPoint.findUnique({ where: { name: 'Room Service' } });
  if (!sp || !sp.isActive) return { salesPointId: null as string | null, items: [] as any[] };
  const items = await prisma.inventoryItem.findMany({
    where: { salesPointId: sp.id, isActive: true, sellPrice: { gt: 0 } },
    include: { category: true, recipeLines: { include: { ingredient: true } } }, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });
  const out = items.map((i) => {
    const portions = i.recipeLines.length
      ? Math.min(...i.recipeLines.map((l) => (Number(l.quantity) > 0 ? Math.floor(Number(l.ingredient.quantity) / Number(l.quantity)) : Infinity)))
      : Number(i.quantity);
    return { id: i.id, name: i.name, category: i.category.name, price: Number(i.sellPrice), available: portions > 0 };
  });
  return { salesPointId: sp.id, items: out };
}
