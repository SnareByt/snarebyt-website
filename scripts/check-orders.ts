/**
 * The rules that guard an order.
 *
 * These are decisions about a financial record, so they are worth proving
 * rather than assuming. src/lib/order-rules.ts holds no Prisma and no auth
 * precisely so this can call it directly — nothing here is mocked, and the
 * admin actions ask the very same functions.
 *
 *   npx tsx scripts/check-orders.ts
 */
import {
  canTransition, canRemoveItem, canRefund, canDelete, canDeliver,
  refundIsFull, nextStatuses, type OrderFacts,
} from '../src/lib/order-rules';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const check = (name: string, got: { ok: boolean }, want: boolean) =>
  got.ok === want ? pass(name) : fail(`${name} — expected ${want ? 'allowed' : 'refused'}, got ${got.ok ? 'allowed' : 'refused'}`);

const order = (o: Partial<OrderFacts> = {}): OrderFacts => ({
  status: 'PENDING_PAYMENT', itemCount: 2, totalBdt: 3000, refundedBdt: 0,
  hasLicence: false, hasValidatedPayment: false, ...o,
});

console.log('\nOrder rules\n');

console.log('  Status');
for (const s of ['PENDING_PAYMENT', 'FAILED', 'CANCELLED', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED']) {
  check(`    ${s.toLowerCase()} cannot be marked paid`, canTransition(order({ status: s }), 'PAID'), false);
}
check('    a pending order can be cancelled', canTransition(order(), 'CANCELLED'), true);
check('    a cancelled order can be reopened so the buyer can retry',
  canTransition(order({ status: 'CANCELLED' }), 'PENDING_PAYMENT'), true);
check('    a failed order can be reopened', canTransition(order({ status: 'FAILED' }), 'PENDING_PAYMENT'), true);
check('    a paid order cannot be cancelled by hand', canTransition(order({ status: 'PAID' }), 'CANCELLED'), false);
check('    an invented status is refused', canTransition(order(), 'BANANA'), false);
nextStatuses('PAID').length === 0
  ? pass('    a paid order offers no status buttons')
  : fail('    a paid order offers status buttons');

console.log('\n  Items');
check('    a line can be removed while unpaid', canRemoveItem(order()), true);
check('    the last line cannot be removed', canRemoveItem(order({ itemCount: 1 })), false);
check('    a paid order is frozen', canRemoveItem(order({ status: 'PAID' })), false);
check('    a refunded order is frozen', canRemoveItem(order({ status: 'REFUNDED' })), false);

console.log('\n  Refunds');
check('    a paid order can be refunded', canRefund(order({ status: 'PAID' }), 3000), true);
check('    an unpaid order cannot be refunded', canRefund(order(), 100), false);
check('    more than was paid is refused', canRefund(order({ status: 'PAID' }), 3001), false);
check('    more than the remaining balance is refused',
  canRefund(order({ status: 'PAID', refundedBdt: 2000 }), 1001), false);
check('    the exact remaining balance is allowed',
  canRefund(order({ status: 'PARTIALLY_REFUNDED', refundedBdt: 2000 }), 1000), true);
check('    zero is refused', canRefund(order({ status: 'PAID' }), 0), false);
check('    a negative amount is refused', canRefund(order({ status: 'PAID' }), -500), false);
check('    a fractional taka is refused', canRefund(order({ status: 'PAID' }), 12.5), false);

refundIsFull(order({ status: 'PAID', refundedBdt: 2000 }), 1000)
  ? pass('    2000 already + 1000 settles a 3000 order')
  : fail('    a settling refund was not treated as full');
!refundIsFull(order({ status: 'PAID' }), 2999)
  ? pass('    2999 of 3000 is still partial')
  : fail('    a partial refund was treated as full');

console.log('\n  Deletion');
check('    an unpaid order with nothing attached deletes', canDelete(order()), true);
check('    a paid order does not', canDelete(order({ status: 'PAID' })), false);
check('    a refunded order does not', canDelete(order({ status: 'REFUNDED' })), false);
check('    an order holding a licence does not', canDelete(order({ hasLicence: true })), false);
check('    an order with a validated payment does not', canDelete(order({ hasValidatedPayment: true })), false);

console.log('\n  Delivery');
check('    a paid order can be delivered', canDeliver(order({ status: 'PAID' })), true);
check('    a pending order cannot', canDeliver(order()), false);
check('    a cancelled order cannot', canDeliver(order({ status: 'CANCELLED' })), false);
check('    a refunded order cannot', canDeliver(order({ status: 'REFUNDED' })), false);

console.log(failures ? `\n${failures} failure(s).\n` : '\nEvery rule held.\n');
process.exit(failures ? 1 : 0);
