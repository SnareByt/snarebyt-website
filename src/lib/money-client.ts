/**
 * The money formatters, without the database.
 *
 * `money.ts` imports Prisma to read the USD rate, which makes it unusable from
 * a client component. These three are pure, so they live here and `money.ts`
 * re-exports them — one implementation, reachable from both sides.
 *
 * THE MONEY RULE, restated because this is where it is easiest to break:
 * every amount is a whole number of BDT. USD is derived at render time and
 * never stored. Two currency columns drift apart and eventually charge
 * somebody the wrong figure.
 */

export const bdt = (n: number) => '৳' + Math.round(n).toLocaleString('en-US');

export function usd(n: number, rate: number) {
  return '$' + (n / rate).toFixed(2);
}

/** Licence price = beat base price × tier multiplier, rounded to ৳50. */
export function licencePrice(basePriceBdt: number, multiplier: number) {
  return Math.round((basePriceBdt * multiplier) / 50) * 50;
}
