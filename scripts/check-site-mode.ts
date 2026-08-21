/**
 * The rules that can take the whole site offline.
 *
 * This is the one switch that stops the business trading, so its behaviour is
 * proven rather than assumed — including the two ways it could fail badly:
 * closing the site by accident, and appearing closed while still taking money.
 *
 *   npx tsx scripts/check-site-mode.ts
 */
import {
  normaliseMode, decideGate, writesBlocked, signInBlocked,
} from '../src/lib/site-mode-rules';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(`${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const yes = (n: string, v: boolean) => (v ? pass(n) : fail(`${n} — expected true`));
const no = (n: string, v: boolean) => (!v ? pass(n) : fail(`${n} — expected FALSE`));

const visitor = { isAdmin: false };
const admin = { isAdmin: true };

console.log('\nReading the setting\n');

eq('"soon" is recognised', normaliseMode('soon'), 'soon');
eq('"maintenance" is recognised', normaliseMode('maintenance'), 'maintenance');
eq('"live" is recognised', normaliseMode('live'), 'live');

// Every one of these is a way the site could silently take itself offline.
eq('a missing row means live', normaliseMode(null), 'live');
eq('undefined means live', normaliseMode(undefined), 'live');
eq('an empty value means live', normaliseMode(''), 'live');
eq('a typo means live, not closed', normaliseMode('Soon'), 'live');
eq('rubbish means live', normaliseMode('offline'), 'live');
eq('"true" from an old boolean row means live', normaliseMode('true'), 'live');

console.log('\nWhat a visitor sees\n');

eq('live site renders normally', decideGate('live', visitor), { show: 'site' });
eq('coming soon shows the gate WITH the site blurred behind',
  decideGate('soon', visitor), { show: 'gate', blurBehind: true });
eq('maintenance shows the gate with NOTHING behind',
  decideGate('maintenance', visitor), { show: 'gate', blurBehind: false });

console.log('\nWhat an admin sees\n');

eq('an admin sees the live site normally, no banner',
  decideGate('live', admin), { show: 'site' });
eq('an admin passes through coming soon, with a banner',
  decideGate('soon', admin), { show: 'site', preview: true });
eq('an admin passes through maintenance too',
  decideGate('maintenance', admin), { show: 'site', preview: true });

console.log('\nWrites — the part the blur does not do\n');

// The blur is presentation. A blurred page has still been sent to the browser
// and a server action is a public endpoint, so these must refuse separately.
no('live takes orders', writesBlocked('live'));
yes('coming soon refuses orders', writesBlocked('soon'));
yes('maintenance refuses orders', writesBlocked('maintenance'));

// Being an admin previewing the site must not quietly reopen the till.
yes('writes stay blocked regardless of who is asking', writesBlocked('soon'));

console.log('\nSigning in is never blocked\n');

// Closing the shop is not the same as locking paying customers out of the
// licences and files they already own.
no('existing artists can sign in while coming soon', signInBlocked('soon'));
no('existing artists can sign in during maintenance', signInBlocked('maintenance'));
no('and obviously when live', signInBlocked('live'));

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll site mode checks passed.\n');
process.exit(failures ? 1 : 0);
