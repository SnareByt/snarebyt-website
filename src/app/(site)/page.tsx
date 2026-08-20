import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { seedFrom } from '@/lib/cover-art';
import { HomeBeatStrip } from '@/components/site/HomeBeatStrip';
import { ArtistSchema } from '@/components/site/ArtistSchema';
import type { BeatView } from '@/components/site/BeatStore';
import {
  Hero, Marquee, Intro, Testimonials, BookingCta, Newsletter,
  Latest, Recent, Featured, type Values, type ReleaseLite,
} from './sections';
import { YouTubeStats } from '@/components/site/YouTubeStats';
import { beatStoreClosed } from '@/lib/store-state';

/**
 * HOME — section driven.
 *
 * The page does not hard-code its own structure: it loads the visible
 * PageSection rows for `home` in their saved order and maps each `key` to a
 * component. Hiding or reordering a section in the dashboard changes this page
 * with no deploy, which is the whole point of the content model.
 */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('home');
}

/** Section keys this page can render today. Anything else is skipped. */
const RENDERABLE = new Set([
  'hero', 'latest', 'intro', 'recent', 'featured', 'store', 'testimonials', 'cta', 'news',
]);

const PROJECT_TYPES = ['ALBUM', 'EP', 'BEAT_TAPE'];
const year = (d: Date | null) => (d ? String(d.getUTCFullYear()) : '—');

export default async function HomePage() {
  const page = await getPage('home');
  if (!page) return <NotSeeded />;

  const [services, releases, beats, tiers] = await Promise.all([
    prisma.service.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { title: true } }),
    // Only live releases, ever. The flag defaults to off so nothing appears
    // until Samir switches it on.
    prisma.release.findMany({ where: { live: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.beat.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ purchaseCount: 'desc' }, { publishedAt: 'desc' }],
      take: 4,
      include: { assets: { select: { kind: true } } },
    }),
    prisma.licenceTier.findMany({ where: { active: true }, orderBy: { multiplier: 'asc' }, take: 1 }),
  ]);

  const lite = (r: (typeof releases)[number]): ReleaseLite => ({
    id: r.id, title: r.title, type: r.type, year: year(r.releasedAt), about: r.about,
    spotifyUrl: r.spotifyUrl, spotifyEmbedType: r.spotifyEmbedType, spotifyEmbedId: r.spotifyEmbedId,
    youtubeUrl: r.youtubeUrl,
  });

  // Newest by release date; releases with an unknown date cannot claim to be
  // the latest, so they are excluded from that one slot only.
  const dated = releases.filter((r) => r.releasedAt);
  const latest = dated.length
    ? lite([...dated].sort((a, b) => b.releasedAt!.getTime() - a.releasedAt!.getTime())[0])
    : null;

  const singles = releases.filter((r) => !PROJECT_TYPES.includes(r.type)).slice(0, 6).map(lite);
  const featured = releases.filter((r) => r.featured).map(lite);

  const beatViews: BeatView[] = beats.map((b) => ({
    id: b.id, slug: b.slug, title: b.title, genre: b.genre, mood: b.mood, bpm: b.bpm,
    musicalKey: b.musicalKey, tags: b.tags, basePriceBdt: b.basePriceBdt,
    exclusiveAvailable: b.exclusiveAvailable, soldExclusive: false,
    coverUrl: b.coverKey ? `${process.env.R2_PUBLIC_BASE_URL}/${b.coverKey}` : null,
    seed: seedFrom(b.slug), purchaseCount: b.purchaseCount,
    availableAssets: b.assets.map((a) => a.kind),
    publishedAt: b.publishedAt ? b.publishedAt.toISOString() : null,
    previewUrl: b.previewKey ? `${process.env.R2_PUBLIC_BASE_URL}/${b.previewKey}` : null,
  }));

  const cheapest = tiers[0]?.multiplier ?? 1;

  // While the store is closed the home page must not advertise it either,
  // or the strip becomes a row of links into a "coming soon" page.
  const storeClosed = await beatStoreClosed();
  const sections = page.sections
    .filter((s) => RENDERABLE.has(s.key))
    .filter((s) => !(s.key === 'store' && storeClosed));

  return (
    <>
      <ArtistSchema />
      {sections.map((s, i) => {
        const v = (s.values ?? {}) as Values;
        switch (s.key) {
          case 'hero':
            return (
              <div key={s.id}>
                <Hero v={v} />
                <Marquee items={services.map((x) => x.title)} />
              </div>
            );
          case 'latest':
            return <Latest key={s.id} v={v} release={latest} />;
          case 'intro':
            return (
              <div key={s.id}>
                <Intro v={v} />
                <YouTubeStats />
              </div>
            );
          case 'recent':
            return <Recent key={s.id} v={v} releases={singles} />;
          case 'featured':
            return <Featured key={s.id} v={v} releases={featured} />;
          case 'store':
            // Renders nothing while every beat is a draft, which is the
            // honest state until preview files are uploaded.
            return beatViews.length ? (
              <section className="blk" style={{ paddingTop: 0 }} key={s.id}>
                <div className="wrap">
                  <div className="sec-head">
                    <div className="row">
                      <div className="rv-l">
                        <div className="eyebrow">{String(v.eyebrow ?? '')}</div>
                        <h2 className="display" style={{ marginTop: '1rem' }}>
                          {String(v.h1 ?? '')} <span className="serif redtext">{String(v.h2 ?? '')}</span>
                        </h2>
                      </div>
                      <a href="/beats" className="link-arrow rv">{String(v.link ?? '')}</a>
                    </div>
                  </div>
                  <HomeBeatStrip beats={beatViews} cheapestMultiplier={cheapest} />
                </div>
              </section>
            ) : null;
          case 'testimonials':
            return <Testimonials key={s.id} v={v} />;
          case 'cta':
            return <BookingCta key={s.id} v={v} />;
          case 'news':
            return <Newsletter key={s.id} v={v} />;
          default:
            // Unreachable while RENDERABLE gates the list, but a missing case
            // should fail quietly on a public page rather than throw.
            return <div key={s.id} data-unrendered={s.key} hidden data-index={i} />;
        }
      })}
    </>
  );
}

/** Shown only when the database has no content rows — i.e. the seed never ran. */
function NotSeeded() {
  return (
    <section className="blk">
      <div className="wrap">
        <div className="eyebrow">Setup</div>
        <h1 className="display" style={{ margin: '1rem 0' }}>No site content yet</h1>
        <p className="lead">
          The <code>home</code> page has no rows in the database. Run <code>npm run db:seed</code> to
          load the approved content.
        </p>
      </div>
    </section>
  );
}
