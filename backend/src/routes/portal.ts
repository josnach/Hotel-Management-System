import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { signPortalSession, verifyPortalSession } from '../messaging/signing';
import { createTask } from '../services/housekeeping';
import { roomServiceMenu } from '../services/portal';

/**
 * Public routes behind the room QR code. Anyone can see the menu; everything else needs the stay's PIN,
 * and nothing is charged until a staff member accepts an order.
 */
export const portalRouter = Router();
portalRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
portalRouter.use((_q, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });

const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
const attempts = new Map<string, { n: number; until: number }>(); // per room; resets on restart, which only helps the guest

const roomByToken = async (token: string) => {
  const room = await prisma.room.findUnique({ where: { qrToken: token } });
  if (!room) throw new HttpError(404, 'This QR code is not valid. Please ask the front desk.');
  return room;
};

portalRouter.get('/rooms/:token', asyncHandler(async (req, res) => {
  const room = await roomByToken(req.params.token);
  const menu = await roomServiceMenu();
  res.json({ hotelName: config.hotelName, room: { number: room.number }, menu: menu.items });
}));

portalRouter.post('/rooms/:token/unlock', asyncHandler(async (req, res) => {
  const { pin } = parse(z.object({ pin: z.string().regex(/^\d{4}$/) }), req.body);
  const room = await roomByToken(req.params.token);
  const a = attempts.get(room.id);
  if (a && a.n >= MAX_FAILS && a.until > Date.now()) throw new HttpError(429, 'Too many wrong tries. Please wait a few minutes or ask the front desk.');
  const stay = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' }, include: { guest: true } });
  const good = !!stay?.portalPin && timingSafeEqual(Buffer.from(stay.portalPin), Buffer.from(pin));
  if (!good || !stay) {
    const n = (a && a.until > Date.now() ? a.n : 0) + 1;
    attempts.set(room.id, { n, until: Date.now() + LOCK_MS });
    throw new HttpError(401, 'That PIN is not right. You can get it from the front desk.');
  }
  attempts.delete(room.id);
  res.json({ session: signPortalSession(stay.id), guestName: stay.guest.firstName, checkOut: stay.expectedDeparture });
}));

// ───────────── Everything below needs a session ─────────────
const GRACE_MS = 72 * 3_600_000; // after checkout a guest can still see the final bill and leave feedback
async function session(req: Request, res: Response, next: NextFunction) {
  try {
    const stayId = verifyPortalSession((req.header('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    if (!stayId) throw new HttpError(401, 'Please enter your PIN again');
    const stay = await prisma.stay.findUnique({ where: { id: stayId }, include: { guest: true, room: true, folio: true } });
    if (!stay) throw new HttpError(401, 'Please enter your PIN again');
    const live = stay.status === 'CHECKED_IN';
    if (!live && !(stay.checkOutAt && Date.now() - stay.checkOutAt.getTime() < GRACE_MS)) throw new HttpError(401, 'This stay has ended');
    res.locals.stay = stay; res.locals.live = live;
    next();
  } catch (e) { next(e); }
}
const needLive = (res: Response) => { if (!res.locals.live) throw new HttpError(409, 'You have checked out, so new requests are closed. You can still view your bill and leave feedback.'); };
portalRouter.use(session);

portalRouter.get('/me', asyncHandler(async (_q, res) => {
  const stay = res.locals.stay;
  const [txs, reqs] = await Promise.all([
    stay.folio ? prisma.folioTransaction.findMany({ where: { folioId: stay.folio.id }, orderBy: { createdAt: 'asc' } }) : [],
    prisma.guestRequest.findMany({ where: { stayId: stay.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  let bal = D(0);
  const lines = txs.map((t) => { bal = bal.plus(t.bill).minus(t.payment); return { date: t.createdAt, description: t.description, charge: Number(t.bill), payment: Number(t.payment) }; });
  res.json({
    guestName: stay.guest.firstName, room: stay.room.number, live: res.locals.live, checkOut: stay.expectedDeparture,
    folio: { lines, balance: Number(bal) },
    requests: reqs.map((r) => ({ id: r.id, type: r.type, status: r.status, kind: r.kind, text: r.text, items: r.items, estimatedTotal: r.estimatedTotal === null ? null : Number(r.estimatedTotal), rating: r.rating, declineReason: r.declineReason, createdAt: r.createdAt })),
  });
}));

portalRouter.post('/orders', asyncHandler(async (req, res) => {
  needLive(res);
  const b = parse(z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().int().min(1).max(10) })).min(1).max(15), notes: z.string().trim().max(300).optional() }), req.body);
  const stay = res.locals.stay;
  if ((await prisma.guestRequest.count({ where: { stayId: stay.id, type: 'ORDER', status: 'NEW' } })) >= 3) throw new HttpError(429, 'You already have orders waiting for confirmation. Please wait for the front desk.');
  const menu = await roomServiceMenu();
  const lines = b.items.map((i) => {
    const it = menu.items.find((m) => m.id === i.itemId);
    if (!it || !it.available) throw new HttpError(409, `${it?.name ?? 'An item'} is not available right now`);
    return { itemId: it.id, name: it.name, quantity: i.quantity, price: it.price };
  });
  const r = await prisma.guestRequest.create({ data: { stayId: stay.id, roomId: stay.roomId, type: 'ORDER', items: lines, text: b.notes, estimatedTotal: lines.reduce((s, l) => s + l.price * l.quantity, 0) } });
  res.status(201).json({ id: r.id, estimatedTotal: Number(r.estimatedTotal) });
}));

const KINDS = ['CLEAN_ROOM', 'TOWELS', 'TOILETRIES', 'MAINTENANCE', 'LATE_CHECKOUT', 'OTHER'] as const;
portalRouter.post('/requests', asyncHandler(async (req, res) => {
  needLive(res);
  const b = parse(z.object({ kind: z.enum(KINDS), text: z.string().trim().max(300).optional() }), req.body);
  const stay = res.locals.stay;
  if ((await prisma.guestRequest.count({ where: { stayId: stay.id, type: 'SERVICE', status: 'NEW' } })) >= 5) throw new HttpError(429, 'You already have several requests open. The front desk will be with you shortly.');
  const r = await prisma.guestRequest.create({ data: { stayId: stay.id, roomId: stay.roomId, type: 'SERVICE', kind: b.kind, text: b.text } });
  if (b.kind === 'CLEAN_ROOM') await createTask(prisma, stay.roomId, 'STAYOVER', 'Guest asked for the room to be cleaned'); // shows on the housekeeping board
  res.status(201).json({ id: r.id });
}));

portalRouter.post('/feedback', asyncHandler(async (req, res) => {
  const b = parse(z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }), req.body);
  const stay = res.locals.stay;
  const prev = await prisma.guestRequest.findFirst({ where: { stayId: stay.id, type: 'FEEDBACK' } });
  if (prev) await prisma.guestRequest.update({ where: { id: prev.id }, data: { rating: b.rating, text: b.comment } });
  else await prisma.guestRequest.create({ data: { stayId: stay.id, roomId: stay.roomId, type: 'FEEDBACK', status: 'DONE', rating: b.rating, text: b.comment } });
  res.status(201).json({ ok: true });
}));

portalRouter.post('/requests/:id/cancel', asyncHandler(async (req, res) => {
  const r = await prisma.guestRequest.findFirst({ where: { id: req.params.id, stayId: res.locals.stay.id } });
  if (!r) throw new HttpError(404, 'Request not found');
  if (r.status !== 'NEW') throw new HttpError(409, 'The front desk has already picked this up. Please call them to change it.');
  await prisma.guestRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
  res.json({ ok: true });
}));
