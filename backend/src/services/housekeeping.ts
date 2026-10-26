import { HkTaskType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export interface CheckItem { label: string; done: boolean }

const FULL = ['Strip and remake the bed with fresh linen', 'Clean bathroom, toilet and shower', 'Replace towels and restock toiletries', 'Empty bins and replace liners', 'Dust and wipe all surfaces', 'Sweep, vacuum and mop the floor', 'Check lights, AC, TV and minibar', 'Check under the bed and drawers for lost items'];
const STAYOVER = ['Make the bed', 'Tidy the room and empty bins', 'Replace used towels and restock toiletries', 'Wipe bathroom surfaces'];

export const checklistFor = (type: HkTaskType): CheckItem[] => (type === 'STAYOVER' ? STAYOVER : FULL).map((label) => ({ label, done: false }));

/** Creates a cleaning task unless the room already has an open one. Returns the new task or null. */
export async function createTask(tx: Tx | typeof prisma, roomId: string, type: HkTaskType, notes?: string) {
  const open = await tx.housekeepingTask.findFirst({ where: { roomId, status: { in: ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION'] } } });
  if (open) return null;
  return tx.housekeepingTask.create({ data: { roomId, type, notes, checklist: checklistFor(type) as unknown as Prisma.InputJsonValue } });
}

/** Daily: a light "stayover" clean for every occupied room that is not leaving today. */
export async function generateStayoverTasks() {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const rooms = await prisma.room.findMany({ where: { status: 'OCCUPIED', stays: { some: { status: 'CHECKED_IN', expectedDeparture: { gt: end } } } }, select: { id: true } });
  let created = 0;
  for (const r of rooms) if (await createTask(prisma, r.id, 'STAYOVER')) created++;
  return created;
}
