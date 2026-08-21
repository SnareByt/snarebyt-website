/**
 * Number formatting safe to import from a client component.
 *
 * `compact` also lives in lib/youtube.ts, but that module is `server-only`
 * and imports Prisma — pulling it into a card component would drag the
 * database client into the browser bundle, which is the kind of import that
 * fails at build time if you are lucky and ships a huge bundle if you are not.
 *
 * This is the same function, deliberately duplicated rather than moved: the
 * server copy is used where a figure is fetched, this one where it is drawn,
 * and neither can import the other without one of them gaining a dependency
 * it has no business having. lib/money-client.ts exists for the same reason.
 */

/** 1234 → "1.2K", 1_240_000 → "1.24M". The exact figure goes in a title attr. */
export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}
