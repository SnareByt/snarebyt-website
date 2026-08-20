/**
 * The phone dashboard, proved rather than assumed.
 *
 * Three suites, in the order a defect would hurt most:
 *
 *   1. PROJECT RULES — pure functions, called directly, nothing mocked. The
 *      server actions ask these exact functions, so passing here means the
 *      real code path is covered.
 *   2. ROUTES AND GUARDS — every screen exists, sits behind the tab layout
 *      that checks the session, and every server action reachable from the
 *      phone calls requireAdmin() or requireOwner(). A server action is a
 *      public HTTP endpoint; a missing guard there is the whole ballgame.
 *   3. THE INSTALL SURFACE — manifest, worker, icons, headers. Each of these
 *      fails silently in a way that looks like "the app just will not
 *      install", so each is checked as a file rather than trusted.
 *
 *   npx tsx scripts/check-app.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  canSetProjectStatus, nextProjectStatuses, revisionNote,
  PROJECT_FLOW, PROJECT_LABEL, type ProjectFacts,
} from '../src/lib/project-rules';
import type { ProjectStatus } from '@prisma/client';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const check = (name: string, got: { ok: boolean }, want: boolean) =>
  got.ok === want
    ? pass(name)
    : fail(`${name} — expected ${want ? 'allowed' : 'refused'}, got ${got.ok ? 'allowed' : 'refused'}`);
const is = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(`${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const ok = (name: string, cond: boolean) => (cond ? pass(name) : fail(name));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const has = (p: string) => existsSync(join(process.cwd(), p));

const project = (o: Partial<ProjectFacts> = {}): ProjectFacts => ({
  status: 'IN_PROGRESS',
  deliverableCount: 0,
  revisionsUsed: 0,
  revisionsAllowed: 3,
  ...o,
});

/* ============================================================
   1. Project rules
   ============================================================ */

console.log('\nProject rules\n');

console.log('  Delivery');
check('    cannot deliver with nothing attached',
  canSetProjectStatus(project({ status: 'COMPLETED' }), 'DELIVERED'), false);
check('    can deliver once a deliverable exists',
  canSetProjectStatus(project({ status: 'COMPLETED', deliverableCount: 1 }), 'DELIVERED'), true);
ok('    the refusal names the consequence',
  /paid and received nothing/i.test(
    (canSetProjectStatus(project({ status: 'COMPLETED' }), 'DELIVERED') as { error: string }).error,
  ));
check('    a working file alone is not a delivery',
  canSetProjectStatus(project({ status: 'COMPLETED', deliverableCount: 0 }), 'DELIVERED'), false);

console.log('\n  Direction');
check('    forward is allowed', canSetProjectStatus(project({ status: 'FILES_RECEIVED' }), 'IN_PROGRESS'), true);
check('    skipping several stages forward is allowed',
  canSetProjectStatus(project({ status: 'ORDER_RECEIVED' }), 'FINALISING'), true);
check('    backwards is refused',
  canSetProjectStatus(project({ status: 'FINALISING' }), 'FILES_RECEIVED'), false);
check('    a revision after a preview is allowed',
  canSetProjectStatus(project({ status: 'FIRST_PREVIEW_READY' }), 'REVISION_REQUESTED'), true);
check('    a revision after completion is allowed',
  canSetProjectStatus(project({ status: 'COMPLETED' }), 'REVISION_REQUESTED'), true);
check('    a revision before anything was sent is refused',
  canSetProjectStatus(project({ status: 'ORDER_RECEIVED' }), 'REVISION_REQUESTED'), false);
check('    the same status again is refused',
  canSetProjectStatus(project({ status: 'IN_PROGRESS' }), 'IN_PROGRESS'), false);

console.log('\n  Terminal');
check('    a delivered project cannot be moved',
  canSetProjectStatus(project({ status: 'DELIVERED', deliverableCount: 1 }), 'IN_PROGRESS'), false);
check('    a delivered project cannot be re-delivered',
  canSetProjectStatus(project({ status: 'DELIVERED', deliverableCount: 1 }), 'COMPLETED'), false);
is('    a delivered project offers no buttons',
  nextProjectStatuses(project({ status: 'DELIVERED' })), []);

console.log('\n  Revisions');
ok('    remaining revisions are reported',
  /2 of 3/.test(revisionNote(project({ revisionsUsed: 1 })) ?? ''));
