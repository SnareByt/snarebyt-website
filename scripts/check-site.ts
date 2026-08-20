/**
 * Site sweep — run against a running dev server.
 *
 *   npm run dev          (in one terminal)
 *   npm run check:site   (in another)
 *
 * Two jobs. First, every route still responds and its key content is actually
 * on the page — a page that renders an empty shell still returns HTTP 200, so
 * status codes alone prove nothing.
 *
 * Second, and more important, it guards the accuracy rules. Those were
 * explicit requests about a real person's professional reputation, and they
 * are the kind of thing that quietly comes back during a refactor. Cheaper to
 * fail a check than to find it live.
 */
const BASE = process.env.CHECK_BASE ?? 'http://localhost:3001';

type Check = [route: string, label: string, mustContain: string[]];

const CHECKS: Check[] = [
  ['/', 'Home', ['Heard everywhere', 'MADE IN', 'Awaiting a real client quote', 'Kotha Ko']],
  ['/music', 'Music', ['Live now', 'Cover art pending', 'Awaiting Spotify links', 'open.spotify.com/embed']],
  ['/beats', 'Beats', ['non-exclusive', 'বাংলায়', 'Lawyer review needed']],
  ['/services', 'Services', ['Cover Art Design', 'Mixing and Mastering', 'Vocal processing included']],
  ['/portfolio', 'Portfolio', ['Awaaz Utha', 'Kotha Ko', 'Producer']],
  ['/about', 'About', ['Samir Islam', 'Wrong Side', 'billions of views across TikTok']],
  ['/contact', 'Contact', ['Project brief', 'Submit project brief']],
  ['/admin/login', 'Admin login', ['Sign in', 'Admin access']],
  ['/admin', 'Admin gate', []], // must redirect, not render
];

/**
 * Must never appear on the public site. Each one was removed deliberately:
 * JD and Banglawood by request, the beatboxing history and BattleBoxBD
 * placing because the About page is not a timeline biography, and "Album Art"
 * because the service is called Cover Art Design.
 */
const FORBIDDEN = ['Banglawood', 'BattleBoxBD', 'beatboxing', 'Album Art'];

let fails = 0;

async function main() {
  console.log(`\nSite sweep — ${BASE}\n`);

  for (const [route, label, must] of CHECKS) {
    let res: Response;
    try {
      res = await fetch(BASE + route, { redirect: 'manual' });
    } catch {
      fails++;
      console.log(`  ✗ ${label.padEnd(24)} unreachable — is the dev server running?`);
      continue;
    }

    // The admin index must bounce an unauthenticated visitor, not render.
    if (route === '/admin') {
      if ([302, 307, 308].includes(res.status)) console.log(`  ✓ ${label.padEnd(24)} redirects (HTTP ${res.status})`);
      else { fails++; console.log(`  ✗ ${label.padEnd(24)} expected a redirect, got HTTP ${res.status}`); }
      continue;
    }

    if (res.status !== 200) {
      fails++;
      console.log(`  ✗ ${label.padEnd(24)} HTTP ${res.status}`);
      continue;
    }

    const html = await res.text();
    const missing = must.filter((m) => !html.toLowerCase().includes(m.toLowerCase()));
    if (missing.length) {
      fails++;
      console.log(`  ✗ ${label.padEnd(24)} missing: ${missing.join(', ')}`);
    } else {
      console.log(`  ✓ ${label.padEnd(24)} HTTP 200`);
    }

    if (!route.startsWith('/admin')) {
      const bad = FORBIDDEN.filter((f) => html.toLowerCase().includes(f.toLowerCase()));
      if (bad.length) {
        fails++;
        console.log(`      ✗ ACCURACY RULE BROKEN — found: ${bad.join(', ')}`);
      }
    }
  }

  console.log(fails ? `\n${fails} failure(s).\n` : '\nAll checks passed.\n');
  process.exit(fails ? 1 : 0);
}

main();

export {};
