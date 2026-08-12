import 'server-only';
import { prisma } from './prisma';
import { hashToken } from './storage';
import type { AssetKind } from '@prisma/client';

/**
 * Everything that decides whether a download token may have a file.
 *
 * It lives in one place because it is checked twice — once to render the page
 * and once for every actual file fetch — and two copies of a rule like this
 * drift until one of them is wrong.
 *
 * The rules, in order:
 *   1. The token must match a grant. Only the SHA-256 is stored, so a database
 *      dump does not hand anyone a working link.
 *   2. The grant must not be revoked or expired.
 *   3. The attempt cap must not be spent.
 *   4. The ORDER must be PAID. A grant issued in error is still worthless
 *      unless money actually arrived.
 *   5. The file must be one the purchased licence tier includes. This is the
 *      one that stops a buyer editing the asset id in the URL and taking the
 *      stems on an MP3 licence.
 */

export type DownloadFile = {
  assetId: string;
  kind: AssetKind;
  objectKey: string;
  label: string;
  bytes: number;
};

export type DownloadCheck =
  | { ok: true; grantId: string; orderNumber: string; beatTitle: string; tierName: string;
      files: DownloadFile[]; expiresAt: Date; remaining: number }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'spent' | 'unpaid' | 'no_files' };

const LABELS: Record<AssetKind, string> = {
  MP3_UNTAGGED: 'Untagged MP3 (320 kbps)',
  WAV: 'WAV (24-bit)',
  STEMS_ZIP: 'Track stems (ZIP)',
  SESSION_NOTES: 'Session notes',
};

export async function checkDownload(rawToken: string): Promise<DownloadCheck> {
  const grant = await prisma.downloadGrant.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!grant) return { ok: false, reason: 'not_found' };
  if (grant.revokedAt) return { ok: false, reason: 'revoked' };
  if (grant.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (grant.attempts >= grant.maxAttempts) return { ok: false, reason: 'spent' };

  const item = await prisma.orderItem.findUnique({
    where: { id: grant.orderItemId },
    include: {
      order: { select: { number: true, status: true } },
      licenceTier: { select: { name: true, includedAssets: true } },
      beat: { select: { title: true, assets: true } },
    },
  });
  if (!item || !item.order) return { ok: false, reason: 'not_found' };
  if (item.order.status !== 'PAID') return { ok: false, reason: 'unpaid' };
  if (!item.beat || !item.licenceTier) return { ok: false, reason: 'not_found' };

  // The intersection is the whole point: what exists AND what was paid for.
  const included = new Set(item.licenceTier.includedAssets);
  const files: DownloadFile[] = item.beat.assets
    .filter((a) => included.has(a.kind))
    .map((a) => ({
      assetId: a.id,
      kind: a.kind,
      objectKey: a.objectKey,
      label: LABELS[a.kind] ?? a.kind,
      bytes: Number(a.bytes),
    }));

  if (!files.length) return { ok: false, reason: 'no_files' };

  return {
    ok: true,
    grantId: grant.id,
    orderNumber: item.order.number,
    beatTitle: item.beat.title,
    tierName: item.licenceTier.name,
    files,
    expiresAt: grant.expiresAt,
    remaining: grant.maxAttempts - grant.attempts,
  };
}

export const REASON_TEXT: Record<Exclude<DownloadCheck & { ok: false }, never>['reason'], string> = {
  not_found: 'This download link is not valid. Check you copied all of it.',
  revoked: 'This download link has been withdrawn. Message SnareByt and it will be sorted.',
  expired: 'This download link has expired. Message SnareByt for a fresh one — your purchase still stands.',
  spent: 'This link has been used the maximum number of times. Message SnareByt for a fresh one — your purchase still stands.',
  unpaid: 'This order has not been paid yet, so there is nothing to download.',
  no_files: 'The files for this purchase are not ready yet. Message SnareByt and they will be sent straight away.',
};
