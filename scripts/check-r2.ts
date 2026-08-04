/**
 * R2 connectivity check.
 *
 * Proves the credentials actually work rather than assuming they do, by doing
 * the exact round trip the site depends on:
 *
 *   1. presign an upload to the PRIVATE bucket and PUT a small file
 *   2. presign a download and GET it back, comparing the bytes
 *   3. confirm the object is NOT reachable without a signature
 *   4. repeat the upload against the PUBLIC bucket and check the public URL
 *   5. delete both test objects
 *
 * Step 3 is the important one. If a private object can be fetched without a
 * signed URL, the bucket is public and every unreleased stem is downloadable
 * by anyone who can guess a key.
 *
 * Run:  npm run check:r2
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';

const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_PRIVATE', 'R2_BUCKET_PUBLIC'];

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { failures++; console.log(`  ✗ ${m}`); };

async function main() {
  console.log('\nR2 connectivity check\n');

  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(`  ✗ missing in .env: ${missing.join(', ')}`);
    console.log(`
This checks your LOCAL .env only, at:
  ${process.cwd()}\\.env

If you set these in Vercel instead, the live site is fine and this failure
only means local development cannot upload. The live Media screen states
whether the deployed site can reach R2.
`);
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

  const PRIVATE = process.env.R2_BUCKET_PRIVATE!;
  const PUBLIC = process.env.R2_BUCKET_PUBLIC!;
  const key = `_healthcheck/${Date.now()}-${randomBytes(4).toString('hex')}.txt`;
  const body = `snarebyt r2 check ${new Date().toISOString()}`;

  // ---- private bucket round trip -------------------------------------
  try {
    const put = await getSignedUrl(r2, new PutObjectCommand({ Bucket: PRIVATE, Key: key, ContentType: 'text/plain' }), { expiresIn: 300 });
    const res = await fetch(put, { method: 'PUT', body, headers: { 'content-type': 'text/plain' } });
    if (res.ok) pass(`presigned upload to ${PRIVATE}`);
    else fail(`presigned upload to ${PRIVATE} — HTTP ${res.status}`);
  } catch (e) {
    fail(`presigned upload to ${PRIVATE} — ${(e as Error).message}`);
    console.log('\nCould not reach R2 at all. Check R2_ACCOUNT_ID and the API token.\n');
    process.exit(1);
  }

  try {
    const get = await getSignedUrl(r2, new GetObjectCommand({ Bucket: PRIVATE, Key: key }), { expiresIn: 300 });
    const res = await fetch(get);
    const text = await res.text();
    if (res.ok && text === body) pass('presigned download returned identical bytes');
    else fail(`presigned download mismatch — HTTP ${res.status}`);
  } catch (e) {
    fail(`presigned download — ${(e as Error).message}`);
  }

  // ---- the security check --------------------------------------------
  try {
    const naked = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${PRIVATE}/${key}`;
    const res = await fetch(naked);
    if (res.ok) fail(`PRIVATE BUCKET IS PUBLIC — ${naked} returned ${res.status}. Stems and unreleased masters are exposed.`);
    else pass(`private object refuses unsigned access (HTTP ${res.status})`);
  } catch {
    pass('private object refuses unsigned access');
  }

  // ---- public bucket --------------------------------------------------
  const pubKey = `_healthcheck/${Date.now()}-public.txt`;
  try {
    const put = await getSignedUrl(r2, new PutObjectCommand({ Bucket: PUBLIC, Key: pubKey, ContentType: 'text/plain' }), { expiresIn: 300 });
    const res = await fetch(put, { method: 'PUT', body, headers: { 'content-type': 'text/plain' } });
    if (res.ok) pass(`presigned upload to ${PUBLIC}`);
    else fail(`presigned upload to ${PUBLIC} — HTTP ${res.status}`);
  } catch (e) {
    fail(`presigned upload to ${PUBLIC} — ${(e as Error).message}`);
  }

  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) {
    fail('R2_PUBLIC_BASE_URL is not set — cover art and previews would have no URL');
  } else {
    try {
      const res = await fetch(`${base}/${pubKey}`);
      if (res.ok) pass(`public URL serves the object (${base})`);
      else fail(`public URL returned HTTP ${res.status} — ${base} is not serving ${PUBLIC}. Every cover image would 404.`);
    } catch (e) {
      fail(`public URL unreachable — ${base} (${(e as Error).message}). If the domain is not set up yet, use the r2.dev URL Cloudflare provides.`);
    }
  }

  // ---- clean up --------------------------------------------------------
  for (const [bucket, k] of [[PRIVATE, key], [PUBLIC, pubKey]] as const) {
    try { await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })); } catch { /* leave it; it is 40 bytes */ }
  }

  console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed. Uploads and secure downloads work.\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
