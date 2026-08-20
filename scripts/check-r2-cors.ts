/**
 * Can the browser upload straight to R2?
 *
 * check-r2.ts proves the buckets work, but it uploads from Node — and Node
 * ignores CORS entirely. The admin uploads from a browser, which does not.
 * A bucket with no CORS rule passes every check in check-r2.ts and still
 * fails every real upload, with a network error that looks like a broken
 * bucket rather than a missing policy.
 *
 * This sends the exact preflight a browser sends before a presigned PUT:
 * OPTIONS, with Origin and Access-Control-Request-Method/Headers. R2 answers
 * from the bucket's CORS policy, so the reply is the policy.
 *
 *   npx tsx --env-file=.env scripts/check-r2-cors.ts [origin]
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const origin = process.argv[2] ?? process.env.SITE_ORIGIN ?? 'https://snarebyt.com';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_PRIVATE', 'R2_BUCKET_PUBLIC'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`\nMissing env: ${missing.join(', ')}\n`);
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function probe(label: string, bucket: string) {
  const key = `_cors-probe/${Date.now()}.bin`;
  const url = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'audio/wav' }),
    { expiresIn: 120 },
  );

  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    },
  }).catch((e) => { fail(`${label} — preflight threw: ${(e as Error).message}`); return null; });

  if (!res) return;

  const allowOrigin = res.headers.get('access-control-allow-origin');
  const allowMethod = res.headers.get('access-control-allow-methods') ?? '';

  if (!allowOrigin) {
    fail(`${label} (${bucket}) — no CORS rule. The browser will refuse the upload before it starts.`);
    return;
  }
  if (allowOrigin !== '*' && allowOrigin !== origin) {
    fail(`${label} (${bucket}) — CORS allows "${allowOrigin}", not ${origin}.`);
    return;
  }
  if (!/put/i.test(allowMethod)) {
    fail(`${label} (${bucket}) — CORS allows ${allowMethod || 'no methods'}; PUT is required to upload.`);
    return;
  }
  pass(`${label} (${bucket}) accepts browser PUT from ${allowOrigin}`);
}

async function main() {
  console.log(`\nBrowser upload preflight — origin ${origin}\n`);
  await probe('PRIVATE bucket', process.env.R2_BUCKET_PRIVATE!);
  await probe('PUBLIC bucket', process.env.R2_BUCKET_PUBLIC!);

  if (failures) {
    console.log(`
${failures} failure(s).

Fix in the Cloudflare dashboard: R2 → the bucket → Settings → CORS policy.

[
  {
    "AllowedOrigins": ["https://snarebyt.com", "http://localhost:3001"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]

Both buckets need it. The private one carries the masters, WAVs and stems,
so without it the admin can upload artwork and nothing a buyer receives.
`);
  } else {
    console.log('\nBoth buckets accept browser uploads.\n');
  }
  process.exit(failures ? 1 : 0);
}

main();
