/**
 * What may be done to an order, decided from facts alone.
 *
 * Deliberately free of Prisma, auth and `server-only` so it can be tested
 * directly. The server actions read the facts, ask here, and only then write —
 * which keeps the rules in one readable place instead of scattered through
 * database calls where nobody can check them all at once.
 *
 * The rules exist because an order is a financial record:
 *   · Contact details are always editable. A mistyped WhatsApp number is the
 *     usual reason a paid customer never receives anything.
 *   · What was bought, and for how much, freezes the moment money arrives —
 *     the licence and the receipt describe it.
 *   · Nothing here can move an order INTO the paid state. That belongs to a
 *     verified gateway callback and nowhere else.
 *   · A settled order is never deleted. It backs a licence somebody holds.
 */

export type OrderFacts = {
  status: string;
  itemCount: number;
  totalBdt: number;
  refundedBdt: number;
  hasLicence: boolean;
  hasValidatedPayment: boolean;
};

export type Verdict = { ok: true } | { ok: false; error: string };

const SETTLED = ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();

/** PAID is absent from every target on purpose. */
export const TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  // Reopening matters: startPayment only accepts PENDING_PAYMENT, so without
  // this a buyer whose card failed could never try again.
  CANCELLED: ['PENDING_PAYMENT'],
  FAILED: ['PENDING_PAYMENT', 'CANCELLED'],
};

export const nextStatuses = (status: string) => TRANSITIONS[status] ?? [];

export function canTransition(f: OrderFacts, next: string): Verdict {
  if (next === 'PAID') {
    return { ok: false, error: 'An order can only become paid when SSLCOMMERZ confirms it to our server.' };
  }
  if (!nextStatuses(f.status).includes(next)) {
    return {
      ok: false,
      error: SETTLED.includes(f.status)
        ? 'A paid order cannot be changed by hand. Record a refund instead.'
        : `An order that is ${human(f.status)} cannot be moved to ${human(next)}.`,
    };
  }
  return { ok: true };
}

export function canRemoveItem(f: OrderFacts): Verdict {
  if (SETTLED.includes(f.status)) {
    return { ok: false, error: 'Items cannot be removed from a paid order. Record a refund instead.' };
  }
  if (f.itemCount <= 1) {
    return { ok: false, error: 'An order cannot be left with no items. Cancel or delete it instead.' };
  }
  return { ok: true };
}

export function canRefund(f: OrderFacts, amountBdt: number): Verdict {
  if (f.status !== 'PAID' && f.status !== 'PARTIALLY_REFUNDED') {
    return { ok: false, error: 'Only a paid order can be refunded.' };
  }
  if (!Number.isInteger(amountBdt) || amountBdt <= 0) {
    return { ok: false, error: 'Enter a whole amount above zero.' };
  }
  const left = f.totalBdt - f.refundedBdt;
  if (amountBdt > left) {
    return { ok: false, error: `That would refund more than was paid. ৳${left.toLocaleString('en-US')} is left to refund.` };
  }
  return { ok: true };
}

/** True once this refund settles the whole order. */
export const refundIsFull = (f: OrderFacts, amountBdt: number) =>
  f.refundedBdt + amountBdt >= f.totalBdt;

export function canDelete(f: OrderFacts): Verdict {
  if (SETTLED.includes(f.status)) {
    return { ok: false, error: 'A paid order cannot be deleted — its licence has to stay provable. Cancel or refund it instead.' };
  }
  if (f.hasLicence) {
    return { ok: false, error: 'This order has issued licences, so it cannot be deleted.' };
  }
  if (f.hasValidatedPayment) {
    return { ok: false, error: 'This order has a validated payment, so it cannot be deleted.' };
  }
  return { ok: true };
}

export function canDeliver(f: OrderFacts): Verdict {
  if (f.status !== 'PAID') {
    return { ok: false, error: `This order is ${human(f.status)}, so there is nothing to deliver yet.` };
  }
  return { ok: true };
}
