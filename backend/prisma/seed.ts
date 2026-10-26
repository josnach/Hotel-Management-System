
import bcrypt from 'bcryptjs';
import { PrismaClient, AccountType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNTS: [string, string, AccountType, string, boolean][] = [
  ['110000', 'Cash on Hand', 'ASSET', 'Current Assets', true],
  ['120000', 'Bank Accounts', 'ASSET', 'Current Assets', true],
  ['140000', 'Accounts Receivable', 'ASSET', 'Receivables', true],
  ['141000', 'City Ledger Receivable', 'ASSET', 'Receivables', true],
  ['150000', 'Inventory', 'ASSET', 'Current Assets', true],
  ['210000', 'VAT Payable', 'LIABILITY', 'Taxes', true],
  ['220000', 'Service Charge Payable', 'LIABILITY', 'Taxes', true],
  ['230000', 'Guest Deposits', 'LIABILITY', 'Deposits', true],
  ['240000', 'Salaries & Payables', 'LIABILITY', 'Payables', true],
  ['241000', 'PAYE Payable', 'LIABILITY', 'Taxes', true],
  ['242000', 'Pension Payable', 'LIABILITY', 'Payables', true],
  ['243000', 'NHF Payable', 'LIABILITY', 'Payables', true],
  ['244000', 'NSITF and ITF Payable', 'LIABILITY', 'Payables', true],
  ['310000', "Owner's Equity", 'EQUITY', 'Equity', true],
  ['400000', 'Room Revenue', 'REVENUE', 'Rooms', true],
  ['410000', 'Food & Beverage Revenue', 'REVENUE', 'F&B', true],
  ['420000', 'Other Revenue', 'REVENUE', 'Other', true],
  ['510000', 'Salaries and Wages', 'EXPENSE', 'Personnel', true],
  ['511500', 'Employer Pension Contribution', 'EXPENSE', 'Personnel', false],
  ['511600', 'NSITF and ITF Contributions', 'EXPENSE', 'Personnel', true],
  ['512000', 'Employee Benefits', 'EXPENSE', 'Personnel', false],
  ['520000', 'Administrative Costs', 'EXPENSE', 'Admin', false],
  ['521000', 'Utilities', 'EXPENSE', 'Admin', false],
  ['521100', 'Diesel and Generator Fuel', 'EXPENSE', 'Admin', false],
  ['522000', 'Office Supplies', 'EXPENSE', 'Admin', false],
  ['523000', 'Marketing Expenses', 'EXPENSE', 'Marketing', false],
  ['524000', 'Repairs and Maintenance', 'EXPENSE', 'Maintenance', false],
  ['530000', 'Cost of Goods Sold', 'EXPENSE', 'Cogs', true],
  ['540000', 'Depreciation and Amortization', 'EXPENSE', 'Depreciation', false],
  ['550000', 'Insurance', 'EXPENSE', 'Insurance', false],
  ['560000', 'Professional Fees', 'EXPENSE', 'Professional', false],
  ['570000', 'Travel and Entertainment', 'EXPENSE', 'Travel', false],
  ['580000', 'Complimentary Expense', 'EXPENSE', 'Complimentary', true],
];

async function main() {
  const hash = await bcrypt.hash('Password123!', 10);

  // 1. Seed demo users
  const users: [string, string, UserRole][] = [
    ['admin', 'admin@hotel.com', 'ADMIN'],
    ['manager', 'manager@hotel.com', 'MANAGER'],
    ['reception', 'reception@hotel.com', 'RECEPTIONIST'],
    ['housekeeping', 'housekeeping@hotel.com', 'HOUSEKEEPING'],
    ['waiter', 'waiter@hotel.com', 'WAITER'],
    ['chef', 'chef@hotel.com', 'CHEF'],
    ['accountant', 'accountant@hotel.com', 'ACCOUNTANT'],
    ['storekeeper', 'storekeeper@hotel.com', 'STOREKEEPER'],
    ['maintenance', 'maintenance@hotel.com', 'MAINTENANCE'],
  ];

  for (const [username, email, role] of users) {
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        email,
        role,
        passwordHash: hash,
        fullName: username === 'admin' ? 'Hotel Admin' : username,
      },
    });
  }

  // 2. Seed chart of accounts
  for (const [code, name, type, category, isSystem] of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code },
      update: {},
      create: { code, name, type, category, isSystem },
    });
  }

  // 3. Seed room types
  const types = [
    ['Single', 'Basic room with essential amenities', 15000, 2],
    ['Hilltop', 'Spacious room with upgraded amenities', 25000, 2],
    ['Deluxe', 'Luxurious suite with separate living area', 40000, 3],
    ['Mini Suite', 'Premium suite with executive amenities', 60000, 3],
    ['2-Bedroom Apartment', 'Luxury suite with premium services', 100000, 4],
    ['2-Bedroom Bungalow', 'Spacious room with upgraded amenities', 120000, 4],
  ] as const;

  const tmap: Record<string, string> = {};

  for (const [name, description, nightlyRate, capacity] of types) {
    const roomType = await prisma.roomType.upsert({
      where: { name },
      update: {},
      create: { name, description, nightlyRate, capacity },
    });

    tmap[name] = roomType.id;
  }

  // 4. Seed rooms
