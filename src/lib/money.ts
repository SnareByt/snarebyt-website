import { prisma } from './prisma';

/**
 * MONEY RULE
 * Every amount in the database is a whole number of BDT.
 * USD is never stored — it is derived at render time from the
 * usdRate setting. Storing both currencies guarantees they drift
 * apart and someone eventually gets charged the wrong figure.
 */

/* The pure formatters live in money-client.ts so client components can use
   them too — this module imports Prisma and cannot cross that line. Re-exported
   here so every existing import of '@/lib/money' keeps working. */
export { bdt, usd, licencePrice } from './money-client';

export async function getUsdRate(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'usdRate' } });
  const rate = row ? Number(row.value) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : 122;
}
