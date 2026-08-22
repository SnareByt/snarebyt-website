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
import { codeState, type DiscountRow } from '../src/lib/discount-rules';
import { normaliseMode } from '../src/lib/site-mode-rules';
import { normaliseFlow } from '../src/lib/checkout-flow-rules';
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
  'src/app/app/(tabs)/customers/[id]/page.tsx',
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

console.log('\n  Every screen paints instantly on tap');
{
  /**
   * Every screen here is force-dynamic and queries Postgres, so without a
   * loading.tsx a tap shows nothing at all until the round trip finishes.
   * That gap is the single clearest tell that an app is a web page — native
   * apps do not have less latency, they just never show you a blank screen
   * while they wait.
   *
   * Next renders the nearest loading.tsx the moment a navigation starts, so
   * one has to exist beside every page.
   */
  let missing = 0;
  for (const s of SCREENS) {
    if (!s.includes('(tabs)') || s.endsWith('layout.tsx')) continue;
    const loader = s.replace(/page\.tsx$/, 'loading.tsx');
    if (!has(loader)) { missing += 1; console.log(`        missing: ${loader}`); }
  }
  ok(`    all ${SCREENS.filter((s) => s.includes('(tabs)') && s.endsWith('page.tsx')).length} tab screens have a skeleton`,
    missing === 0);
}

console.log('\n  The home pulse chart');
{
  /**
   * The one non-negotiable in charting: never two y-scales on one plot.
   * Revenue is thousands of taka, visitors are tens of people, and where two
   * axes get pinned relative to each other is arbitrary — the chart would
   * invent a correlation that is a property of the axis alignment rather than
   * of the business. The toggle is what makes one honest axis possible.
   */
  const pulse = read('src/components/app/Pulse.tsx');
  ok('    shows one measure at a time, never two y-scales',
    /useState<Metric>/.test(pulse) && !/y2Scale|rightAxis|secondaryAxis/.test(pulse));
  ok('    the baseline is zero, not the minimum',
    /Math\.max\(\.\.\.series, 1\)/.test(pulse));
  ok('    growth from nothing is not reported as a percentage',
    /prev > 0 \? Math\.round/.test(pulse));
  ok('    every value is reachable as text, not colour alone',
    /<table className="sr-only">/.test(pulse));
  ok('    no charting library on the first screen of the app',
    !/recharts|chart\.js|d3|victory|nivo/i.test(pulse));

  const analytics = read('src/lib/analytics.ts');
  ok('    money counts only SSLCOMMERZ-validated orders',
    /getPulse[\s\S]{0,1400}"status" = 'PAID'/.test(analytics));
  ok('    and counts them on the day the money arrived',
    /getPulse[\s\S]{0,1400}date_trunc\('day', "paidAt"\)/.test(analytics));
  ok('    a day with no sales is drawn as zero, not skipped',
    /moneyBy\.get\(k\) \?\? 0/.test(analytics));

  const today = read('src/app/app/(tabs)/page.tsx');
  ok('    a failed chart costs the chart, not the home screen',
    /getPulse\(14\)\.catch\(\(\) => null\)/.test(today));
}

