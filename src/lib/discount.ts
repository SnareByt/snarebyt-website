import 'server-only';
import { prisma } from './prisma';
import {
  normaliseCode, evaluateDiscount, type DiscountCheck,
} from './discount-rules';

export type { DiscountCheck };

export type ResolvedDiscount = {
  id: string;
  code: string;
  amountBdt: number;
  label: string;
};

/**
 * Look a code up and decide what it is worth, right now, for this cart.
 *
 * ONE implementation, used by both the "apply" button in the cart and by
 * placeOrder. That is deliberate: if the preview and the order computed the
 * discount separately they would eventually disagree, and the way that shows
 * up is a customer being charged more than the cart said.
 *
 * The per-person count only looks at PAID orders. An abandoned checkout must
 * not burn somebody's one use of a code — otherwise closing the tab costs them
 * the discount and there is no way for them to get it back.
 */
export async function resolveDiscount(
  rawCode: string,
  ctx: { subtotalBdt: number; email?: string | null },
): Promise<{ ok: true; discount: ResolvedDiscount } | { ok: false; reason: string }> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, reason: 'Enter a code.' };

  const row = await prisma.discountCode.findUnique({ where: { code } });

  const email = (ctx.email ?? '').trim().toLowerCase();
  const usesByThisPerson = row && email
    ? await prisma.order.count({
        where: { discountCodeId: row.id, status: 'PAID', billingEmail: email },
      })
    : 0;

  const check = evaluateDiscount(row, {
    subtotalBdt: ctx.subtotalBdt,
    now: new Date(),
    usesByThisPerson,
  });

  if (!check.ok) return { ok: false, reason: check.reason };

  return {
    ok: true,
    discount: { id: row!.id, code: row!.code, amountBdt: check.amountBdt, label: check.label },
  };
}

/**
 * Mark a code as redeemed. Called from inside the IPN's transaction, once the
 * payment is verified — never when the order is merely placed.
 *
 * Counting at placement would let anyone exhaust a limited code by filling a
 * cart and walking away, and would make `usedCount` mean "attempted" on a
 * screen labelled "used". The cost of counting here instead is that two people
 * can pay at the same instant and push a code one past its limit; one extra
 * discount is a far better failure than a code a competitor can burn.
 */
export async function redeemDiscount(
  tx: { discountCode: { update: (args: unknown) => Promise<unknown> } },
  discountCodeId: string,
): Promise<void> {
  await tx.discountCode.update({
    where: { id: discountCodeId },
    data: { usedCount: { increment: 1 } },
  } as never);
}
