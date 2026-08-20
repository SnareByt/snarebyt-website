import type { AssetKind } from '@prisma/client';

/**
 * What a beat's files mean for what it can sell.
 *
 * Pure functions over plain data — no Prisma, no auth — because the same
 * question is asked in three places that must never disagree:
 *
 *   1. the admin, so Samir can see which tiers a beat is ready to sell;
 *   2. the public store, so a tier with no file behind it is never offered;
 *   3. `placeOrder`, which is a public HTTP endpoint and is the only one of
 *      the three that actually enforces anything.
 *
 * The rule it encodes: a licence tier lists `includedAssets`, and selling
 * that tier on a beat that has not got those files means someone pays ৳7,500
 * for stems and receives a single MP3. Nothing in the schema prevented that
 * before this module existed.
 */

export const ASSET_LABEL: Record<AssetKind, string> = {
  MP3_UNTAGGED: 'Untagged MP3',
  WAV: 'WAV 24-bit',
  STEMS_ZIP: 'Track stems',
  SESSION_NOTES: 'Session notes',
};

/** Display order for the upload slots, and for any list of missing files. */
export const ASSET_ORDER: AssetKind[] = ['MP3_UNTAGGED', 'WAV', 'STEMS_ZIP', 'SESSION_NOTES'];

/** Which of a tier's required files this beat has not got. Empty = sellable. */
export function missingFor(included: readonly AssetKind[], have: Iterable<AssetKind>): AssetKind[] {
  const has = new Set(have);
  return ASSET_ORDER.filter((k) => included.includes(k) && !has.has(k));
}

/** True when every file the tier promises actually exists on the beat. */
export function tierDeliverable(included: readonly AssetKind[], have: Iterable<AssetKind>): boolean {
  return missingFor(included, have).length === 0;
}

/** "WAV 24-bit and Track stems" — for a sentence, not a list. */
export function missingText(missing: readonly AssetKind[]): string {
  const names = missing.map((k) => ASSET_LABEL[k]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Publishable means a buyer of the CHEAPEST tier receives something, plus the
 * store has audio to stream. Richer tiers are allowed to be unready — they are
 * simply not offered until their files land.
 */
export function publishBlockers(opts: {
  previewKey: string | null;
  have: Iterable<AssetKind>;
}): string[] {
  const has = new Set(opts.have);
  const out: string[] = [];
  if (!opts.previewKey) out.push('a tagged preview');
  if (!has.has('MP3_UNTAGGED')) out.push('an untagged MP3');
  return out;
}

/** Human file size. Kept here so admin and buyer pages agree on the format. */
export function fileSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
