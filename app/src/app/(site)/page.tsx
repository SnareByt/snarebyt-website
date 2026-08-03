import type { Metadata } from 'next';
import { getPage } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { Hero, Marquee, Intro, Testimonials, BookingCta, Newsletter, type Values } from './sections';

/**
 * HOME — section driven.
 *
 * The page does not hard-code its own structure: it loads the visible
 * PageSection rows for `home` in their saved order and maps each `key` to a
 * component. Hiding or reordering a section in the dashboard changes this page
 * with no deploy, which is the whole point of the content model.
 */

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('home');
  return {
    title: page?.seoTitle ?? 'SnareByt',
    description: page?.seoDescription ?? undefined,
  };
}

/** Section keys this page can render today. Anything else is skipped. */
const RENDERABLE = new Set(['hero', 'intro', 'testimonials', 'cta', 'news']);

export default async function HomePage() {
  const page = await getPage('home');
  if (!page) return <NotSeeded />;

  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    select: { title: true },
  });

  const sections = page.sections.filter((s) => RENDERABLE.has(s.key));

  return (
    <>
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
          case 'intro':
            return <Intro key={s.id} v={v} />;
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
