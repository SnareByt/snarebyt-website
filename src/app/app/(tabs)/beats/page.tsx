import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { IcNext, IcPlus } from '@/components/app/Icons';
import { publishBlockers, missingFor } from '@/lib/beat-files';
import { beatChip, humanStatus } from '@/lib/app-format';
import { Filter } from '@/components/app/Filter';
import { NewBeatButton } from './NewBeatButton';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'PUBLISHED', label: 'On sale' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'problem', label: 'Needs files' },
  { key: 'ARCHIVED', label: 'Archived' },
] as const;

export default async function BeatsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter = 'all' } = await searchParams;

  const [beats, tiers] = await Promise.all([
    prisma.beat.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { assets: { select: { kind: true } } },
    }),
    prisma.licenceTier.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const base = process.env.R2_PUBLIC_BASE_URL ?? '';

  const rows = beats.map((b) => {
    const have = b.assets.map((a) => a.kind);
    return {
      ...b,
      blockers: publishBlockers({ previewKey: b.previewKey, have }),
      sellable: tiers.filter((t) => missingFor(t.includedAssets, have).length === 0).length,
      coverUrl: b.coverKey && base ? `${base}/${b.coverKey}` : null,
    };
  });

  const shown = rows.filter((b) => {
    if (filter === 'all') return b.status !== 'ARCHIVED';
    // "Needs files" is the filter that matters: a PUBLISHED beat with blockers
    // is actively taking money for nothing, and a DRAFT with blockers is the
    // reason it cannot go live. Both belong in one place.
    if (filter === 'problem') return b.blockers.length > 0 && b.status !== 'ARCHIVED';
    return b.status === filter;
  });

  const broken = rows.filter((b) => b.status === 'PUBLISHED' && b.blockers.length > 0).length;

  return (
    <>
      <NavBar title="Beats" right={<NewBeatButton />} />

      <div className="big-title">
        <h2>Beats</h2>
        <p>
          {rows.filter((b) => b.status === 'PUBLISHED').length} on sale ·{' '}
          {rows.filter((b) => b.status === 'DRAFT').length} draft
        </p>
      </div>

      <Filter options={FILTERS} active={filter} basePath="/app/beats" />

      <div className="wrap stack" style={{ marginTop: '.9rem' }}>
        {broken > 0 && filter !== 'problem' && (
          <Link href="/app/beats?filter=problem" className="note red" style={{ display: 'block' }}>
            <b>{broken} beat{broken > 1 ? 's are' : ' is'} on sale with files missing.</b>
            <br />
            A buyer would pay and receive nothing.
          </Link>
        )}

        {shown.length ? (
          <div className="list">
            {shown.map((b) => (
              <Link key={b.id} href={`/app/beats/${b.id}`} className="row">
                <Cover url={b.coverUrl} title={b.title} />
                <div className="row-main">
                  <div className="row-t">{b.title}</div>
                  <div className="row-s">
                    {b.bpm} BPM · {b.musicalKey} · {b.genre}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="row-v">{bdt(b.basePriceBdt)}</div>
                  <div style={{ marginTop: '.2rem' }}>
                    {b.blockers.length > 0 ? (
                      <span className="chip red">needs files</span>
                    ) : (
                      <span className={`chip ${beatChip(b.status)}`}>{humanStatus(b.status)}</span>
                    )}
                  </div>
                </div>
                <span className="row-x"><IcNext /></span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="list">
            <div className="empty">
              {filter === 'problem'
                ? 'Every beat has the files it needs. Nothing to fix.'
                : 'Nothing here yet.'}
            </div>
          </div>
        )}

        <p className="hint" style={{ padding: '0 .3rem' }}>
          A beat cannot go on sale without a tagged preview and an untagged MP3.
          Tap one to edit its price, files and licence tiers.
        </p>
      </div>
    </>
  );
}

/**
 * Cover art, or an honest absence.
 *
 * "Cover art pending" rather than a placeholder image, which is the rule
 * stated in the project brief and applies here as much as on the public site:
 * a stand-in graphic is a claim that artwork exists.
 */
function Cover({ url, title }: { url: string | null; title: string }) {
  if (!url) return <span className="thumb">pending</span>;
  // eslint-disable-next-line @next/next/no-img-element -- R2 cover art at 46px;
  // next/image would add an optimisation round trip for a thumbnail already
  // served from the CDN at the right size.
  return <img className="thumb" src={url} alt={`${title} cover art`} loading="lazy" />;
}