ok('    the allowance being spent is reported',
  /All 3/.test(revisionNote(project({ revisionsUsed: 3 })) ?? ''));
ok('    going over is recorded, not blocked',
  /beyond/.test(revisionNote(project({ revisionsUsed: 5 })) ?? ''));
check('    a fourth revision on a three-revision package is still allowed',
  canSetProjectStatus(project({ status: 'COMPLETED', revisionsUsed: 3 }), 'REVISION_REQUESTED'), true);

console.log('\n  Coverage');
ok('    every status in the flow has a label',
  PROJECT_FLOW.every((s) => Boolean(PROJECT_LABEL[s])));
ok('    every enum value appears in the flow', (() => {
  // Guards the case where a status is added to the schema and quietly never
  // becomes reachable from the UI.
  const enumValues: ProjectStatus[] = [
    'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'FILES_RECEIVED', 'IN_PROGRESS',
    'FIRST_PREVIEW_READY', 'REVISION_REQUESTED', 'FINALISING', 'COMPLETED', 'DELIVERED',
  ];
  return enumValues.every((v) => PROJECT_FLOW.includes(v));
})());
check('    an invented status is refused',
  canSetProjectStatus(project(), 'BANANA' as ProjectStatus), false);

/* ============================================================
   2. Routes and guards
   ============================================================ */

console.log('\nRoutes and guards\n');

const SCREENS = [
  'src/app/app/layout.tsx',
  'src/app/app/login/page.tsx',
  'src/app/app/(tabs)/layout.tsx',
  'src/app/app/(tabs)/page.tsx',
  'src/app/app/(tabs)/beats/page.tsx',
  'src/app/app/(tabs)/beats/[id]/page.tsx',
  'src/app/app/(tabs)/orders/page.tsx',
  'src/app/app/(tabs)/orders/[id]/page.tsx',
  'src/app/app/(tabs)/projects/page.tsx',
  'src/app/app/(tabs)/projects/[id]/page.tsx',
  'src/app/app/(tabs)/site/page.tsx',
  'src/app/app/(tabs)/site/releases/page.tsx',
  'src/app/app/(tabs)/site/portfolio/page.tsx',
  'src/app/app/(tabs)/site/content/page.tsx',
  'src/app/app/(tabs)/site/content/[slug]/page.tsx',
  'src/app/app/(tabs)/site/media/page.tsx',
  'src/app/app/(tabs)/more/page.tsx',
  'src/app/app/(tabs)/customers/page.tsx',
  'src/app/app/(tabs)/services/page.tsx',
  'src/app/app/(tabs)/analytics/page.tsx',
  'src/app/app/(tabs)/account/security/page.tsx',
  'src/app/app/(tabs)/account/alerts/page.tsx',
  'src/app/app/(tabs)/account/settings/page.tsx',
];

console.log('  Screens exist');
for (const s of SCREENS) ok(`    ${s.replace('src/app/app/', '')}`, has(s));

console.log('\n  Every screen behind the tab bar checks the session');
for (const s of SCREENS) {
  if (!s.includes('(tabs)') || s.endsWith('(tabs)/layout.tsx')) continue;
  const src = read(s);
  ok(`    ${s.replace('src/app/app/(tabs)/', '')}`,
    src.includes('requireAdmin()') || src.includes('currentAdmin()'));
}

console.log('\n  Live data is never cached');
for (const s of SCREENS) {
  if (s.endsWith('layout.tsx') && !s.includes('(tabs)')) continue;
  ok(`    ${s.replace('src/app/app/', '')} is dynamic`,
    read(s).includes("dynamic = 'force-dynamic'"));
}

console.log('\n  Server actions are guarded');
/**
 * Walks every action file the phone imports from and asserts each exported
 * server action calls requireAdmin() or requireOwner() in its own body.
 *
 * This is the check that matters most in the whole file. Middleware only
 * redirects browsers; a server action is a public HTTP endpoint that can be
 * invoked directly with a crafted POST, so the guard has to be inside the
 * function, not upstream of it.
 */
