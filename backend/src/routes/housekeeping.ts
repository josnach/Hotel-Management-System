import { Router } from 'express';
import { z } from 'zod';
import { HkTaskStatus, Prisma } from '@prisma/client';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { CheckItem, createTask } from '../services/housekeeping';

export const housekeepingRouter = Router();
const board = requireRole('RECEPTIONIST', 'HOUSEKEEPING'); // see the board and do cleaning work
const frontDesk = requireRole('RECEPTIONIST');              // assign, inspect, cancel, add tasks (managers and admins pass too)

const OPEN: HkTaskStatus[] = ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION'];
const isSupervisor = (role?: string) => role === 'ADMIN' || role === 'MANAGER';
const include = { room: { include: { roomType: { select: { name: true } } } }, assignedTo: { select: { id: true, fullName: true, username: true } } } satisfies Prisma.HousekeepingTaskInclude;
const mins = (a?: Date | null, b?: Date | null) => (a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)) : null);

const shape = (t: any) => ({
  id: t.id, type: t.type, status: t.status, notes: t.notes, reworkCount: t.reworkCount, inspectionNote: t.inspectionNote,
  checklist: t.checklist as CheckItem[], createdAt: t.createdAt, startedAt: t.startedAt, finishedAt: t.finishedAt, inspectedAt: t.inspectedAt,
  room: { id: t.room.id, number: t.room.number, floor: t.room.floor, type: t.room.roomType.name, status: t.room.status },
  assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.fullName ?? t.assignedTo.username } : null,
  cleaningMinutes: mins(t.startedAt, t.finishedAt),
});

async function load(id: string) {
  const t = await prisma.housekeepingTask.findUnique({ where: { id }, include });
  if (!t) throw new HttpError(404, 'Task not found');
  return t;
}
/** Cleaners can only act on their own task (or an unassigned one, which they take). Supervisors can act on any. */
function mayWork(t: { assignedToId: string | null }, user: { id: string; role: string }) {
  if (isSupervisor(user.role)) return;
  if (t.assignedToId && t.assignedToId !== user.id) throw new HttpError(403, 'This task is assigned to someone else');
}

// ───────────── Board ─────────────
/** Open tasks plus what finished today. Cleaners see only their own and unassigned tasks. */
housekeepingRouter.get('/board', board, asyncHandler(async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const mine: Prisma.HousekeepingTaskWhereInput = req.user!.role === 'HOUSEKEEPING' ? { OR: [{ assignedToId: req.user!.id }, { assignedToId: null }] } : {};
  const tasks = await prisma.housekeepingTask.findMany({
    where: { AND: [mine, { OR: [{ status: { in: OPEN } }, { status: 'DONE', OR: [{ inspectedAt: { gte: start } }, { finishedAt: { gte: start } }] }] }] },
    include, orderBy: [{ createdAt: 'asc' }],
  });
  res.json(tasks.map(shape));
}));

housekeepingRouter.get('/staff', frontDesk, asyncHandler(async (_q, res) => {
  const users = await prisma.user.findMany({ where: { role: 'HOUSEKEEPING', isActive: true }, select: { id: true, fullName: true, username: true, hkAssigned: { where: { status: { in: OPEN } }, select: { id: true } } }, orderBy: { fullName: 'asc' } });
  res.json(users.map((u) => ({ id: u.id, name: u.fullName ?? u.username, openTasks: u.hkAssigned.length })));
}));

// ───────────── Create / assign ─────────────
housekeepingRouter.post('/tasks', frontDesk, asyncHandler(async (req, res) => {
  const b = parse(z.object({ roomId: z.string(), notes: z.string().trim().max(300).optional() }), req.body);
  const room = await prisma.room.findUnique({ where: { id: b.roomId } });
  if (!room) throw new HttpError(404, 'Room not found');
  const t = await createTask(prisma, room.id, 'MANUAL', b.notes);
  if (!t) throw new HttpError(409, 'This room already has an open cleaning task');
  if (room.status === 'AVAILABLE') await prisma.room.update({ where: { id: room.id }, data: { status: 'CLEANING' } }); // keep it from being sold meanwhile
  res.status(201).json(shape(await load(t.id)));
}));

housekeepingRouter.post('/tasks/:id/assign', frontDesk, asyncHandler(async (req, res) => {
  const { userId } = parse(z.object({ userId: z.string().nullable() }), req.body);
  const t = await load(req.params.id);
  if (!['PENDING', 'IN_PROGRESS'].includes(t.status)) throw new HttpError(409, 'Only tasks that have not been finished can be assigned');
  if (userId) {
    const u = await prisma.user.findFirst({ where: { id: userId, role: 'HOUSEKEEPING', isActive: true } });
    if (!u) throw new HttpError(400, 'Choose an active housekeeping staff member');
  }
  await prisma.housekeepingTask.update({ where: { id: t.id }, data: { assignedToId: userId, assignedAt: userId ? new Date() : null } });
  res.json(shape(await load(t.id)));
}));

// ───────────── Cleaning work ─────────────
housekeepingRouter.post('/tasks/:id/start', board, asyncHandler(async (req, res) => {
  const t = await load(req.params.id);
  mayWork(t, req.user!);
  if (t.status !== 'PENDING') throw new HttpError(409, 'This task has already been started');
  const assignedToId = t.assignedToId ?? (req.user!.role === 'HOUSEKEEPING' ? req.user!.id : null);
  await prisma.housekeepingTask.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), assignedToId, assignedAt: t.assignedToId ? t.assignedAt : assignedToId ? new Date() : null } });
  res.json(shape(await load(t.id)));
}));

