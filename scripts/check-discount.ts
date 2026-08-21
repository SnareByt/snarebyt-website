/**
 * The rules behind discount codes.
 *
 * This decides how much someone is charged, so the failures worth proving
 * against are money failures:
 *
 *  · a code taking off more than the cart is worth, producing a negative total
 *  · a fractional taka the gateway cannot charge
 *  · an expired, exhausted or switched-off code still working
 *  · a per-person limit that can be walked past
 *  · a code that exists but silently takes off nothing
 *
 * All of it is pure, so all of it can be checked here rather than by placing
 * orders against a live gateway.
 *
 *   npx tsx scripts/check-discount.ts
 */
import {
  normaliseCode, isValidCodeFormat, reductionFor, evaluateDiscount, describeDiscount,
  type DiscountRow,
} from '../src/lib/discount-rules';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

const NOW = new Date('2026-08-22T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const code = (over: Partial<DiscountRow> = {}): DiscountRow => ({
  code: 'LAUNCH25',
  percentOff: 25,
  amountOffBdt: null,
  minSpendBdt: null,
  maxUses: null,
  usedCount: 0,
  perUserLimit: null,
  startsAt: null,
  endsAt: null,
  active: true,
  ...over,
});

const check = (row: DiscountRow | null, subtotal: number, uses = 0) =>
  evaluateDiscount(row, { subtotalBdt: subtotal, now: NOW, usesByThisPerson: uses });

console.log('\nThe arithmetic\n');

ok('25% of ৳4,000 is ৳1,000', reductionFor({ percentOff: 25, amountOffBdt: null }, 4000) === 1000);
ok('a fixed amount is taken off as-is',
  reductionFor({ percentOff: null, amountOffBdt: 500 }, 4000) === 500);
ok('a percentage rounds to a whole taka — the gateway cannot charge a fraction',
  Number.isInteger(reductionFor({ percentOff: 33, amountOffBdt: null }, 999)),
  String(reductionFor({ percentOff: 33, amountOffBdt: null }, 999)));
ok('33% of ৳999 is ৳330', reductionFor({ percentOff: 33, amountOffBdt: null }, 999) === 330);

// The one that would produce a negative charge.
ok('a ৳2,000 code on a ৳500 cart takes off ৳500, not ৳2,000',
  reductionFor({ percentOff: null, amountOffBdt: 2000 }, 500) === 500);
ok('100% off takes exactly the subtotal',
  reductionFor({ percentOff: 100, amountOffBdt: null }, 3333) === 3333);
ok('an empty cart cannot be discounted',
  reductionFor({ percentOff: 50, amountOffBdt: null }, 0) === 0);
ok('a negative subtotal cannot produce a payout',
  reductionFor({ percentOff: null, amountOffBdt: 500 }, -100) === 0);

// Both set is a misconfiguration; it must resolve to ONE of them, never a sum.
const both = reductionFor({ percentOff: 10, amountOffBdt: 500 }, 10000);
ok('with both set, one rule wins and they are never added together',
  both === 1000, `got ${both}, and 1500 would mean they were summed`);

console.log('\nWhat stops a code working\n');

ok('an unknown code is refused', !check(null, 5000).ok);
ok('a switched-off code is refused', !check(code({ active: false }), 5000).ok);
ok('a code that has not started is refused', !check(code({ startsAt: days(2) }), 5000).ok);
ok('a code that has ended is refused', !check(code({ endsAt: days(-1) }), 5000).ok);
ok('a code ending later still works', check(code({ endsAt: days(1) }), 5000).ok);
ok('a code started earlier still works', check(code({ startsAt: days(-1) }), 5000).ok);
ok('an exhausted code is refused', !check(code({ maxUses: 50, usedCount: 50 }), 5000).ok);
ok('a code past its cap is refused', !check(code({ maxUses: 50, usedCount: 51 }), 5000).ok);
ok('a code with one use left works', check(code({ maxUses: 50, usedCount: 49 }), 5000).ok);
ok('a code with no cap is not exhausted by use',
  check(code({ maxUses: null, usedCount: 9999 }), 5000).ok);