const ACTION_FILES = [
  'src/app/admin/(dash)/beats/actions.ts',
  'src/app/admin/(dash)/orders/actions.ts',
  'src/app/admin/(dash)/releases/actions.ts',
  'src/app/admin/(dash)/portfolio/actions.ts',
  'src/app/admin/(dash)/projects/actions.ts',
  'src/app/admin/(dash)/media/actions.ts',
  'src/app/admin/(dash)/site/actions.ts',
  'src/app/admin/(dash)/services/actions.ts',
  'src/app/admin/(dash)/settings/actions.ts',
  'src/app/app/account/actions.ts',
];

/**
 * The one action that legitimately has no guard, and why.
 *
 * `appSignOut` calls `signOut()`, which reads the caller's own cookie and
 * deletes the session it names. It takes no id, so there is nothing to
 * authorise — and requiring a valid session to sign out would mean someone
 * whose session had already expired could never clear the stale cookie.
 *
 * Kept as a named list rather than a pattern so that adding a second
 * exemption is a deliberate act somebody has to justify here.
 */
const UNGUARDED_BY_DESIGN = new Set(['appSignOut']);

for (const file of ACTION_FILES) {
  if (!has(file)) { fail(`    ${file} is missing`); continue; }
  const src = read(file);

  // Split on the exported async functions, then look inside each body.
  const parts = src.split(/export async function /).slice(1);
  const unguarded: string[] = [];
  for (const part of parts) {
    const name = part.slice(0, part.indexOf('(')).trim();
    if (UNGUARDED_BY_DESIGN.has(name)) continue;
    // The body ends at the next export; good enough because these files
    // declare exports at the top level only.
    const body = part;
    if (!/require(Admin|Owner)\(\)/.test(body)) unguarded.push(name);
  }
  ok(`    ${file.replace('src/app/', '')} — ${parts.length} action${parts.length === 1 ? '' : 's'}, all guarded`,
    unguarded.length === 0);
  if (unguarded.length) console.log(`        unguarded: ${unguarded.join(', ')}`);
}

console.log('\n  The login route is reachable while signed out');
{
  const mw = read('middleware.ts');
  ok('    /app is gated by the session cookie', mw.includes("pathname.startsWith('/app')"));
  ok('    /app/login is exempt', mw.includes("pathname !== '/app/login'"));
  ok('    the service worker is exempt', mw.includes("pathname !== '/app/sw.js'"));
  ok('    the manifest is exempt', mw.includes("pathname !== '/app/manifest.webmanifest'"));
  ok('    the matcher covers /app', mw.includes("'/app/:path*'"));
}

console.log('\n  Open redirect is closed');
{
  const login = read('src/app/app/login/page.tsx');
  ok('    only in-app paths are followed after sign-in', login.includes("startsWith('/app')"));
  ok('    protocol-relative URLs are rejected', login.includes("startsWith('//')"));
}

console.log('\n  Nothing in the phone app can mark an order paid');
{
  /**
   * The single most important product rule in the project: an order becomes
   * paid only when SSLCOMMERZ confirms it to our server.
   *
   * Checked as behaviour rather than as prose. Grepping for the phrase finds
   * the deliberate sentences explaining that the button does not exist, which
   * is the opposite of a defect — so this looks for the code that would
   * actually do it instead.
   */
  const appFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry)) appFiles.push(rel);
    }
  };
  walk('src/app/app');

  const setsPaid = appFiles.filter((f) => /setOrderStatus\([^)]*['"`]PAID/.test(read(f)));
  ok(`    ${appFiles.length} files checked, none call setOrderStatus with PAID`, setsPaid.length === 0);
  if (setsPaid.length) console.log(`        offenders: ${setsPaid.join(', ')}`);

  /**
   * Reading `status: 'PAID'` is normal and everywhere — it is how revenue is
   * filtered. WRITING an order from a screen is the thing that must never
   * happen: every order mutation belongs in a guarded server action, so the
   * phone should not touch prisma.order.update/create at all.
   */
  const writesOrders = appFiles.filter((f) =>
    /prisma\.order\.(update|updateMany|create|upsert|delete)/.test(read(f)));
  ok('    no screen writes an order directly — mutations go through guarded actions',
    writesOrders.length === 0);
  if (writesOrders.length) console.log(`        offenders: ${writesOrders.join(', ')}`);

  // And the rule itself still holds at its source.
  ok('    order-rules refuses a hand-set PAID',
    /next === 'PAID'[\s\S]{0,200}ok: false/.test(read('src/lib/order-rules.ts')));
}

/* ============================================================
   3. The install surface
   ============================================================ */

console.log('\nInstall surface\n');

console.log('  Manifest');
{
  const src = read('src/app/app/manifest.webmanifest/route.ts');
  ok('    scoped to /app/', src.includes("scope: '/app/'"));
  ok('    starts at /app', src.includes("start_url: '/app'"));
  ok('    standalone display', src.includes("display: 'standalone'"));
  ok('    background matches --ink', src.includes('#040405'));
  ok('    declares a maskable icon', src.includes("purpose: 'maskable'"));
}

console.log('\n  Icons on disk');
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'badge.png']) {
  const p = `public/app/${f}`;
  ok(`    ${f}`, has(p) && statSync(join(process.cwd(), p)).size > 1000);
}

