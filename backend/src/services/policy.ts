import { prisma } from '../lib/prisma';

/** ADMIN and MANAGER can approve what staff cannot (big discounts, free stays and free orders). */
export const canApprove = (role?: string) => role === 'ADMIN' || role === 'MANAGER';

const KEY = 'policy.maxDiscountPercent';
export const DEFAULT_MAX_DISCOUNT = 10;

/** Largest room discount (percent of the room charge) a receptionist may give without a manager. */
export async function getMaxDiscountPercent(): Promise<number> {
  const r = await prisma.setting.findUnique({ where: { key: KEY } });
  const n = Number(r?.value);
  return r && Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_MAX_DISCOUNT;
}

export async function setMaxDiscountPercent(n: number) {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value: String(n) }, create: { key: KEY, value: String(n) } });
  return n;
}

const FC_KEY = 'policy.foodCostTarget';
export const DEFAULT_FOOD_COST_TARGET = 35;

/** Food-cost % above which a dish is flagged as under-priced (cost of ingredients ÷ selling price). */
export async function getFoodCostTarget(): Promise<number> {
  const r = await prisma.setting.findUnique({ where: { key: FC_KEY } });
  const n = Number(r?.value);
  return r && Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_FOOD_COST_TARGET;
}

export async function setFoodCostTarget(n: number) {
  await prisma.setting.upsert({ where: { key: FC_KEY }, update: { value: String(n) }, create: { key: FC_KEY, value: String(n) } });
  return n;
}