housekeepingRouter.post('/tasks/:id/check', board, asyncHandler(async (req, res) => {
  const { index, done } = parse(z.object({ index: z.number().int().min(0), done: z.boolean() }), req.body);
  const t = await load(req.params.id);
  mayWork(t, req.user!);
  if (t.status !== 'IN_PROGRESS') throw new HttpError(409, 'Start the task before ticking the checklist');
  const list = t.checklist as unknown as CheckItem[];
  if (!list[index]) throw new HttpError(400, 'No such checklist item');
  list[index].done = done;
  await prisma.housekeepingTask.update({ where: { id: t.id }, data: { checklist: list as unknown as Prisma.InputJsonValue } });
  res.json(shape(await load(t.id)));
}));

housekeepingRouter.post('/tasks/:id/finish', board, asyncHandler(async (req, res) => {
  const b = parse(z.object({ notes: z.string().trim().max(300).optional() }), req.body);
  const t = await load(req.params.id);
  mayWork(t, req.user!);
  if (t.status !== 'IN_PROGRESS') throw new HttpError(409, 'Only a task in progress can be finished');
  const left = (t.checklist as unknown as CheckItem[]).filter((c) => !c.done).length;
  if (left) throw new HttpError(400, `${left} checklist item${left > 1 ? 's' : ''} still to do`);
  const notes = [t.notes, b.notes && `Cleaner: ${b.notes}`].filter(Boolean).join(' | ') || null; // e.g. lost property found
  // A light stayover clean needs no inspection; a checkout clean waits for a supervisor.
  await prisma.housekeepingTask.update({ where: { id: t.id }, data: { status: t.type === 'STAYOVER' ? 'DONE' : 'READY_FOR_INSPECTION', finishedAt: new Date(), notes } });
  res.json(shape(await load(t.id)));
}));

// ───────────── Inspection ─────────────
housekeepingRouter.post('/tasks/:id/inspect', frontDesk, asyncHandler(async (req, res) => {
  const b = parse(z.object({ pass: z.boolean(), note: z.string().trim().max(300).optional() }), req.body);
  const t = await load(req.params.id);
  if (t.status !== 'READY_FOR_INSPECTION') throw new HttpError(409, 'This task is not waiting for inspection');
  if (t.assignedToId === req.user!.id) throw new HttpError(403, 'You cannot inspect your own work');
  if (!b.pass && !b.note) throw new HttpError(400, 'Say what needs to be redone');
  await prisma.$transaction(async (tx) => {
    if (b.pass) {
      await tx.housekeepingTask.update({ where: { id: t.id }, data: { status: 'DONE', inspectedAt: new Date(), inspectedById: req.user!.id, inspectionNote: b.note ?? null } });
      // Release the room only if it is still waiting to be cleaned (never override maintenance or an occupied room).
      if (t.room.status === 'CLEANING') await tx.room.update({ where: { id: t.roomId }, data: { status: 'AVAILABLE' } });
    } else {
      await tx.housekeepingTask.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', finishedAt: null, reworkCount: { increment: 1 }, inspectionNote: b.note, inspectedById: req.user!.id } });
    }
    await audit(tx, { userId: req.user!.id, action: b.pass ? 'HK_INSPECT_PASS' : 'HK_INSPECT_FAIL', entity: 'HousekeepingTask', entityId: t.id, meta: { room: t.room.number, note: b.note ?? null, cleaner: t.assignedToId } });
  });
  res.json(shape(await load(t.id)));
}));

housekeepingRouter.post('/tasks/:id/cancel', frontDesk, asyncHandler(async (req, res) => {
  const t = await load(req.params.id);
  if (!OPEN.includes(t.status)) throw new HttpError(409, 'This task is already closed');
  await prisma.housekeepingTask.update({ where: { id: t.id }, data: { status: 'CANCELLED', inspectionNote: 'Cancelled by ' + (req.user!.username ?? 'staff') } });
  res.json({ ok: true });
}));

// ───────────── Metrics ─────────────
housekeepingRouter.get('/metrics', frontDesk, asyncHandler(async (req, res) => {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
  const done = await prisma.housekeepingTask.findMany({ where: { status: 'DONE', finishedAt: { gte: from, lt: to } }, include: { assignedTo: { select: { id: true, fullName: true, username: true } } } });
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const clean = (ts: typeof done) => ts.map((t) => mins(t.startedAt, t.finishedAt)).filter((x): x is number => x !== null);
  const checkout = done.filter((t) => t.type === 'CHECKOUT_CLEAN');
  const turnaround = checkout.map((t) => mins(t.createdAt, t.inspectedAt)).filter((x): x is number => x !== null); // checkout to room ready
  const byUser = new Map<string, typeof done>();
  for (const t of done) { const k = t.assignedToId ?? 'none'; byUser.set(k, [...(byUser.get(k) ?? []), t]); }
  const inspected = done.filter((t) => t.type !== 'STAYOVER');
  res.json({
    from, to, tasksDone: done.length,
    avgCleaningMinutes: avg(clean(checkout)), avgTurnaroundMinutes: avg(turnaround),
    reworkRate: inspected.length ? Math.round((inspected.filter((t) => t.reworkCount > 0).length / inspected.length) * 100) : 0,
    staff: [...byUser.entries()].map(([id, ts]) => ({
      id, name: ts[0].assignedTo ? (ts[0].assignedTo.fullName ?? ts[0].assignedTo.username) : 'Unassigned', tasks: ts.length,
      avgCleaningMinutes: avg(clean(ts.filter((t) => t.type === 'CHECKOUT_CLEAN'))),
      reworks: ts.filter((t) => t.reworkCount > 0).length,
    })).sort((a, b) => b.tasks - a.tasks),
  });
}));
