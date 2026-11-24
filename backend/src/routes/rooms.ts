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
roomsRouter.get('/types', asyncHandler(async (_q, res) => res.json(
  await prisma.roomType.findMany({ include: { _count: { select: { rooms: true } } }, orderBy: { name: 'asc' } }),
)));
const typeBody = z.object({ name: z.string().min(1), description: z.string().optional(), nightlyRate: z.coerce.number().positive(), capacity: z.coerce.number().int().min(1) });
roomsRouter.post('/types', mgr, asyncHandler(async (req, res) => {
  const t = await prisma.roomType.create({ data: parse(typeBody, req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_TYPE_CREATE', entity: 'RoomType', entityId: t.id, meta: { name: t.name, nightlyRate: Number(t.nightlyRate) } });
  res.status(201).json(t);
}));

roomsRouter.get('/types/:id', asyncHandler(async (req, res) => {
  const t = await prisma.roomType.findUnique({
    where: { id: req.params.id },
    include: { rooms: { select: { id: true, number: true, status: true, floor: true }, orderBy: { number: 'asc' } } },
  });
  if (!t) throw new HttpError(404, 'Room type not found');
  res.json(t);
}));
roomsRouter.put('/types/:id', mgr, asyncHandler(async (req, res) => {
  const before = await prisma.roomType.findUniqueOrThrow({ where: { id: req.params.id } });
  const t = await prisma.roomType.update({ where: { id: req.params.id }, data: parse(typeBody.partial(), req.body) });
  await audit(prisma, { userId: req.user!.id, action: 'ROOM_TYPE_EDIT', entity: 'RoomType', entityId: t.id, meta: { name: t.name, rateFrom: Number(before.nightlyRate), rateTo: Number(t.nightlyRate) } });
  res.json(t);
}));
roomsRouter.delete('/types/:id', mgr, asyncHandler(async (req, res) => {
  const assigned = await prisma.room.count({ where: { roomTypeId: req.params.id } });
if (assigned > 0) throw new HttpError(409, `Cannot delete: ${assigned} room(s) assigned`);
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

// ───── Maintenance helpers ─────

/** Make sure a room in maintenance has exactly one open ticket. */
async function openMaintenanceTicket(roomId: string, roomNumber: string, note?: string) {
  const existing = await prisma.maintenanceTicket.findFirst({
    where: { roomId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.maintenanceTicket.create({
    data: {
      roomId,
      title: `Room ${roomNumber} set to maintenance`,
      description: note || null,
    },
  });
}

/** Close open tickets when the room goes back into service. */
async function closeMaintenanceTickets(roomId: string) {
  return prisma.maintenanceTicket.updateMany({
    where: { roomId, status: { not: 'RESOLVED' } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
}

/** Rooms already in maintenance before this feature existed get a ticket too. */
export async function syncMaintenanceRooms() {
  const rooms = await prisma.room.findMany({
    where: {
      status: 'MAINTENANCE',
      maintenance: { none: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
    },
    select: { id: true, number: true },
  });

  if (!rooms.length) return;

  await prisma.maintenanceTicket.createMany({
    data: rooms.map((r) => ({
      roomId: r.id,
      title: `Room ${r.number} set to maintenance`,
    })),
  });
}

// Status endpoint: receptionist, housekeeping and maintenance can all change it
roomsRouter.patch('/:id/status', roomStatus, asyncHandler(async (req, res) => {
  const { status, note } = parse(
    z.object({ status: z.nativeEnum(RoomStatus), note: z.string().trim().optional() }),
    req.body,
  );
  // A cleaner cannot release a room: they finish the task and a supervisor inspects it (see /housekeeping).
  if (req.user!.role === 'HOUSEKEEPING' && status === 'AVAILABLE') throw new HttpError(403, 'Finish the cleaning task on the Housekeeping board; the room is released after inspection');

  const before = await prisma.room.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { status: true },
  });

  const room = await prisma.room.update({ where: { id: req.params.id }, data: { status } });

  // Keep the Maintenance page in step with the room status.
  if (status === 'MAINTENANCE') await openMaintenanceTicket(room.id, room.number, note);
  else if (before.status === 'MAINTENANCE') await closeMaintenanceTickets(room.id);

  if (status === 'CLEANING') await createTask(prisma, room.id, 'MANUAL', 'Room marked for cleaning');
  if (status === 'AVAILABLE')
    await prisma.housekeepingTask.updateMany({ where: { roomId: room.id, type: { not: 'STAYOVER' }, status: { in: ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION'] } }, data: { status: 'CANCELLED', inspectionNote: 'Room released manually' } });
  res.json(room);
}));

// Maintenance tickets
export const maintenanceRouter = Router();
maintenanceRouter.get( '/',  ticketing,  asyncHandler(async (_q, res) => {
  await syncMaintenanceRooms();
  res.json(await prisma.maintenanceTicket.findMany({ include: { room: true }, orderBy: { createdAt: 'desc' } }));
}));
maintenanceRouter.post('/', ticketing, asyncHandler(async (req, res) => {
  const b = parse(z.object({ roomId: z.string().optional(), title: z.string().min(1), description: z.string().optional() }), req.body);
  const t = await prisma.$transaction(async (tx) => {
    if (b.roomId) await tx.room.update({ where: { id: b.roomId }, data: { status: 'MAINTENANCE' } });
    return tx.maintenanceTicket.create({ data: b });
  }, { maxWait: 20_000, timeout: 60_000 });
  res.status(201).json(t);
}));
maintenanceRouter.post('/:id/resolve', requireRole('MAINTENANCE'), asyncHandler(async (req, res) => {
  const t = await prisma.maintenanceTicket.update({ where: { id: req.params.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  if (t.roomId) {
    // Only release the room if no other ticket is still open for it.
    const stillOpen = await prisma.maintenanceTicket.count({
      where: { roomId: t.roomId, status: { not: 'RESOLVED' } },
    });
    if (!stillOpen) await prisma.room.update({ where: { id: t.roomId }, data: { status: 'AVAILABLE' } });
  }
  res.json(t);
}));