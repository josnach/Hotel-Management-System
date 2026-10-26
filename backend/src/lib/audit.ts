import { Prisma, Tx, prisma } from './prisma';

type Db = Tx | typeof prisma;

export interface AuditEntry {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string;
}

/** Write one audit-log row. Pass a transaction client to make it atomic with the change it records. */
export const audit = (db: Db, e: AuditEntry) =>
  db.auditLog.create({
    data: { userId: e.userId, action: e.action, entity: e.entity, entityId: e.entityId, meta: e.meta, ip: e.ip },
  });
