import 'server-only';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes, createHash } from 'crypto';
import { prisma } from './prisma';

/**
 * Cloudflare R2, two buckets:
 *   PUBLIC  — cover art and TAGGED previews. Safe to cache on a CDN.
 *   PRIVATE — untagged MP3, WAV, stems, licence PDFs, client uploads.
 *             No public URL exists. Ever.
 *
 * R2 is chosen over S3 for one reason: zero egress fees. Beat stores
 * are download-heavy and S3 bandwidth would become the largest line
 * item on the bill.
 */
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

/** Browser uploads straight to R2. The file never touches the web server. */
export async function presignUpload(opts: {
  key: string;
  contentType: string;
  visibility: 'public' | 'private';
}) {
  const cmd = new PutObjectCommand({
    Bucket: opts.visibility === 'public' ? PUBLIC : PRIVATE,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  return getSignedUrl(r2, cmd, { expiresIn: 900 }); // 15 minutes to start the upload
}

export const publicUrl = (key: string) => `${process.env.R2_PUBLIC_BASE_URL}/${key}`;

/**
 * Issue a download grant for a purchased file.
 *
 * Four locks, not one:
 *   1. The order must be PAID (checked by the caller).
 *   2. The grant expires.
 *   3. Attempts are counted and capped.
 *   4. Every attempt is logged, so abuse is visible.
 *
 * The raw token is returned once and only its hash is stored.
 */
export async function issueDownloadGrant(
  orderItemId: string,
  baseUrl: string,
  hours = 24 * 14,
) {
  // The cap counts FILE fetches, not visits, and a stems licence is several
  // files. A flat 5 would lock a buyer out halfway through their own purchase,
  // so it scales with what they actually bought.
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { licenceTier: { select: { includedAssets: true } } },
  });
  const fileCount = item?.licenceTier?.includedAssets.length ?? 1;
  const maxAttempts = Math.max(5, fileCount * 3);

  const raw = randomBytes(24).toString('base64url');
  await prisma.downloadGrant.create({
    data: {
      orderItemId,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      maxAttempts,
      expiresAt: new Date(Date.now() + hours * 3600_000),
    },
  });

  // baseUrl is passed in, never read from APP_URL. That variable is unset in
  // production on purpose, and building the link from it produced the string
  // "undefined/download/…" — a dead link handed to someone who had paid.
  return `${baseUrl.replace(/\/$/, '')}/download/${raw}`;
}

/** Hash a raw download token the same way the grant stored it. */
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Short-lived signed URL, generated only after a grant has been validated. */
export async function presignDownload(objectKey: string, seconds = 300) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: PRIVATE, Key: objectKey }), {
    expiresIn: seconds,
  });
}
