// scripts/confirmPaidPending.ts
import { prisma } from '../src/lib/prisma';

async function main() {
  const r = await prisma.reservation.updateMany({
    where: { status: 'PENDING', deposit: { gt: 0 } },
    data: { status: 'CONFIRMED' },
  });
  console.log(`Confirmed ${r.count} reservations`);
}
main().finally(() => prisma.$disconnect());