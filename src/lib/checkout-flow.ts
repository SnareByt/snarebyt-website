import 'server-only';
import { prisma } from './prisma';
import { normaliseFlow, type CheckoutFlow } from './checkout-flow-rules';

export type { CheckoutFlow };

/**
 * How checkout is set to behave right now.
 *
 * Read fresh rather than cached: this is one small indexed lookup, and the
 * whole point of the setting is that Samir can switch it and see the change
 * immediately without a deploy.
 *
 * A database failure resolves to `direct` through normaliseFlow rather than
 * throwing, so a hiccup here can never stop an order being placed.
 */
export async function getCheckoutFlow(): Promise<CheckoutFlow> {
  const row = await prisma.setting
    .findUnique({ where: { key: 'checkoutFlow' } })
    .catch(() => null);
  return normaliseFlow(row?.value);
}
