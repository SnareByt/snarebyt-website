/**
 * The rules that guard an artist account.
 *
 * These decide whether a stranger can read somebody's receipts, licences and
 * private files, so they are proven rather than assumed. src/lib/account-rules.ts
 * holds no Prisma, no cookies and no request context precisely so this can call
 * it directly — nothing here is mocked, and account.ts asks the very same
 * functions.
 *
 *   npx tsx scripts/check-account.ts
 */
import {
  sessionVerdict, otpVerdict, passwordProblems, isObviousPassword,
  mayAdoptHistory, mayAccessFile, IDLE_MS, OTP_MAX_ATTEMPTS,
  type SessionFacts, type OtpFacts,
} from '../src/lib/account-rules';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const now = new Date('2026-08-20T12:00:00.000Z');
const mins = (n: number) => new Date(now.getTime() + n * 60_000);

const yes = (name: string, got: boolean) => (got ? pass(name) : fail(`${name} — expected allowed, got refused`));
const no = (name: string, got: boolean) => (!got ? pass(name) : fail(`${name} — expected REFUSED, got allowed`));

const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(`${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

/* ------------------------------------------------------------------ */
console.log('\nSessions — who is let in\n');

const session = (o: Partial<SessionFacts> = {}): SessionFacts => ({
  kind: 'ACCOUNT', role: 'CUSTOMER', revokedAt: null,
  expiresAt: mins(60), lastSeenAt: mins(-5), suspendedAt: null, ...o,
});

yes('a normal signed-in artist', sessionVerdict(session(), now).ok);

// The escalation this whole design exists to prevent.
eq('an ADMIN-door token presented at the portal is refused',
  sessionVerdict(session({ kind: 'ADMIN' }), now), { ok: false, reason: 'wrong_door' });
eq('a customer whose role was changed to STAFF loses the portal',
  sessionVerdict(session({ role: 'STAFF' }), now), { ok: false, reason: 'not_customer' });
eq('an ADMIN role cannot use the artist portal either',
  sessionVerdict(session({ role: 'ADMIN' }), now), { ok: false, reason: 'not_customer' });

eq('a revoked device is refused',
  sessionVerdict(session({ revokedAt: mins(-1) }), now), { ok: false, reason: 'revoked' });
eq('an expired session is refused',
  sessionVerdict(session({ expiresAt: mins(-1) }), now), { ok: false, reason: 'expired' });
eq('expiry is exclusive — the exact instant is already dead',
  sessionVerdict(session({ expiresAt: now }), now), { ok: false, reason: 'expired' });

// Idle expiry is separate from absolute expiry: a 30-day session left alone
// for three weeks must not still open.
const idle = new Date(now.getTime() - IDLE_MS - 1000);
eq('a session idle beyond the window is refused even though it has not expired',
  sessionVerdict(session({ lastSeenAt: idle, expiresAt: mins(60 * 24 * 20) }), now),
  { ok: false, reason: 'idle' });
yes('a session used just inside the idle window still works',
  sessionVerdict(session({ lastSeenAt: new Date(now.getTime() - IDLE_MS + 1000) }), now).ok);

eq('a suspended artist is refused at the door, not per page',
  sessionVerdict(session({ suspendedAt: mins(-60) }), now), { ok: false, reason: 'suspended' });

/* ------------------------------------------------------------------ */
console.log('\nEmail OTP\n');

const otp = (o: Partial<OtpFacts> = {}): OtpFacts => ({
  usedAt: null, expiresAt: mins(10), attempts: 0,
  storedHash: 'HASH', presentedHash: 'HASH', ...o,
});

yes('the right code is accepted', otpVerdict(otp(), now).ok);

eq('a wrong code is refused but NOT burned, so a typo is recoverable',
  otpVerdict(otp({ presentedHash: 'WRONG' }), now),
  { ok: false, reason: 'mismatch', burn: false });

eq('an expired code is refused and burned',
  otpVerdict(otp({ expiresAt: mins(-1) }), now), { ok: false, reason: 'expired', burn: true });
eq('a code already used is refused and burned',
  otpVerdict(otp({ usedAt: mins(-1) }), now), { ok: false, reason: 'used', burn: true });

// The ordering matters: if the cap were checked after the hash comparison, a
// wrong guess would never reach it and the code could be walked forever.
eq('the attempt cap is reached and the code is burned',
  otpVerdict(otp({ attempts: OTP_MAX_ATTEMPTS }), now), { ok: false, reason: 'locked', burn: true });
eq('a spent code is locked even when the RIGHT code is finally presented',
  otpVerdict(otp({ attempts: OTP_MAX_ATTEMPTS, presentedHash: 'HASH' }), now),
  { ok: false, reason: 'locked', burn: true });
yes('one attempt below the cap still works',
  otpVerdict(otp({ attempts: OTP_MAX_ATTEMPTS - 1 }), now).ok);

// Expiry beats a wrong guess, so a stale code cannot be farmed for attempts.
eq('expiry is reported ahead of a mismatch',
  otpVerdict(otp({ expiresAt: mins(-1), presentedHash: 'WRONG' }), now),
  { ok: false, reason: 'expired', burn: true });

/* ------------------------------------------------------------------ */
console.log('\nAdopting guest history — the privacy boundary\n');

const adopt = (o: Partial<Parameters<typeof mayAdoptHistory>[0]> = {}) =>
  mayAdoptHistory({
    rowEmail: 'artist@example.com', accountEmail: 'artist@example.com',
    rowUserId: null, emailVerified: true, ...o,
  });

yes('a verified artist adopts their own unclaimed guest order', adopt());
yes('matching is case-insensitive', adopt({ rowEmail: 'Artist@Example.COM' }));
yes('surrounding whitespace does not block a match', adopt({ rowEmail: '  artist@example.com ' }));

// This is the one with no second chance.
no('an UNVERIFIED account adopts nothing, even with a matching address',
  adopt({ emailVerified: false }));
no('someone else\'s order is never adopted', adopt({ rowEmail: 'other@example.com' }));
no('an order already owned by another user is never re-assigned',
  adopt({ rowUserId: 'usr_someone_else' }));
no('an order with no email on it is not adopted', adopt({ rowEmail: null }));
no('unverified AND already claimed is still refused',
  adopt({ emailVerified: false, rowUserId: 'usr_x' }));

/* ------------------------------------------------------------------ */
console.log('\nFile access\n');

const file = (o: Partial<Parameters<typeof mayAccessFile>[0]> = {}) =>
  mayAccessFile({ viewerId: 'usr_a', viewerIsAdmin: false, ownerId: 'usr_a', viewerSuspended: false, ...o });

yes('an artist reads their own file', file());
no('an artist cannot read another artist\'s file', file({ ownerId: 'usr_b' }));
no('a signed-out visitor reads nothing', file({ viewerId: null }));
no('an orphaned file with no owner is not readable', file({ ownerId: null }));
no('a suspended artist cannot download, even their own file', file({ viewerSuspended: true }));
yes('the studio can read a file to see what it was sent',
  file({ viewerIsAdmin: true, viewerId: 'usr_admin', ownerId: 'usr_b' }));
// Being signed in is not itself permission — the ids must match.
no('a valid session over the wrong owner is still refused',
  file({ viewerId: 'usr_a', ownerId: 'usr_zzz' }));

/* ------------------------------------------------------------------ */
console.log('\nPassword policy\n');

eq('a strong password has no complaints', passwordProblems('Correct9Horse'), []);
eq('a short password is caught', passwordProblems('Ab3xyz'), ['At least 10 characters']);
eq('every missing class is reported at once', passwordProblems('aaaaaaaaaa'),
  ['One uppercase letter', 'One number']);
eq('all four can fail together', passwordProblems('abc'),
  ['At least 10 characters', 'One uppercase letter', 'One number']);

// Passes every rule above and is still one of the first things anyone types.
eq('"Password1a" satisfies the rules', passwordProblems('Password1a'), []);
(isObviousPassword('Password1a') ? pass : (m: string) => fail(m))('…and is rejected anyway as obvious');
(isObviousPassword('PASSWORD1A') ? pass : (m: string) => fail(m))('the obvious list is case-insensitive');
(!isObviousPassword('Correct9Horse') ? pass : (m: string) => fail(m))('a real password is not on the list');

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll account checks passed.\n');
process.exit(failures ? 1 : 0);
