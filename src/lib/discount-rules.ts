/**
 * Whether a discount code applies, and what it takes off.
 *
 * Pure functions over plain data — no Prisma, no request — for the same reason
 * order-rules.ts and checkout-flow-rules.ts are: this decides how much money
 * someone is charged, and that is worth proving in a test rather than trusting
 * to a careful read.
 *
 * THE RULE THAT MATTERS: the browser sends a string of characters and nothing
 * else. Every figure here comes from the database row and the order's own
 * subtotal. A discount is never read from a form, because a form can be
 * edited, and "10% off" typed by an attacker would otherwise be 100% off.
 */

export type DiscountRow = {
  code: string;
  percentOff: number | null;
  amountOffBdt: number | null;
  minSpendBdt: number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export type DiscountCheck =
  | { ok: true; amountBdt: number; label: string }
  | { ok: false; reason: string };

/** How codes are stored and compared: upper case, no spaces. */
export function normaliseCode(raw: string): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** What a code is worth, in words, for the cart line and the admin list. */
export function describeDiscount(d: Pick<DiscountRow, 'percentOff' | 'amountOffBdt'>): string {
  if (d.percentOff) return `${d.percentOff}% off`;
  if (d.amountOffBdt) return `৳${d.amountOffBdt.toLocaleString('en-US')} off`;
  return 'no reduction';
}

/**
 * Evaluate a code against one cart.
 *
 * `usesByThisPerson` is how many times this email has ALREADY redeemed this
 * code on a paid order. Passing it in rather than looking it up keeps this
 * function pure and makes the per-person limit testable.
 *
 * Every refusal says what is wrong in words a customer can act on. "Invalid
 * code" for six different problems is how a working code gets abandoned.
 */
export function evaluateDiscount(
  row: DiscountRow | null | undefined,
  ctx: { subtotalBdt: number; now: Date; usesByThisPerson: number },
): DiscountCheck {
  if (!row) return { ok: false, reason: 'That code was not recognised.' };
  if (!row.active) return { ok: false, reason: 'That code is no longer active.' };

  if (row.startsAt && ctx.now < row.startsAt) {
    return { ok: false, reason: 'That code has not started yet.' };
  }
  if (row.endsAt && ctx.now > row.endsAt) {
    return { ok: false, reason: 'That code has expired.' };
  }

  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    return { ok: false, reason: 'That code has been fully used.' };
  }
  if (row.perUserLimit !== null && ctx.usesByThisPerson >= row.perUserLimit) {
    return {
      ok: false,
      reason: row.perUserLimit === 1
        ? 'You have already used that code.'
        : `That code can only be used ${row.perUserLimit} times per person.`,
    };
  }

  if (row.minSpendBdt !== null && ctx.subtotalBdt < row.minSpendBdt) {
    const short = row.minSpendBdt - ctx.subtotalBdt;
    return {
      ok: false,
      reason: `That code needs a cart of at least ৳${row.minSpendBdt.toLocaleString('en-US')} — ৳${short.toLocaleString('en-US')} more.`,
    };
  }

  const amount = reductionFor(row, ctx.subtotalBdt);

  // A code that exists but takes nothing off is a configuration mistake, not a
  // discount. Saying so beats applying "৳0 off" and looking broken.
  if (amount <= 0) return { ok: false, reason: 'That code does not reduce this order.' };

  return { ok: true, amountBdt: amount, label: describeDiscount(row) };
}

/**
 * The reduction itself, in whole taka.
 *
 * Percentages round to the nearest taka because every amount in this system is
 * a whole number of BDT — a fractional discount would produce a total the
 * gateway cannot charge.
 *
 * Clamped to the subtotal so an order can never come out negative. A ৳2,000
 * code on a ৳500 cart makes it free, not a ৳1,500 refund.
 */
export function reductionFor(
  d: Pick<DiscountRow, 'percentOff' | 'amountOffBdt'>,
  subtotalBdt: number,
): number {
  if (subtotalBdt <= 0) return 0;

  // Percent wins if both are somehow set. The admin refuses to save both, so
  // this only arises for a row written before that rule existed — and a rule
  // that silently picks one is better than one that adds them together.
  const raw = d.percentOff
    ? Math.round((subtotalBdt * d.percentOff) / 100)
    : (d.amountOffBdt ?? 0);

  return Math.max(0, Math.min(raw, subtotalBdt));
}

/** Codes are typed by hand off a poster or a story — keep the alphabet small. */
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

export function isValidCodeFormat(code: string): boolean {
  return CODE_RE.test(code);
}

/**
 * Why a code would not work right now, in one word.
 *
 * Lives here rather than on either screen because BOTH the desktop admin and
 * the phone show it, and a code labelled "live" on one and "expired" on the
 * other would be a bug nobody could see until a customer hit it. Same reason
 * `evaluateDiscount` is shared with the cart: one implementation, or they
 * eventually disagree about money.
 *
 * The order of the checks is the order that answers "why not" most usefully.
 * A code that is switched off AND expired is reported as off, because that is
 * the one thing an admin can undo with a tap.
 */
export type CodeState = 'live' | 'off' | 'used-up' | 'expired' | 'scheduled';

export function codeState(
  c: Pick<DiscountRow, 'active' | 'startsAt' | 'endsAt' | 'maxUses' | 'usedCount'>,
  now: Date = new Date(),
): CodeState {
  if (!c.active) return 'off';
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return 'used-up';
  if (c.endsAt && now > c.endsAt) return 'expired';
  if (c.startsAt && now < c.startsAt) return 'scheduled';
  return 'live';
}

/** The same five states in words, for a subtitle under the code. */
export const CODE_STATE_LABEL: Record<CodeState, string> = {
  live: 'Working now',
  off: 'Switched off',
  'used-up': 'All uses spent',
  expired: 'Past its end date',
  scheduled: 'Starts later',
};