const order = [
  'Single',
  'Hilltop',
  'Deluxe',
  'Mini Suite',
  '2-Bedroom Apartment',
  '2-Bedroom Bungalow',
];

const numbers = [
  ...range(101, 112),
  ...range(201, 213),
  ...range(301, 312),
];

for (const [i, n] of numbers.entries()) {
  const roomTypeName = order[i % order.length];
  const roomTypeId = tmap[roomTypeName];

  if (!roomTypeId) {
    throw new Error(
      `Missing room type ID for "${roomTypeName}". ` +
      `Available room types: ${Object.keys(tmap).join(', ')}`,
    );
  }

  await prisma.room.upsert({
    where: { number: String(n) },
    update: {},
    create: {
      number: String(n),
      roomType: {
        connect: { id: roomTypeId },
      },
      floor: Math.floor(n / 100),
    },
  });
}

  // 5. Seed sales points
  const spNames = [
    'Frontdesk',
    'Chys Restaurant',
    'Hilltop Bar',
    'Pool Bar',
    'Room Service',
    'Other Revenue',
  ];

  const sp: Record<string, string> = {};

  for (const name of spNames) {
    const salesPoint = await prisma.salesPoint.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    sp[name] = salesPoint.id;
  }

  // 6. Seed inventory categories.
  // IMPORTANT: Replace the section values below with the exact enum
  // values declared in your Prisma schema.
  //
  // This assumes InventoryCategory has @@unique([section, name],
  // name: "section_name").

  const categories = [
    { name: 'Main Dish', section: 'FOOD' },
    { name: 'Swallow', section: 'FOOD' },
    { name: 'Soups', section: 'FOOD' },
    { name: 'Pastry', section: 'PASTRIES' },
    { name: 'Protein', section: 'FOOD' },
    { name: 'Soft Drinks', section: 'DRINKS' },
    { name: 'Spirits', section: 'DRINKS' },
    
  ] as const;

  const cat: Record<string, string> = {};

  for (const category of categories) {
    const savedCategory = await prisma.inventoryCategory.upsert({
      where: {
        section_name: {
          section: category.section,
          name: category.name,
        },
      },
      update: {},
      create: {
        name: category.name,
        section: category.section,
      },
    });

    cat[category.name] = savedCategory.id;
  }

  // 7. Seed inventory items
  const items: [
    string,
    string,
    string,
    string,
    number,
    number,
    number,
  ][] = [
    ['Fried Rice', 'Main Dish', 'Chys Restaurant', 'Fried Rice', 5000, 2000, 73],
    ['Beef Burger', 'Main Dish', 'Chys Restaurant', '', 3500, 1500, 59],
    ['Fiesta', 'Main Dish', 'Chys Restaurant', 'delicious fiesta', 5000, 2000, 41],
    ['Eba', 'Swallow', 'Chys Restaurant', '', 800, 300, 997],
    ['Fufu', 'Swallow', 'Chys Restaurant', '', 800, 300, 996],
    ['Egg Roll', 'Pastry', 'Chys Restaurant', '', 800, 300, 996],
    ['Coke Can', 'Soft Drinks', 'Chys Restaurant', 'coke in can', 500, 200, 90],
    ['Joe Brandy', 'Spirits', 'Hilltop Bar', '', 4500, 3000, 50],
    
  ];

  for (const [name, c, s, description, sellPrice, costPrice, quantity] of items) {
    const exists = await prisma.inventoryItem.findFirst({
      where: { name },
    });

    if (!exists) {
      await prisma.inventoryItem.create({
        data: {
          name,
          description,
          categoryId: cat[c],
          salesPointId: sp[s],
          sellPrice,
          costPrice,
          quantity,
          minLevel: 10,
        },
      });
    }
  }

  // 8. Seed store, facilities and groups
  await prisma.store.upsert({
    where: { name: 'Main Store' },
    update: {},
    create: { name: 'Main Store' },
  });

  for (const name of ['Main Hall', 'Victoria Adams Hall2']) {
    await prisma.facility.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of ['ZION SOFTWARE', 'MTN']) {
    await prisma.group.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log('Seed complete. All demo users share the password: Password123!');
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