console.log('\n  Service worker');
{
  const sw = read('public/app/sw.js');
  ok('    exists at /app/sw.js so its scope is /app/', has('public/app/sw.js'));
  ok('    handles push', sw.includes("addEventListener('push'"));
  ok('    handles notification taps', sw.includes("addEventListener('notificationclick'"));
  ok('    handles subscription rotation', sw.includes("addEventListener('pushsubscriptionchange'"));
  ok('    takes over immediately', sw.includes('skipWaiting'));
  // The deliberate absence: caching a live order list would be a lie with a
  // timestamp. If a future change adds a fetch handler, this fails loudly.
  ok('    caches no pages — no fetch handler', !sw.includes("addEventListener('fetch'"));
}

console.log('\n  Headers');
{
  const cfg = read('next.config.ts');
  ok('    /app is noindex', /source: '\/app\/:path\*'[\s\S]{0,200}noindex/.test(cfg));
  ok('    /app is never cached', /source: '\/app\/:path\*'[\s\S]{0,300}no-store/.test(cfg));
  ok('    the worker revalidates every launch',
    /source: '\/app\/sw\.js'[\s\S]{0,200}must-revalidate/.test(cfg));
  ok('    Service-Worker-Allowed is set', cfg.includes('Service-Worker-Allowed'));
}

console.log('\n  Face ID is bound to the right domain');
{
  /**
   * The regression this guards is invisible until someone tries to sign in.
   * APP_URL is unset in production on purpose, so deriving the relying-party
   * ID from it alone would mint every credential for "localhost".
   */
  const pk = read('src/lib/passkey.ts');
  ok('    the relying-party ID falls back to the request host',
    pk.includes('hostFromRequest'));
  ok('    it never silently defaults to localhost in production',
    !/return 'localhost';/.test(pk));
  ok('    an explicit override exists', pk.includes('WEBAUTHN_RP_ID'));
  ok('    the origin is compared exactly', pk.includes('expectedOrigin'));
  ok('    a biometric is required, not just an unlocked phone',
    /userVerification: 'required'/.test(pk));
}

console.log('\n  Viewport');
{
  const layout = read('src/app/app/layout.tsx');
  ok('    viewport-fit=cover, so safe-area insets are non-zero',
    layout.includes("viewportFit: 'cover'"));
  /* Comments are stripped before the test. The docblock in that file explains
     at length why maximumScale is deliberately absent, and a check that trips
     over its own explanation is worse than no check. */
  const code = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('    zoom is left enabled', !/maximumScale\s*:/.test(code));
  ok('    marked as an iOS web app', layout.includes('appleWebApp'));
  ok('    never indexed', layout.includes('index: false'));
}

console.log('\n  Inputs cannot trigger the iOS zoom-on-focus');
{
  const css = read('src/app/app/app.css');
  // 16px exactly is the threshold. Anything smaller and Safari zooms the
  // viewport on focus and never zooms back.
  ok('    .in is 16px', /\.in\s*\{[^}]*font-size:\s*16px/.test(css));
  ok('    the page itself does not bounce', css.includes('overscroll-behavior-y: none'));
  ok('    no grey tap highlight', css.includes('-webkit-tap-highlight-color: transparent'));
  ok('    reduced motion is respected', css.includes('prefers-reduced-motion'));
}

/* ============================================================ */

console.log(
  failures === 0
    ? '\nAll checks passed.\n'
    : `\n${failures} check${failures === 1 ? '' : 's'} FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
