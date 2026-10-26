import { Router } from 'express';
import { z } from 'zod';
import { RoomStatus } from '@prisma/client';
import { asyncHandler, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { HttpError } from '../lib/http';
import { createTask } from '../services/housekeeping';

export const roomsRouter = Router();
/** Creating/editing rooms, room types and prices: ADMIN and MANAGER only (requireRole('MANAGER') lets ADMIN through too). */
const mgr = requireRole('MANAGER');
const roomStatus = requireRole('RECEPTIONIST', 'HOUSEKEEPING', 'MAINTENANCE');
const ticketing = requireRole('RECEPTIONIST', 'HOUSEKEEPING', 'MAINTENANCE');

// Room types
roomsRouter.get('/types', asyncHandler(async (_q, res) => res.json(await prisma.roomType.findMany({ orderBy: { name: 'asc' } }))));
const typeBody = z.object({ name: z.string().min(1), description: z.string().optional(), nightlyRate: z.coerce.number().positive(), capacity: z.coerce.number().int().min(1) });
roomsRouter.post('/types', mgr, asyncHandler(async (req, res) => {
  const t = await prisma.roomType.create({ data: parse(typeBody, req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_TYPE_CREATE', entity: 'RoomType', entityId: t.id, meta: { name: t.name, nightlyRate: Number(t.nightlyRate) } });
  res.status(201).json(t);
}));
roomsRouter.put('/types/:id', mgr, asyncHandler(async (req, res) => {
  const before = await prisma.roomType.findUniqueOrThrow({ where: { id: req.params.id } });
  const t = await prisma.roomType.update({ where: { id: req.params.id }, data: parse(typeBody.partial(), req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_TYPE_EDIT', entity: 'RoomType', entityId: t.id, meta: { name: t.name, rateFrom: Number(before.nightlyRate), rateTo: Number(t.nightlyRate) } });
  res.json(t);
}));
roomsRouter.delete('/types/:id', mgr, asyncHandler(async (req, res) => {
  const t = await prisma.roomType.delete({ where: { id: req.params.id } });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_TYPE_DELETE', entity: 'RoomType', entityId: t.id, meta: { name: t.name } });
  res.status(204).end();
}));

// Rooms grid with current occupant
roomsRouter.get('/', asyncHandler(async (req, res) => {
  const status = req.query.status as RoomStatus | undefined;
  const rooms = await prisma.room.findMany({
    where: status ? { status } : {},
    include: { roomType: true, stays: { where: { status: 'CHECKED_IN' }, include: { guest: true }, take: 1 } },
    orderBy: { number: 'asc' },
  });
  res.json(rooms.map(({ stays, ...r }) => ({ ...r, occupant: stays[0] ? { name: `${stays[0].guest.firstName} ${stays[0].guest.lastName}`, phone: stays[0].guest.phone } : null })));
}));
const roomBody = z.object({ number: z.string().min(1), roomTypeId: z.string(), rateOverride: z.coerce.number().positive().nullable().optional(), floor: z.coerce.number().int().optional() });
roomsRouter.post('/', mgr, asyncHandler(async (req, res) => {
  const r = await prisma.room.create({ data: parse(roomBody, req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_CREATE', entity: 'Room', entityId: r.id, meta: { number: r.number, rateOverride: r.rateOverride === null ? null : Number(r.rateOverride) } });
  res.status(201).json(r);
}));
roomsRouter.put('/:id', mgr, asyncHandler(async (req, res) => {
  const before = await prisma.room.findUniqueOrThrow({ where: { id: req.params.id } });
  const r = await prisma.room.update({ where: { id: req.params.id }, data: parse(roomBody.partial(), req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_EDIT', entity: 'Room', entityId: r.id, meta: { number: r.number, rateFrom: before.rateOverride === null ? null : Number(before.rateOverride), rateTo: r.rateOverride === null ? null : Number(r.rateOverride) } });
  res.json(r);
}));

// Status endpoint: receptionist, housekeeping and maintenance can all change it
roomsRouter.patch('/:id/status', roomStatus, asyncHandler(async (req, res) => {
  const { status } = parse(z.object({ status: z.nativeEnum(RoomStatus) }), req.body);
  // A cleaner cannot release a room: they finish the task and a supervisor inspects it (see /housekeeping).
  if (req.user!.role === 'HOUSEKEEPING' && status === 'AVAILABLE') throw new HttpError(403, 'Finish the cleaning task on the Housekeeping board; the room is released after inspection');
  const room = await prisma.room.update({ where: { id: req.params.id }, data: { status } });
  if (status === 'CLEANING') await createTask(prisma, room.id, 'MANUAL', 'Room marked for cleaning');
  if (status === 'AVAILABLE')
    await prisma.housekeepingTask.updateMany({ where: { roomId: room.id, type: { not: 'STAYOVER' }, status: { in: ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION'] } }, data: { status: 'CANCELLED', inspectionNote: 'Room released manually' } });
  res.json(room);
}));

// Maintenance tickets
export const maintenanceRouter = Router();
maintenanceRouter.get('/', asyncHandler(async (_q, res) => res.json(await prisma.maintenanceTicket.findMany({ include: { room: true }, orderBy: { createdAt: 'desc' } }))));
maintenanceRouter.post('/', ticketing, asyncHandler(async (req, res) => {
  const b = parse(z.object({ roomId: z.string().optional(), title: z.string().min(1), description: z.string().optional() }), req.body);
  const t = await prisma.$transaction(async (tx) => {
    if (b.roomId) await tx.room.update({ where: { id: b.roomId }, data: { status: 'MAINTENANCE' } });
    return tx.maintenanceTicket.create({ data: b });
  });
  res.status(201).json(t);
}));
maintenanceRouter.post('/:id/resolve', requireRole('MAINTENANCE'), asyncHandler(async (req, res) => {
  const t = await prisma.maintenanceTicket.update({ where: { id: req.params.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  if (t.roomId) await prisma.room.update({ where: { id: t.roomId }, data: { status: 'AVAILABLE' } });
  res.json(t);
}));