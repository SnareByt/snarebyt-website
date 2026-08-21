import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate, licencePrice } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { ASSET_ORDER, ASSET_LABEL, missingFor, publishBlockers, fileSize } from '@/lib/beat-files';
import { beatChip, humanStatus } from '@/lib/app-format';
import { BeatEditor } from './BeatEditor';

export const dynamic = 'force-dynamic';

/**
 * One beat, everything about it.
 *
 * The desktop admin splits this across a table row, a drawer and a files tab.
 * On a phone that is three levels of nesting for what is conceptually one
 * object, so it is a single scrolling screen instead: what it costs, whether
 * it is on sale, what files exist, and which licence tiers those files make
 * sellable — in that order, because that is the order the questions come up.
 */
export default async function BeatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [beat, tiers, rate] = await Promise.all([
    prisma.beat.findUnique({ where: { id }, include: { assets: true } }),
    prisma.licenceTier.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    getUsdRate(),
  ]);

  if (!beat) notFound();

  const base = process.env.R2_PUBLIC_BASE_URL ?? '';
  const pub = (key: string | null) => (key && base ? `${base}/${key}` : null);

  const have = beat.assets.map((a) => a.kind);
  const blockers = publishBlockers({ previewKey: beat.previewKey, have });

  /**
   * What each tier would sell for, and whether it can be sold at all.
   *
   * Computed on the server from `missingFor`, the same pure function the public
   * store and `placeOrder` use. Three surfaces asking the same question must
   * never disagree — that is the whole reason src/lib/beat-files.ts exists.
   *
   * The terms markdown is deliberately NOT sent to the browser: LicenceTier
   * carries both languages of a full contract and shipping several kilobytes
   * of it into a readiness list would be wasteful on a cellular connection.
   */
  const tierRows = tiers.map((t) => {
    const missing = missingFor(t.includedAssets, have);
    return {
      id: t.id,
      name: t.name,
      multiplier: t.multiplier,
      filesLabel: t.filesLabel,
      isExclusive: t.isExclusive,
      price: licencePrice(beat.basePriceBdt, t.multiplier),
      missing: missing.map((k) => ASSET_LABEL[k]),
      sellable: missing.length === 0,
    };
  });

  const slots = [
    { slot: 'cover' as const, label: 'Cover art', have: Boolean(beat.coverKey), bytes: 0, isPublic: true },
    { slot: 'preview' as const, label: 'Tagged preview', have: Boolean(beat.previewKey), bytes: 0, isPublic: true },
    ...ASSET_ORDER.map((k) => {
      const asset = beat.assets.find((a) => a.kind === k);
      return {
        slot: k,
        label: ASSET_LABEL[k],
        have: Boolean(asset),
        bytes: asset ? Number(asset.bytes) : 0,
        isPublic: false,
      };
    }),
  ];

  return (
    <>
      <NavBar title={beat.title} back="/app/beats" />

      <BeatEditor
        beat={{
          id: beat.id,
          title: beat.title,
          slug: beat.slug,
          genre: beat.genre,
          mood: beat.mood,
          bpm: beat.bpm,
          musicalKey: beat.musicalKey,
          tags: beat.tags,
          description: beat.description ?? '',
          basePriceBdt: beat.basePriceBdt,
          status: beat.status,
          exclusiveAvailable: beat.exclusiveAvailable,
          playCount: beat.playCount,
          purchaseCount: beat.purchaseCount,
          coverUrl: pub(beat.coverKey),
          previewUrl: pub(beat.previewKey),
        }}
        slots={slots}
        tiers={tierRows}
        blockers={blockers}
        usdRate={rate}
      />
    </>
  );
}
