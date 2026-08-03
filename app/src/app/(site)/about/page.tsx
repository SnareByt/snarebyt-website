import type { Metadata } from 'next';
import Link from 'next/link';
import { getPage, getMedia, getNav } from '@/lib/content';
import { PageHead } from '@/components/site/PageHead';

/**
 * ABOUT — every word on this page is a database row.
 *
 * The bio deliberately states roles exactly as agreed: Awaaz Utha is a
 * production credit, Kotha Ko is mix and master. That distinction lives in the
 * seeded copy, not in this file, so it stays correct however it is edited.
 */

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;
const list = <T,>(v: Values, k: string): T[] => (Array.isArray(v[k]) ? (v[k] as T[]) : []);

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('about');
  return { title: page?.seoTitle ?? 'About — SnareByt', description: page?.seoDescription ?? undefined };
}

export default async function AboutPage() {
  const page = await getPage('about');
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const story = sec('story');
  const name = sec('name');
  const stats = sec('stats');
  const cards = sec('cards');

  const paras = list<{ p?: string }>(story, 'paras').filter((x) => x.p);
  const statItems = list<{ n?: string; l?: string }>(stats, 'items').filter((x) => x.n);
  const cardItems = list<{ t?: string; b?: string }>(cards, 'items').filter((x) => x.t);
  const portrait = await getMedia(str(story, 'portrait') || null);

  const socials = await getNav('SOCIAL');
  const instagram = socials.find((s) => s.label === 'Instagram');

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
          <div className="split">
            <div className="rv-l" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {paras.map((x, i) => (
                <p
                  className="lead"
                  key={x.p}
                  // The opening paragraph is the lede and is set slightly larger,
                  // matching the prototype.
                  style={i === 0 ? { fontSize: '1.15rem', color: '#DFDFE4' } : undefined}
                >
                  {x.p}
                </p>
              ))}

              {str(name, 'p1') ? (
                <div className="namebox rv">
                  <div className="eyebrow">{str(name, 'eyebrow', 'The name')}</div>
                  <p className="lead" style={{ marginTop: '1rem' }}>{str(name, 'p1')}</p>
                  <p className="lead" style={{ marginTop: '.9rem' }}>{str(name, 'p2')}</p>
                  <p className="lead" style={{ marginTop: '.9rem' }}>{str(name, 'p3')}</p>
                </div>
              ) : null}
            </div>

            <div className="rv">
              <div className={portrait ? 'pt-frame' : 'pt-frame noimg'} style={{ aspectRatio: '4/5' }}>
                {portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portrait.url} alt={portrait.alt || 'SnareByt — Samir Islam'} loading="lazy" />
                ) : null}
                <div className="pt-fall" />
                <div className="pt-grade" />
                <div className="pt-cap">
                  <span className="eyebrow" style={{ color: '#fff' }}>Samir Islam</span>
                  <span>Producer · Audio engineer<br />Dhaka, Bangladesh</span>
                </div>
              </div>

              {statItems.length ? (
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
                  {statItems.map((s) => (
                    <div className="card" key={s.n} style={{ padding: '1.1rem' }}>
                      <div className="stat">
                        <div className="n" style={{ fontSize: '1.05rem' }}>{s.n}</div>
                        <div className="l">{s.l}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {cardItems.length ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
                {cardItems.map((c) => (
                  <div className="card rv" key={c.t} style={{ padding: '1.5rem' }}>
                    <div className="eyebrow">{c.t}</div>
                    <p className="lead" style={{ fontSize: '.92rem', marginTop: '.9rem' }}>{c.b}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="cta rv" style={{ marginTop: '2.6rem' }}>
            <div className="cta-in">
              <h2 className="display">Work with SnareByt</h2>
              <p className="lead" style={{ textAlign: 'center' }}>
                Press images, full bio and technical rider available on request.
              </p>
              <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/contact" className="btn btn-red">Booking &amp; enquiries →</Link>
                {instagram ? (
                  <a href={instagram.href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                    @snare_byt ↗
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
