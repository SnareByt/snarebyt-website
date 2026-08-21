/**
 * The order the portfolio's sections appear in.
 *
 * Pure functions over plain data — no Prisma, no request context — for the
 * same reason order-rules.ts and site-mode-rules.ts are: the failure this has
 * to be designed against is a whole section of Samir's credits silently
 * vanishing from his site because a stored string went out of step with the
 * code, and that is worth proving rather than assuming.
 *
 * So `resolveOrder` is total. Whatever it is handed — nothing, rubbish, a
 * stale list written before a category existed, a list with duplicates — it
 * returns every known category exactly once. A saved preference can change the
 * ORDER of the sections; it can never change which ones exist.
 */

export const PORTFOLIO_CATEGORIES = [
  'PRODUCED_BY_SNAREBYT',
  'MIXED_AND_MASTERED_BY_SNAREBYT',
  'SNAREBYT_RELEASES',
  'SELECTED_VISUAL_WORK',
] as const;

export type PortfolioCategory = (typeof PORTFOLIO_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  PRODUCED_BY_SNAREBYT: 'Produced by SnareByt',
  MIXED_AND_MASTERED_BY_SNAREBYT: 'Mixed & Mastered by SnareByt',
  SNAREBYT_RELEASES: 'SnareByt Releases',
  SELECTED_VISUAL_WORK: 'Selected Visual Work',
};

const isCategory = (v: string): v is PortfolioCategory =>
  (PORTFOLIO_CATEGORIES as readonly string[]).includes(v);

/**
 * Turn a stored preference into a usable order.
 *
 * Anything recognised keeps its saved position. Anything the stored list does
 * not mention is appended in its default position, which is what stops a
 * category added later from being invisible until someone opens the admin and
 * saves. Unknown names are dropped rather than passed through, so a renamed
 * enum value cannot produce a section that renders as an empty heading.
 */
export function resolveOrder(stored: string | null | undefined): PortfolioCategory[] {
  const seen = new Set<PortfolioCategory>();
  const out: PortfolioCategory[] = [];

  for (const raw of (stored ?? '').split(',')) {
    const key = raw.trim();
    if (isCategory(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }

  for (const key of PORTFOLIO_CATEGORIES) {
    if (!seen.has(key)) out.push(key);
  }

  return out;
}

/** The form the setting is stored in. */
export function serialiseOrder(order: readonly string[]): string {
  return resolveOrder(order.join(',')).join(',');
}

/**
 * Move one category one place up or down.
 *
 * Returns the list unchanged when the move is impossible — the first item
 * cannot go up — so the caller never has to special-case the ends, and a
 * button at the end of the list is disabled rather than doing nothing quietly.
 */
export function move(
  order: readonly PortfolioCategory[],
  key: PortfolioCategory,
  direction: 'up' | 'down',
): PortfolioCategory[] {
  const i = order.indexOf(key);
  if (i === -1) return [...order];

  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return [...order];

  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
