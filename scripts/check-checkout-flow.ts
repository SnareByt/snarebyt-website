/**
 * The rules behind the Checkout setting.
 *
 * The failure worth proving against is a customer being sent nowhere. Every
 * path through this has to end somewhere a person can actually pay or actually
 * reach Samir — and the order has to be saved before either, so that switching
 * the setting, or a gateway outage, or a value nobody recognises, can never
 * cost him a sale.
 *
 *   npx tsx scripts/check-checkout-flow.ts
 */
import {
  CHECKOUT_FLOWS, normaliseFlow, goStraightToGateway, FLOW_LABEL, FLOW_DESC,
} from '../src/lib/checkout-flow-rules';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

console.log('\nWhatever is stored, a usable flow comes out\n');

const rubbish: [string, string | null | undefined][] = [
  ['nothing stored', null],
  ['undefined', undefined],
  ['an empty string', ''],
  ['whitespace', '   '],
  ['an unknown value', 'whatsapp-only'],
  ['a renamed value from an older build', 'two_step'],
  ['the wrong case', 'DIRECT'],
  ['a value with spaces around it', ' review '],
];
for (const [label, value] of rubbish) {
  const got = normaliseFlow(value);
  ok(`${label} → ${got}`, (CHECKOUT_FLOWS as readonly string[]).includes(got));
}

console.log('\nThe two real values are honoured exactly\n');

ok('direct stays direct', normaliseFlow('direct') === 'direct');
ok('review stays review', normaliseFlow('review') === 'review');
ok('surrounding whitespace is tolerated', normaliseFlow(' review ') === 'review');
ok('nothing stored defaults to going straight to payment',
  normaliseFlow(null) === 'direct');
ok('an unrecognised value falls back to direct, not to nothing',
  normaliseFlow('two_step') === 'direct');
ok('the wrong case is not silently accepted as a different mode',
  normaliseFlow('DIRECT') === 'direct');

console.log('\nWhere the customer is actually sent\n');

ok('direct + payments configured → straight to the gateway',
  goStraightToGateway('direct', { payable: true }) === true);
ok('review + payments configured → the confirmation screen',
  goStraightToGateway('review', { payable: true }) === false);

// The case that would otherwise strand somebody: "straight to payment" chosen
// on a site that has no gateway. There is no payment page to send them to, so
// they must land on the screen that still has a WhatsApp button.
ok('direct with NO gateway configured → the confirmation screen, not a dead end',
  goStraightToGateway('direct', { payable: false }) === false);
ok('review with no gateway configured → the confirmation screen',
  goStraightToGateway('review', { payable: false }) === false);

console.log('\nNo combination can send someone nowhere\n');

for (const flow of CHECKOUT_FLOWS) {
  for (const payable of [true, false]) {
    const gateway = goStraightToGateway(flow, { payable });
    // Either the gateway opens, or the confirmation screen is shown. There is
    // no third outcome, and the confirmation screen always exists.
    ok(`${flow} + payments ${payable ? 'on' : 'off'} → ${gateway ? 'gateway' : 'confirmation screen'}`,
      gateway === true || gateway === false);
    // And the gateway is never opened when there is no gateway to open.
    ok(`  …and never opens a gateway that is not configured`,
      !(gateway && !payable));
  }
}

console.log('\nEvery option is labelled for the admin screen\n');

ok('every flow has a label', CHECKOUT_FLOWS.every((f) => Boolean(FLOW_LABEL[f])));
ok('every flow has a description', CHECKOUT_FLOWS.every((f) => Boolean(FLOW_DESC[f])));
ok('the labels differ, so the two options are distinguishable',
  FLOW_LABEL.direct !== FLOW_LABEL.review);
ok('exactly two options are offered', CHECKOUT_FLOWS.length === 2);

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll checkout flow checks passed.\n');
process.exit(failures ? 1 : 0);