console.log('\nPer-person limits\n');

ok('a once-per-person code works the first time',
  check(code({ perUserLimit: 1 }), 5000, 0).ok);
ok('…and is refused the second time',
  !check(code({ perUserLimit: 1 }), 5000, 1).ok);
const second = check(code({ perUserLimit: 1 }), 5000, 1);
ok('…with a message that says why',
  !second.ok && /already used/i.test(second.reason), !second.ok ? second.reason : '');
ok('a three-per-person code allows the third',
  check(code({ perUserLimit: 3 }), 5000, 2).ok);
ok('…and refuses the fourth', !check(code({ perUserLimit: 3 }), 5000, 3).ok);
ok('no limit means no limit', check(code({ perUserLimit: null }), 5000, 99).ok);

console.log('\nMinimum spend\n');

ok('under the minimum is refused', !check(code({ minSpendBdt: 5000 }), 4999).ok);
ok('exactly the minimum is allowed', check(code({ minSpendBdt: 5000 }), 5000).ok);
const short = check(code({ minSpendBdt: 5000 }), 4000);
ok('the refusal says how much more is needed',
  !short.ok && short.reason.includes('1,000'), !short.ok ? short.reason : '');

console.log('\nA code that reduces nothing is not a discount\n');

ok('a code with neither a percentage nor an amount is refused',
  !check(code({ percentOff: null, amountOffBdt: null }), 5000).ok);
ok('a percentage code on an empty cart is refused',
  !check(code({ percentOff: 25 }), 0).ok);

console.log('\nA valid code reports what it is worth\n');

const good = check(code({ percentOff: 25 }), 4000);
ok('25% of ৳4,000 is reported as ৳1,000', good.ok && good.amountBdt === 1000,
  JSON.stringify(good));
ok('and is labelled in words', good.ok && good.label === '25% off');
ok('a fixed code is labelled with the amount',
  describeDiscount({ percentOff: null, amountOffBdt: 750 }) === '৳750 off');

// The invariant that matters: whatever comes back can never exceed the cart.
for (const subtotal of [1, 50, 999, 5000, 123456]) {
  for (const row of [
    code({ percentOff: 100 }), code({ percentOff: 1 }),
    code({ percentOff: null, amountOffBdt: 1 }),
    code({ percentOff: null, amountOffBdt: 1_000_000 }),
  ]) {
    const r = check(row, subtotal);
    const amount = r.ok ? r.amountBdt : 0;
    if (amount < 0 || amount > subtotal || !Number.isInteger(amount)) {
      fail(`৳${subtotal} with ${describeDiscount(row)} produced ${amount}`);
    }
  }
}
pass('across every combination, the reduction is a whole number between 0 and the subtotal');

console.log('\nCodes are typed by hand, so they are forgiving to type\n');

ok('lower case is accepted', normaliseCode('launch25') === 'LAUNCH25');
ok('surrounding spaces are trimmed', normaliseCode('  LAUNCH25  ') === 'LAUNCH25');
ok('inner spaces are removed', normaliseCode('LAUNCH 25') === 'LAUNCH25');
ok('an empty code stays empty', normaliseCode('   ') === '');

ok('LAUNCH25 is a valid shape', isValidCodeFormat('LAUNCH25'));
ok('a hyphen is allowed', isValidCodeFormat('EID-2026'));
ok('two characters is too short', !isValidCodeFormat('AB'));
ok('a space is refused', !isValidCodeFormat('LAUNCH 25'));
ok('a symbol is refused', !isValidCodeFormat('LAUNCH$'));
ok('a leading hyphen is refused', !isValidCodeFormat('-LAUNCH'));
ok('25 characters is too long', !isValidCodeFormat('A'.repeat(25)));
ok('24 characters is allowed', isValidCodeFormat('A'.repeat(24)));

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll discount checks passed.\n');
process.exit(failures ? 1 : 0);
