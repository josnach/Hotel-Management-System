import { PrismaClient, MenuSection } from '@prisma/client';
const prisma = new PrismaClient();

const map: Record<string, MenuSection> = {
  'Soft Drinks': 'DRINKS',
  'Spirits': 'DRINKS',
  'Beers': 'DRINKS',
  'Wines': 'DRINKS',
  'Pastry': 'PASTRIES',
  'Pastries': 'PASTRIES',
};

const foodExtras = ['Soups', 'Proteins', 'Pepper Soups', 'Native Foods']; // new categories you wanted

async function main() {
  for (const [name, section] of Object.entries(map)) {
    await prisma.inventoryCategory.updateMany({ where: { name }, data: { section } });
  }
  // create any missing starter categories (existing ones are left alone)
  const starters: [string, MenuSection][] = [
    ...foodExtras.map((n) => [n, 'FOOD'] as [string, MenuSection]),
    ['Spirits', 'DRINKS'], ['Beers', 'DRINKS'], ['Wines', 'DRINKS'],
  ];
  for (const [name, section] of starters) {
    await prisma.inventoryCategory.upsert({
      where: { section_name: { section, name } },
      update: {},
      create: { name, section },
    });
  }
}
main().finally(() => prisma.$disconnect());