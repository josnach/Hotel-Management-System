import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { createOrder } from '../services/orders';
import { ensurePortalCredentials, newRoomToken } from '../services/portal';

export const guestRequestsRouter = Router();
const staff = requireRole('RECEPTIONIST', 'WAITER'); // front desk and room-service staff (managers and admins pass too)
const manager = requireRole('MANAGER');

const shape = (r: any) => ({
  id: r.id, type: r.type, status: r.status, kind: r.kind, text: r.text, items: r.items, estimatedTotal: r.estimatedTotal === null ? null : Number(r.estimatedTotal),
  rating: r.rating, orderId: r.orderId, declineReason: r.declineReason, createdAt: r.createdAt, handledAt: r.handledAt,
  room: r.room.number, guest: `${r.stay.guest.firstName} ${r.stay.guest.lastName}`, stayActive: r.stay.status === 'CHECKED_IN',
});
const include = { room: true, stay: { include: { guest: true } } } as const;

guestRequestsRouter.get('/', staff, asyncHandler(async (req, res) => {
  const { scope } = parse(z.object({ scope: z.enum(['open', 'recent']).default('open') }), req.query);
  const rows = await prisma.guestRequest.findMany({
    where: { type: { not: 'FEEDBACK' }, ...(scope === 'open' ? { status: { in: ['NEW', 'ACCEPTED'] } } : { createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }) },
    include, orderBy: { createdAt: 'asc' }, take: 200,
  });
  res.json(rows.map(shape));
}));

/** Accepting a food order posts it to the guest's room bill through the normal POS path (stock, VAT, journal, folio). */
guestRequestsRouter.post('/:id/accept', staff, asyncHandler(async (req, res) => {
  const r = await prisma.guestRequest.findUnique({ where: { id: req.params.id }, include: { stay: true } });
  if (!r) throw new HttpError(404, 'Request not found');
  if (r.type !== 'ORDER' || r.status !== 'NEW') throw new HttpError(409, 'Only a new food order can be accepted');
  if (r.stay.status !== 'CHECKED_IN') throw new HttpError(409, 'This guest has checked out');
  const sp = await prisma.salesPoint.findUnique({ where: { name: 'Room Service' } });
  if (!sp) throw new HttpError(409, 'There is no Room Service sales point');
  const items = (r.items as { itemId: string; quantity: number }[]).map((i) => ({ itemId: i.itemId, quantity: i.quantity }));
  const order = await createOrder({
    customerType: 'GUEST', guestId: r.stay.guestId, salesPointId: sp.id, paymentMethod: 'ROOM_CHARGE', items,
    applyVat: r.stay.applyVat, applyServiceCharge: r.stay.applyServiceCharge, isComplimentary: false, isStaffCredit: false, payLater: false,
    instructions: r.text ?? undefined, notes: 'Ordered by the guest from the room QR page',
  }, req.user!.id, req.user!.role);
  await prisma.guestRequest.update({ where: { id: r.id }, data: { status: 'ACCEPTED', orderId: order.id, handledById: req.user!.id, handledAt: new Date() } });
  res.json({ orderNo: order.orderNo });
}));

guestRequestsRouter.post('/:id/decline', staff, asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(200) }), req.body);
  const r = await prisma.guestRequest.findUnique({ where: { id: req.params.id } });
  if (!r || r.status !== 'NEW') throw new HttpError(409, 'Only a new request can be declined');
  await prisma.guestRequest.update({ where: { id: r.id }, data: { status: 'DECLINED', declineReason: reason, handledById: req.user!.id, handledAt: new Date() } });
  res.json({ ok: true });
}));

/** Delivered (orders) or sorted (service requests). */
guestRequestsRouter.post('/:id/done', staff, asyncHandler(async (req, res) => {
  const r = await prisma.guestRequest.findUnique({ where: { id: req.params.id } });
  if (!r || !['NEW', 'ACCEPTED'].includes(r.status)) throw new HttpError(409, 'This request is already closed');
  if (r.type === 'ORDER' && r.status === 'NEW') throw new HttpError(409, 'Accept or decline the order first');
  await prisma.guestRequest.update({ where: { id: r.id }, data: { status: 'DONE', handledById: r.handledById ?? req.user!.id, handledAt: r.handledAt ?? new Date() } });
  res.json({ ok: true });
}));

guestRequestsRouter.get('/feedback', manager, asyncHandler(async (_q, res) => {
  const rows = await prisma.guestRequest.findMany({ where: { type: 'FEEDBACK' }, include, orderBy: { createdAt: 'desc' }, take: 200 });
  const rated = rows.filter((r) => r.rating);
  res.json({ count: rated.length, average: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null, rows: rows.map(shape) });
}));

/** Room QR links and the PIN of whoever is staying: what the front desk gives a guest at check-in. */
guestRequestsRouter.get('/credentials', staff, asyncHandler(async (_q, res) => {
  await ensurePortalCredentials();
  const rooms = await prisma.room.findMany({ orderBy: { number: 'asc' }, include: { stays: { where: { status: 'CHECKED_IN' }, take: 1, include: { guest: true } } } });
  res.json(rooms.map((r) => ({ id: r.id, number: r.number, url: `${config.appUrl}/room/${r.qrToken}`, guest: r.stays[0] ? `${r.stays[0].guest.firstName} ${r.stays[0].guest.lastName}` : null, pin: r.stays[0]?.portalPin ?? null })));
}));

/** Use when a printed QR has been photographed or stolen: the old link stops working at once. */
guestRequestsRouter.post('/rooms/:id/rotate-qr', manager, asyncHandler(async (req, res) => {
  const room = await prisma.room.update({ where: { id: req.params.id }, data: { qrToken: newRoomToken() } });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_QR_ROTATE', entity: 'Room', entityId: room.id, meta: { room: room.number } });
  res.json({ url: `${config.appUrl}/room/${room.qrToken}` });
}));
