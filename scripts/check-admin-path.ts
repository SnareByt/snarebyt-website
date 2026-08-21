/**
 * Where the admin front door is.
 *
 * Two failures to prove against, and they pull in opposite directions:
 *
 *  1. The panel announcing itself — a signed-out visitor learning that /admin
 *     is real, which is how credential-stuffing bots find something to attack.
 *  2. Samir locked out — a malformed or half-applied secret leaving NO working
 *     door at all, on a site whose database only he can reach.
 *
 * The rules are total: whatever ADMIN_SECRET_PATH contains, loginPath() always
 * returns exactly one path, and isLoginPath() always agrees with it.
 *
 *   npx tsx scripts/check-admin-path.ts
 */
import { secretSegment, loginPath, isLoginPath } from '../src/lib/admin-path';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

/** Run a check with ADMIN_SECRET_PATH set to a given value. */
function withSecret<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.ADMIN_SECRET_PATH;
  if (value === undefined) delete process.env.ADMIN_SECRET_PATH;
  else process.env.ADMIN_SECRET_PATH = value;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.ADMIN_SECRET_PATH;
    else process.env.ADMIN_SECRET_PATH = previous;
  }
}

console.log('\nWith no secret set, nothing changes\n');

withSecret(undefined, () => {
  ok('there is no secret', secretSegment() === null);
  ok('the door is the one that has always been there', loginPath() === '/admin/login');
  ok('/admin/login is recognised as the door', isLoginPath('/admin/login'));
  ok('/admin is not the door', !isLoginPath('/admin'));
  ok('/admin/orders is not the door', !isLoginPath('/admin/orders'));
});

console.log('\nWith a secret set, the door moves and the old one closes\n');

withSecret('back-room-7', () => {
  ok('the secret is read', secretSegment() === 'back-room-7');
  ok('the door moved', loginPath() === '/admin/back-room-7');
  ok('the secret path is the door', isLoginPath('/admin/back-room-7'));
  ok('/admin/login is NO LONGER the door — otherwise the secret is decorative',
    !isLoginPath('/admin/login'));
  ok('a near miss is not the door', !isLoginPath('/admin/back-room-8'));
  ok('a prefix is not the door', !isLoginPath('/admin/back-room'));
  ok('a deeper path is not the door', !isLoginPath('/admin/back-room-7/extra'));
});

console.log('\nCase and spacing are forgiven, because a person types this into Vercel\n');

ok('surrounding whitespace is trimmed', withSecret('  quiet-door  ', () => loginPath()) === '/admin/quiet-door');
ok('uppercase is lowered rather than rejected',
  withSecret('QuietDoor', () => loginPath()) === '/admin/quietdoor');

console.log('\nA broken secret falls back to a working door, never to none\n');

// This is the lockout case. Every one of these must leave a door open.
const broken = [
  ['empty', ''],
  ['only spaces', '   '],
  ['too short', 'ab'],
  ['containing a slash', 'secret/door'],
  ['a full path', '/admin/secret'],
  ['with a space inside', 'my door'],
  ['with a query string', 'door?x=1'],
  ['starting with a hyphen', '-door'],
  ['an underscore', 'my_door'],
  ['a dot', 'door.php'],
  ['unicode', 'দরজা'],
  ['far too long', 'a'.repeat(200)],
  ['literally "login"', 'login'],
];
for (const [label, value] of broken) {
  const path = withSecret(value, () => loginPath());
  ok(`${label} → falls back to /admin/login`, path === '/admin/login', path);
}

console.log('\nThe two functions can never disagree\n');

for (const value of ['back-room-7', '', 'nonsense/path', 'QuietDoor', 'login', undefined]) {
  const agree = withSecret(value, () => isLoginPath(loginPath()));
  ok(`isLoginPath(loginPath()) is true for ${JSON.stringify(value)}`, agree);
}

// There is always exactly one door, and it is always under /admin.
for (const value of ['back-room-7', 'x', undefined, 'login', '///']) {
  const path = withSecret(value, () => loginPath());
  ok(`a door always exists under /admin for ${JSON.stringify(value)}`,
    path.startsWith('/admin/') && path.length > '/admin/'.length, path);
}

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll admin path checks passed.\n');
process.exit(failures ? 1 : 0);
