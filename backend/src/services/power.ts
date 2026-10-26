import { prisma } from '../lib/prisma';
import { addDays, bounds, dbDate } from './period';

export interface PowerConfig { /** How far actual fuel use may differ from what the running hours explain before it is flagged. */ tolerancePct: number }
export const DEFAULT_POWER: PowerConfig = { tolerancePct: 10 };
const KEY = 'power.config';
export async function getPowerConfig(): Promise<PowerConfig> {
  const r = await prisma.setting.findUnique({ where: { key: KEY } });
  try { return r ? { ...DEFAULT_POWER, ...JSON.parse(r.value) } : DEFAULT_POWER; } catch { return DEFAULT_POWER; }
}
export async function savePowerConfig(c: PowerConfig) {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(c) }, create: { key: KEY, value: JSON.stringify(c) } });
}

const n = (v: unknown) => Number(v ?? 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fuel report for a period. Real use is "tank at the start + diesel bought − tank at the end" between two dip readings.
 * It is compared with what the running hours should have burned, so missing diesel shows up as a variance.
 */
export async function powerReport(from: string, to: string) {
  const cfg = await getPowerConfig();
  const [openDip, closeDip] = await Promise.all([
    prisma.tankDip.findFirst({ where: { date: { lt: dbDate(from) } }, orderBy: { date: 'desc' } }),
    prisma.tankDip.findFirst({ where: { date: { lte: dbDate(to) } }, orderBy: { date: 'desc' } }),
  ]);
  const measured = !!openDip && !!closeDip && closeDip.date > openDip.date;
  // When two readings exist, every figure covers exactly the days between them so the numbers agree with each other.
  const winFrom = measured ? addDays(iso(openDip!.date), 1) : from;
  const winTo = measured ? iso(closeDip!.date) : to;

  const [purchases, runs, gens] = await Promise.all([
    prisma.dieselPurchase.findMany({ where: { date: { gte: dbDate(winFrom), lte: dbDate(winTo) } }, orderBy: { date: 'asc' } }),
    prisma.generatorRun.findMany({ where: { date: { gte: dbDate(winFrom), lte: dbDate(winTo) } }, include: { generator: true }, orderBy: { date: 'asc' } }),
    prisma.generator.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const litresBought = purchases.reduce((s, p) => s + n(p.litres), 0), spent = purchases.reduce((s, p) => s + n(p.total), 0);
  let avgPrice = litresBought > 0 ? spent / litresBought : null;
  if (avgPrice === null) { const last = await prisma.dieselPurchase.findFirst({ where: { date: { lt: dbDate(winFrom) } }, orderBy: { date: 'desc' } }); avgPrice = last ? n(last.pricePerLitre) : null; }

  const hours = runs.reduce((s, r) => s + n(r.hours), 0);
  const noRate = [...new Set(runs.filter((r) => r.generator.litresPerHour === null).map((r) => r.generator.name))];
  const expected = runs.reduce((s, r) => s + n(r.hours) * n(r.generator.litresPerHour), 0);
  const used = measured ? n(openDip!.litres) + litresBought - n(closeDip!.litres) : null;
  const variance = used !== null && expected > 0 ? used - expected : null;
  const variancePct = variance !== null && expected > 0 ? r2((variance / expected) * 100) : null;

  // Occupied rooms at the end of each day in the window.
  const start = bounds(winFrom).start, end = bounds(winTo).end;
  const stays = await prisma.stay.findMany({ where: { checkInAt: { lt: end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: start } }] }, select: { checkInAt: true, checkOutAt: true } });
  const days: { date: string; hours: number; expectedLitres: number; occupied: number }[] = [];
  for (let d = winFrom; d <= winTo; d = addDays(d, 1)) {
    const dayEnd = bounds(d).end;
    const dayRuns = runs.filter((r) => iso(r.date) === d);
    days.push({ date: d, hours: r2(dayRuns.reduce((s, r) => s + n(r.hours), 0)), expectedLitres: r2(dayRuns.reduce((s, r) => s + n(r.hours) * n(r.generator.litresPerHour), 0)), occupied: stays.filter((s) => s.checkInAt < dayEnd && (!s.checkOutAt || s.checkOutAt >= dayEnd)).length });
  }
  const roomNights = days.reduce((s, d) => s + d.occupied, 0);
  const fuelCost = used !== null && avgPrice !== null ? used * avgPrice : spent; // what was actually burned, else what was bought
  return {
    from, to, window: { from: winFrom, to: winTo }, measured, config: cfg,
    purchases: { litres: r2(litresBought), cost: r2(spent), avgPricePerLitre: avgPrice === null ? null : r2(avgPrice), count: purchases.length },
    tank: { opening: openDip ? n(openDip.litres) : null, openingDate: openDip ? iso(openDip.date) : null, closing: closeDip ? n(closeDip.litres) : null, closingDate: closeDip ? iso(closeDip.date) : null },
    hoursRun: r2(hours), litresUsed: used === null ? null : r2(used), expectedLitres: r2(expected), missingRate: noRate,
    variance: { litres: variance === null ? null : r2(variance), pct: variancePct, value: variance !== null && avgPrice !== null ? r2(variance * avgPrice) : null, flagged: variancePct !== null && variancePct > cfg.tolerancePct },
    litresPerHour: used !== null && hours > 0 ? r2(used / hours) : null,
    fuelCost: r2(fuelCost), roomNights, costPerOccupiedRoomNight: roomNights > 0 ? r2(fuelCost / roomNights) : null, costPerRunningHour: hours > 0 ? r2(fuelCost / hours) : null,
    byGenerator: gens.map((g) => { const rs = runs.filter((r) => r.generatorId === g.id); return { id: g.id, name: g.name, litresPerHour: g.litresPerHour === null ? null : n(g.litresPerHour), hours: r2(rs.reduce((s, r) => s + n(r.hours), 0)) }; }),
    days,
  };
}
