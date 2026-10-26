import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export { Prisma };
