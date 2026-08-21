import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { getPage } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { seedFrom } from '@/lib/cover-art';
import { parseYouTubeId } from '@/lib/spotify';
import { resolveOrder } from '@/lib/portfolio-order';
import { getVideoStats } from '@/lib/youtube';
import { PageHead } from '@/components/site/PageHead';
import {
  PortfolioGrid,
  CATEGORY_LABEL,
  type PortfolioView,
} from '@/components/site/PortfolioGrid';

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('portfolio');
}

export default async function PortfolioPage() {
  const [page, rows, orderRow] = await Promise.all([
    getPage('portfolio'),
    prisma.portfolioItem.findMany({
      where: { published: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.setting.findUnique({ where: { key: 'portfolioOrder' } }),
  ]);
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const cta = sec('cta');

  // One request for every video on the page. Nothing is invented: an id the
  // API does not answer for simply has no number on its card.
  const ytIds = rows
    .map((r) => parseYouTubeId(r.videoUrl) ?? parseYouTubeId(r.externalUrl))
    .filter((id): id is string => Boolean(id));
  const stats = await getVideoStats(ytIds);

  const items: PortfolioView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    categoryLabel: CATEGORY_LABEL[r.category] ?? r.category,
    role: r.role,
    clientName: r.clientName,
    summary: r.summary,
    externalUrl: r.externalUrl,
    ctaLabel: r.ctaLabel,
    majorCredit: r.majorCredit,
    // thumbKey is an R2 object key in the public bucket. Until files are
    // uploaded there is no key, and the card falls back to generated art
    // rather than a broken image.
    coverUrl: r.thumbKey ? `${process.env.R2_PUBLIC_BASE_URL}/${r.thumbKey}` : null,
    // A YouTube credit brings its own artwork. videoUrl wins over externalUrl
    // because a credit can legitimately link somewhere else — a Wikipedia
    // page, a press piece — while still having a video behind it.
    youtubeId: parseYouTubeId(r.videoUrl) ?? parseYouTubeId(r.externalUrl),
    views: (() => {
      const id = parseYouTubeId(r.videoUrl) ?? parseYouTubeId(r.externalUrl);
      return id ? stats.get(id)?.views ?? null : null;
    })(),
    seed: seedFrom(r.slug),
  }));

  return (
    <>
      <PageHead
        eyebrow={str(head, 'eyebrow')}
        h1={str(head, 'h1')}
        h2={str(head, 'h2')}
        lead={str(head, 'lead')}
      />

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <PortfolioGrid items={items} order={resolveOrder(orderRow?.value)} />

          {str(cta, 'h1') ? (
            <div className="cta rv" style={{ marginTop: '2.6rem' }}>
              <div className="cta-in">
                <h2 className="display">
                  {str(cta, 'h1')} <span className="serif redtext">{str(cta, 'h2')}</span>
                </h2>
                <p className="lead" style={{ textAlign: 'center' }}>{str(cta, 'body')}</p>
                <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {str(cta, 'b1') && str(cta, 'b1h') ? (
                    <Link href={str(cta, 'b1h')} className="btn btn-red">{str(cta, 'b1')}</Link>
                  ) : null}
                  {str(cta, 'b2') && str(cta, 'b2h') ? (
                    <Link href={str(cta, 'b2h')} className="btn btn-ghost">{str(cta, 'b2')}</Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
