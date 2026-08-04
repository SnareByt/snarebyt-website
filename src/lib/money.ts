import { prisma } from './prisma';

/**
 * MONEY RULE
 * Every amount in the database is a whole number of BDT.
 * USD is never stored — it is derived at render time from the
 * usdRate setting. Storing both currencies guarantees they drift
 * apart and someone eventually gets charged the wrong figure.
 */

export const bdt = (n: number) => '৳' + Math.round(n).toLocaleString('en-US');

export function usd(n: number, rate: number) {
  return '$' + (n / rate).toFixed(2);
}

export async function getUsdRate(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'usdRate' } });
  const rate = row ? Number(row.value) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : 122;
}

/** Licence price = beat base price x tier multiplier, rounded to ৳50. */
export function licencePrice(basePriceBdt: number, multiplier: number) {
  return Math.round((basePriceBdt * multiplier) / 50) * 50;
}
