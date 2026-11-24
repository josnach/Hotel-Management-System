// scripts/backfillEmployeeNumbers.ts
import { prisma } from '../src/lib/prisma';

async function main() {
  const rows = await prisma.employee.findMany({
    where: { employeeNumber: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });
  const counters: Record<number, number> = {};
  for (const r of rows) {
    const year = r.createdAt.getFullYear();
    if (counters[year] === undefined) {
      const last = await prisma.employee.findFirst({
        where: { employeeNumber: { startsWith: `EMP-${year}-` } },
        orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true },
      });
      counters[year] = last?.employeeNumber ? parseInt(last.employeeNumber.slice(9), 10) : 0;
    }
    counters[year] += 1;
    await prisma.employee.update({
      where: { id: r.id },
      data: { employeeNumber: `EMP-${year}-${String(counters[year]).padStart(5, '0')}` },
    });
  }
  console.log(`Backfilled ${rows.length} employees`);
}
main().finally(() => prisma.$disconnect());