console.log('\n  A decorative count never takes out a screen');
{
  /**
   * Three 500s in a row came from the same shape of mistake: an unguarded
   * count on a render path, where the number was only ever a subtitle.
   *
   * /app/more was the worst of them — Promise.all discards five successful
   * queries when the sixth rejects, so a missing WebAuthnCredential table
   * removed the only route to Settings, Security and Alerts. Meanwhile
   * /app/login stayed up through the identical failure purely because its
   * count was wrapped.
   */
  const more = read('src/app/app/(tabs)/more/page.tsx');
  ok('    /app/more keeps the counts that worked',
    more.includes('Promise.allSettled'));
  ok('    and does not claim zero for a count it could not fetch',
    /=== null \? '—'/.test(more));

  const tabs = read('src/app/app/(tabs)/layout.tsx');
  ok('    the tab badge falls back rather than throwing',
    /\.catch\(\(\) => 0\)/.test(tabs));

  const login = read('src/app/app/login/page.tsx');
  ok('    the login screen still guards its passkey count',
    /webAuthnCredential\.count\(\)\.catch\(/.test(login));

  // The one that would have told him which screen broke, two rounds sooner.
  ok('    a failed screen shows the real message, not just a digest',
    has('src/app/app/error.tsx') && read('src/app/app/error.tsx').includes('error.message'));
}

console.log('\n  The tab bar commits to the press immediately');
{
  const tabs = read('src/components/app/TabBar.tsx');
  ok('    the pressed tab lights up before the navigation lands',
    /onClick=\{\(\) => setPending\(href\)\}/.test(tabs));
  ok('    and gives way once the real pathname settles',
    /useEffect\(\(\) => setPending\(null\), \[path\]\)/.test(tabs));
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
  'src/app/admin/(dash)/customers/actions.ts',
  'src/app/admin/(dash)/discounts/actions.ts',
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
  /* Next accepts the middleware at the repo root or inside src/, and the
     project moved it to src/ when the admin gained its private front door.
     Looking in one place only meant this whole suite crashed on a file move
     rather than reporting a failure — so it looks in both and says so if
     neither is there. */
  const mwPath = ['src/middleware.ts', 'middleware.ts'].find(has);
  ok('    the middleware was found', Boolean(mwPath));
  const mw = mwPath ? read(mwPath) : '';
  ok('    /app is gated by the session cookie', mw.includes("pathname.startsWith('/app')"));
  ok('    /app/login is exempt', mw.includes("pathname !== '/app/login'"));
  ok('    the service worker is exempt', mw.includes("pathname !== '/app/sw.js'"));
  ok('    the manifest is exempt', mw.includes("pathname !== '/app/manifest.webmanifest'"));
  ok('    the matcher covers /app', mw.includes("'/app/:path*'"));
}

console.log('\n  The way back in survives a broken database');
{
  /**
   * The login screen is how you recover when everything else is down, so it
   * must never be the thing that is down. A database that is unreachable,
   * mid-migration, or holding a schema the deployed code does not expect has
   * to degrade to "you are signed out, here is the form".
   *
   * This is not hypothetical: a schema pushed from the wrong branch once made
   * /app/login throw on both of its database calls while the public site
   * stayed up, because the public header already wrapped its session read and
   * this screen did not.
   */
  const login = read('src/app/app/login/page.tsx');
  ok('    a session that cannot be read means signed out, not a 500',
    /currentAdmin\(\)\.catch\(/.test(login));
  ok('    a missing passkey table hides the button rather than the screen',
    /webAuthnCredential\.count\(\)\.catch\(/.test(login));
  ok('    redirect() stays outside the catch — it works by throwing',
    /const signedIn = await currentAdmin\(\)\.catch/.test(login)
    && /if \(signedIn\) redirect/.test(login));

  const tabs = read('src/app/app/(tabs)/layout.tsx');
  ok('    a stale cookie reaches the login screen, not an error page',
    /currentAdmin\(\)\.catch\(/.test(tabs));
  ok('    a failed badge count costs the badge, not the dashboard',
    /\.catch\(\(\) => 0\)/.test(tabs));
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

console.log('\n  The tab bar is a floating glass capsule');
{
  const css = read('src/app/app/app.css');
  const tabbar = css.slice(css.indexOf('\n.tabbar {'), css.indexOf('\n.tab {'));

  ok('    it floats free of the screen edges',
    /left:\s*max\(var\(--tabbar-inset\)/.test(tabbar) && /right:\s*max\(var\(--tabbar-inset\)/.test(tabbar));
  ok('    it is lifted clear of the home indicator',
    /bottom:\s*calc\(var\(--sa-bottom\)\s*\+\s*var\(--tabbar-lift\)\)/.test(tabbar));
  ok('    it is a capsule, not a strip', /border-radius:\s*calc\(var\(--tabbar\)\s*\/\s*2\)/.test(tabbar));

  /* All three, or it reads as grey plastic: blur without saturation is fog,
     and without brightness the near-black content leaves nothing to refract. */
  ok('    the material blurs, saturates and brightens',
    /backdrop-filter:\s*blur\([^)]+\)\s*saturate\([^)]+\)\s*brightness\(/.test(tabbar));
  ok('    prefixed for Safari', tabbar.includes('-webkit-backdrop-filter'));
  ok('    it has a specular top rim', /inset 0 1px 0 rgba\(255, 255, 255, \.2/.test(tabbar));
  ok('    it casts a shadow, so it reads as lifted', /box-shadow:\s*\n?\s*0 14px 44px/.test(tabbar));

  // Content must clear the bar AND the gap under it, or the last row hides.
  ok('    content clears the bar and its lift',
    css.includes('padding-bottom: calc(var(--tabbar) + var(--sa-bottom) + var(--tabbar-lift) + 1.4rem)'));

  const pill = css.slice(css.indexOf('.tabbar::before {'), css.indexOf('\n.tab {'));
  ok('    the lozenge is sized from the tab count, not a hardcoded five',
    /width:\s*calc\(\(100% - 8px\) \/ var\(--count/.test(pill));
  ok('    the lozenge is positioned from the active index',
    /translateX\(calc\(var\(--active/.test(pill));
  ok('    it springs rather than eases', /transition:\s*transform [^;]*var\(--spring\)/.test(pill));

  /* On a flat black strip --dim was a fine "off" state. On glass the bar
     lightens wherever colourful content passes under it, and #5C5C66 vanished
     into a cover-art thumbnail. */
  const tab = css.slice(css.indexOf('\n.tab {'), css.indexOf('.tab svg'));
  ok('    inactive labels stay legible over bright content',
    tab.includes('color: var(--muted)') && !tab.includes('color: var(--dim)'));

  /**
   * The fallback has to come AFTER the rules it overrides.
   *
   * @supports adds no specificity, so an identical selector earlier in the
   * file loses on source order and the fallback silently does nothing. That
   * was already true of the old bar: its no-backdrop-filter rule sat next to
   * the nav bar's, 90 lines above the .tabbar block that overrode it.
   */
  const fallbacks = [...css.matchAll(/@supports not \(\(-webkit-backdrop-filter/g)].map((m) => m.index ?? 0);
  const tabbarAt = css.indexOf('\n.tabbar {');
  ok('    the no-backdrop-filter fallback can actually win',
    fallbacks.some((i) => i > tabbarAt));
}

console.log('\n  Reduced motion');
{
  const css = read('src/app/app/app.css');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.tabbar::before')));
  ok('    the lozenge stops sliding', /\.tabbar::before\s*\{\s*transition:\s*none/.test(block));
  ok('    the press-scale is removed rather than shortened',
    /\.tab:active\s*\{\s*transform:\s*none/.test(block));
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

/* ============================================================
   What the phone can switch
   ============================================================ */

console.log('\nWhat the phone can switch\n');

console.log('  Site mode');
{
  /* Every one of these resolves to `live`. The point is that no bad value can
     take the site offline by accident — a typo, a row written by an older
     build, or nothing at all all mean "open". The phone screen renders this
     function's answer, so an unrecognised value shows Live rather than an
     empty radio group with nothing ticked. */
  is('    a missing row is live', normaliseMode(undefined), 'live');
  is('    an empty value is live', normaliseMode(''), 'live');
  is('    an unrecognised value is live', normaliseMode('offline'), 'live');
  is('    soon survives', normaliseMode('soon'), 'soon');
  is('    maintenance survives', normaliseMode('maintenance'), 'maintenance');
}

console.log('\n  Checkout flow');
{
  is('    a missing row goes straight to the gateway', normaliseFlow(undefined), 'direct');
  is('    an unrecognised value goes straight to the gateway', normaliseFlow('nonsense'), 'direct');
  is('    review survives', normaliseFlow('review'), 'review');
}

console.log('\n  Discount code state');
{
  const code = (o: Partial<DiscountRow> = {}): DiscountRow => ({
    code: 'LAUNCH25',
    percentOff: 25,
    amountOffBdt: null,
    minSpendBdt: null,
    maxUses: null,
    usedCount: 0,
    perUserLimit: 1,
    startsAt: null,
    endsAt: null,
    active: true,
    ...o,
  });
  const now = new Date('2026-06-15T12:00:00Z');
  const d = (iso: string) => new Date(iso);

  is('    a plain active code is live', codeState(code(), now), 'live');
  is('    switched off reads as off', codeState(code({ active: false }), now), 'off');
  is('    all uses spent', codeState(code({ maxUses: 5, usedCount: 5 }), now), 'used-up');
  is('    one use left is still live', codeState(code({ maxUses: 5, usedCount: 4 }), now), 'live');
  is('    past its end date', codeState(code({ endsAt: d('2026-06-01T00:00:00Z') }), now), 'expired');
  is('    not started yet', codeState(code({ startsAt: d('2026-07-01T00:00:00Z') }), now), 'scheduled');
  is('    inside its window is live',
    codeState(code({ startsAt: d('2026-06-01T00:00:00Z'), endsAt: d('2026-07-01T00:00:00Z') }), now), 'live');

  /* Off wins over expired. Both are true of this code, and "off" is the one
     an admin can undo with a tap — telling him it is expired would send him
     to edit a date that is not the reason it stopped working. */
  is('    off is reported before expired',
    codeState(code({ active: false, endsAt: d('2026-01-01T00:00:00Z') }), now), 'off');
  /* No maxUses means unlimited, not zero. A code used 900 times with no cap
     is still working, and reporting it as spent would take a live promo off
     the site by mistake. */
  is('    no cap means unlimited', codeState(code({ maxUses: null, usedCount: 900 }), now), 'live');
}

/* ============================================================
   Shared actions: does the phone send everything the schema parses?
   ============================================================

   The phone reuses the desktop's server actions rather than reimplementing
   them, which is the right architecture and has one sharp edge.

   A server action parses `Object.fromEntries(formData)` with a zod schema. A
   field the browser does not render is a field the browser does not submit,
   and zod fills a missing key with its `.default(...)`. So an incomplete form
   does not leave those values alone — it OVERWRITES them with defaults, and
   nothing anywhere reports an error, because from the action's point of view
   the submission was valid.

   This is not hypothetical. Both of these shipped:

     - Settings had no `siteMode` or `checkoutFlow` control, so changing the
       USD rate from a phone put a site that was under maintenance back online
       and reset the checkout flow on the way past.
     - Portfolio had no `videoUrl` control, so editing a credit's title from a
       phone erased the video from its card.

   The reverse is checked too. `appleMusicUrl` sat on the phone release form
   for months looking like a working field; no schema had it and no action read
   it, so every link typed into it was silently discarded.

   Hence: the set of form field names must equal the set of schema keys.
   ============================================================ */

console.log('\nShared actions\n');
{
  const validators = read('src/lib/validators.ts');

  /** The keys a zod object schema parses, read out of the source. */
  const schemaKeys = (name: string): string[] => {
    const m = validators.match(new RegExp(`export const ${name} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\)`));
    if (!m) return [];
    return [...m[1].matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((x) => x[1]);
  };

  /** The `name="..."` attributes a form renders, plus any it sets by hand. */
  const formFields = (file: string): Set<string> => {
    const src = read(file);
    const rendered = [...src.matchAll(/name="([A-Za-z0-9_]+)"/g)].map((x) => x[1]);
    // A field the component fills in itself is submitted just the same. The
    // beat editor does this for `status`, deliberately: the value is not
    // editable on the phone but must be preserved through a save.
    const set = [...src.matchAll(/formData\.set\(\s*'([A-Za-z0-9_]+)'/g)].map((x) => x[1]);
    return new Set([...rendered, ...set]);
  };

  const CASES: { form: string; schema: string; actions: string; label: string }[] = [
    { form: 'src/app/app/(tabs)/account/settings/SettingsForm.tsx', schema: 'settingsSchema',
      actions: 'src/app/admin/(dash)/settings/actions.ts', label: 'settings' },
    { form: 'src/app/app/(tabs)/site/portfolio/PortfolioList.tsx', schema: 'portfolioSchema',
      actions: 'src/app/admin/(dash)/portfolio/actions.ts', label: 'portfolio' },
    { form: 'src/app/app/(tabs)/site/releases/ReleaseList.tsx', schema: 'releaseSchema',
      actions: 'src/app/admin/(dash)/releases/actions.ts', label: 'releases' },
    { form: 'src/app/app/(tabs)/beats/[id]/BeatEditor.tsx', schema: 'beatSchema',
      actions: 'src/app/admin/(dash)/beats/actions.ts', label: 'beats' },
  ];

  for (const c of CASES) {
    // `id` distinguishes create from update and is carried separately.
    const want = schemaKeys(c.schema).filter((k) => k !== 'id');
    const got = formFields(c.form);

    ok(`  ${c.label}: the schema was found`, want.length > 0);

    const missing = want.filter((k) => !got.has(k));
    ok(
      `  ${c.label}: every parsed field is on the phone${missing.length ? ` — missing ${missing.join(', ')}` : ''}`,
      missing.length === 0,
    );

    /**
     * A field nothing reads.
     *
     * A name is legitimate if the schema parses it, OR the action reads it
     * off the FormData directly — `_signature` is the second kind: it is the
     * stale-write guard, deliberately outside the schema. A form also
     * legitimately carries controls for OTHER actions (a price sheet, a
     * toggle), so a name mentioned anywhere in validators or in the form's
     * own code is left alone too.
     *
     * What is left is the case this exists for: appleMusicUrl, which sat on
     * the release form for months, was parsed by no schema, read by no
     * action, and silently discarded every link typed into it.
     */
    const actionSrc = has(c.actions) ? read(c.actions) : '';
    const stray = [...got].filter(
      (k) => !want.includes(k)
        && !actionSrc.includes(`get('${k}')`)
        && !validators.includes(`${k}:`)
        && !read(c.form).includes(`'${k}'`),
    );
    ok(
      `  ${c.label}: no field that nothing reads${stray.length ? ` — stray ${stray.join(', ')}` : ''}`,
      stray.length === 0,
    );
  }
}

/* ============================================================ */

console.log(
  failures === 0
    ? '\nAll checks passed.\n'
    : `\n${failures} check${failures === 1 ? '' : 's'} FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
