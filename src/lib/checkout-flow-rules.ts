/**
 * What happens the moment someone presses "Place order".
 *
 * Two ways of running the same shop, and which one is right is a business
 * decision rather than a technical one:
 *
 *  - `direct`   — the order is saved and the browser goes straight to
 *                 SSLCOMMERZ. Fewest steps, most orders actually paid.
 *  - `review`   — the order is saved and the customer lands on a confirmation
 *                 screen with a pay button AND a WhatsApp button. Slower, but
 *                 it leaves room to talk before money moves, which matters for
 *                 a custom job where the price might still change.
 *
 * Pure functions over plain data, for the same reason site-mode-rules.ts is:
 * this decides where a paying customer is sent, and that is worth being able
 * to prove in a test rather than discovering in production.
 *
 * `normaliseFlow` is total. A missing row, a typo, a value written by an older
 * version of the code — all resolve to `direct`, which is the safe direction:
 * the customer still reaches a payment page, and every order is still saved
 * first either way. Nothing here can lose an order.
 */

export const CHECKOUT_FLOWS = ['direct', 'review'] as const;

export type CheckoutFlow = (typeof CHECKOUT_FLOWS)[number];

export function normaliseFlow(value: string | null | undefined): CheckoutFlow {
  const v = (value ?? '').trim();
  return (CHECKOUT_FLOWS as readonly string[]).includes(v) ? (v as CheckoutFlow) : 'direct';
}

/**
 * Should placing the order open the gateway itself?
 *
 * Only when the shop is set to `direct` AND payments are actually configured.
 * Without that second condition, `direct` on a site with no gateway would send
 * the customer nowhere — a confirmation screen they never see and a payment
 * page that cannot exist. So an unconfigured gateway quietly behaves like
 * `review`, which is the only state that still works.
 */
export function goStraightToGateway(
  flow: CheckoutFlow,
  opts: { payable: boolean },
): boolean {
  return flow === 'direct' && opts.payable;
}

/** For the admin screen, and for the note printed above the order button. */
export const FLOW_LABEL: Record<CheckoutFlow, string> = {
  direct: 'Pay & place order',
  review: 'Place order, then pay',
};

export const FLOW_DESC: Record<CheckoutFlow, string> = {
  direct: 'One button in the cart. It saves the order and goes straight to SSLCOMMERZ.',
  review: 'The cart saves the order, then shows a Pay now button and Arrange on WhatsApp.',
};
