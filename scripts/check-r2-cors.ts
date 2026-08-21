/**
 * Can the browser upload straight to R2?
 *
 * check-r2.ts proves the buckets work, but it uploads from Node, and Node
 * ignores CORS entirely. The admin and the artist portal both upload from a
 * browser, which does not. A bucket with no CORS rule passes every check in
 * check-r2.ts and still fails every real upload, with a network error that
 * looks like a broken bucket rather than a missing policy.
 *
 * This sends the exact preflight a browser sends before a presigned PUT.
 * A CORS preflight is answered from the bucket's policy BEFORE any
 * authentication happens, which is why this needs no keys — only the account
 * id, which is not a secret and appears in every R2 URL you have.
 *
 *   npx tsx --env-file=.env scripts/check-r2-cors.ts [origin]
 */

const siteOrigin = process.argv[2] ?? process.env.SITE_ORIGIN ?? 'https://www.snarebyt.com';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const account = process.env.R2_ACCOUNT_ID?.trim();
const priv = process.env.R2_BUCKET_PRIVATE?.trim();
const pub = process.env.R2_BUCKET_PUBLIC?.trim();

const POLICY = `[
  {
    "AllowedOrigins": ["https://www.snarebyt.com", "https://snarebyt.com", "http://localhost:3001"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]`;

if (!account || !priv || !pub) {
  console.log(`
Cannot check — missing ${[
    !account && 'R2_ACCOUNT_ID',
    !priv && 'R2_BUCKET_PRIVATE',
    !pub && 'R2_BUCKET_PUBLIC',
  ].filter(Boolean).join(', ')} in .env

R2_ACCOUNT_ID is not a secret. Cloudflare dashboard → R2 → any bucket →
Settings; it is also the long id in the S3 API endpoint shown there, and in
the address bar. No access key is needed for this check.

If you would rather not bother: applying the policy below is harmless when it
is already set, so you can skip straight to it.

Cloudflare → R2 → the bucket → Settings → CORS policy → Edit:

${POLICY}

Both buckets need it. The private one carries the masters, WAVs, stems and
everything an artist uploads, so without it the studio can upload artwork and
nothing a buyer or a client actually receives.
`);
  process.exit(1);
}

async function probe(label: string, bucket: string) {
  const url = `https://${account}.r2.cloudflarestorage.com/${bucket}/_cors-probe/${Date.now()}.bin`;

  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: siteOrigin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    },
  }).catch((e) => { fail(`${label} — preflight threw: ${(e as Error).message}`); return null; });

  if (!res) return;

  const allowOrigin = res.headers.get('access-control-allow-origin');
  const allowMethod = res.headers.get('access-control-allow-methods') ?? '';
  const allowHeaders = res.headers.get('access-control-allow-headers') ?? '';

  if (!allowOrigin) {
    fail(`${label} (${bucket}) — no CORS rule. The browser refuses the upload before sending a byte.`);
    return;
  }
  if (allowOrigin !== '*' && allowOrigin.toLowerCase() !== siteOrigin.toLowerCase()) {
    fail(`${label} (${bucket}) — allows "${allowOrigin}", not ${siteOrigin}`);
    return;
  }
  if (!/put/i.test(allowMethod)) {
    fail(`${label} (${bucket}) — allows ${allowMethod || 'no methods'}; PUT is required to upload`);
    return;
  }
  // The presigned PUT sets content-type, so it must be an allowed header or
  // the preflight passes and the real request is still blocked.
  if (allowHeaders && !/content-type|\*/i.test(allowHeaders)) {
    fail(`${label} (${bucket}) — does not allow the content-type header, which every upload sends`);
    return;
  }
  pass(`${label} (${bucket}) accepts browser PUT from ${allowOrigin}`);
}

async function run() {
  console.log(`\nBrowser upload preflight — origin ${siteOrigin}\n`);
  await probe('PRIVATE bucket', priv!);
  await probe('PUBLIC bucket', pub!);

  if (failures) {
    console.log(`
${failures} failure(s).

Fix: Cloudflare → R2 → the bucket → Settings → CORS policy → Edit:

${POLICY}

Both buckets need it. The private one carries the masters, WAVs, stems and
everything an artist uploads, so without it the studio can upload artwork and
nothing a buyer or a client actually receives.
`);
  } else {
    console.log('\nBoth buckets accept browser uploads.\n');
  }
  process.exit(failures ? 1 : 0);
}

run();

export {};
