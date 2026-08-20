import Link from 'next/link';
import { YouTubeHero } from '@/components/site/YouTubeHero';
import { parseYouTubeId } from '@/lib/spotify';
import { getMedia } from '@/lib/content';

/**
 * Home page sections.
 *
 * Each component takes the `values` JSON of one PageSection row. Markup and
 * class names are lifted from reference/SnareByt.html — the approved
 * prototype — so the rendered page is the signed-off design with real data
 * behind it.
 *
 * Values are typed loosely on purpose: they come from a JSON column, and the
 * field spec in content-spec.ts is what constrains them at write time.
 */
export type Values = Record<string, unknown>;

const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;

const list = <T,>(v: Values, k: string): T[] => (Array.isArray(v[k]) ? (v[k] as T[]) : []);

/* ---------------------------------------------------------------- Hero */

export async function Hero({ v }: { v: Values }) {
  const tags = list<{ t?: string }>(v, 'tags').filter((x) => x.t);
  const proof = list<{ n?: string; l?: string }>(v, 'proof').filter((x) => x.n);
  // A media field stores a MediaAsset id. Empty means "not uploaded yet" —
  // the frame renders its fallback rather than a broken image.
  const portrait = await getMedia(str(v, 'portrait') || null);

  return (
    <section id="hero">
      <div className="hero-bg" />
      <div className="hero-grid" />
      <div
        className="orb"
        style={{ width: 520, height: 520, background: 'rgba(224,27,54,.16)', top: '-8%', right: '-6%' }}
      />
      <div className="wrap hero-in">
        <div className="hero-copy">
          {tags.length ? (
            <div className="hero-tags">
              {tags.map((t, i) => (
                <span key={t.t} className={i === 0 ? 'tag live' : 'tag'}>{t.t}</span>
              ))}
            </div>
          ) : null}

          <h1 className="display hero-h1">
            <span className="mask-line"><span>{str(v, 'line1')}</span></span>
            <span className="mask-line"><span className="chrome-text">{str(v, 'line2')}</span></span>
            <span className="mask-line">
              <span className="serif" style={{ textTransform: 'none', fontWeight: 400 }}>
                {str(v, 'line3')}
              </span>
            </span>
          </h1>

          <div className="role-stack rv">
            <div className="role r1">{str(v, 'r1')}</div>
            <div className="role r2">{str(v, 'r2')}</div>
            <div className="role r3">{str(v, 'r3')}</div>
          </div>

          <p className="lead rv">{str(v, 'lead')}</p>

          <div className="hero-cta rv">
            {([['cta1', 'cta1h', 'btn btn-red'], ['cta2', 'cta2h', 'btn btn-ghost'], ['cta3', 'cta3h', 'btn btn-ghost']] as const)
              .map(([labelKey, hrefKey, cls]) => {
                const label = str(v, labelKey);
                const href = str(v, hrefKey);
                if (!label || !href) return null;
                return <Link key={labelKey} href={href} className={cls}>{label}</Link>;
              })}
          </div>

          {proof.length ? (
            <div className="proof rv">
              {proof.map((x) => (
                <div className="proof-i" key={x.n}>
                  <div className="pn">{x.n}</div>
                  <div className="pl">{x.l}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="portrait rv">
          <div className="ring-glow" style={{ inset: '-4%', borderRadius: 22 }} />
          <div className={portrait ? 'pt-frame' : 'pt-frame noimg'}>
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait.url} alt={portrait.alt || 'SnareByt — Samir Islam'} />
            ) : null}
            <div className="pt-fall" />
            <div className="pt-grade" />
            <div className="pt-cap">
              <span className="eyebrow" style={{ color: '#fff' }}>Samir Islam</span>
              <span>Producer · Audio engineer<br />Dhaka, Bangladesh</span>
            </div>
          </div>
        </div>
      </div>
      <div className="scroll-hint"><span>Scroll</span><i /></div>
    </section>
  );
}

/* ------------------------------------------------------------ Services marquee */

export function Marquee({ items }: { items: string[] }) {
  if (!items.length) return null;
  // Doubled so the loop has no visible seam.
  const doubled = [...items, ...items];
  return (
    <div className="marq">
      <div className="marq-in">
        {doubled.map((t, i) => <span key={`${t}-${i}`}>{t}</span>)}
      </div>
    </div>
  );
}

/* ----------------------------------------------------- Release-driven blocks */

export type ReleaseLite = {
  id: string;
  title: string;
  type: string;
  year: string;
  about: string | null;
  spotifyUrl: string | null;
  spotifyEmbedType: string | null;
  spotifyEmbedId: string | null;
  youtubeUrl?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  ALBUM: 'Album', EP: 'EP', BEAT_TAPE: 'Beat tape',
  SINGLE: 'Single', COLLABORATION: 'Collaboration',
};

/** Newest live release. Falls back to a cover-pending card, never fake art. */
export function Latest({ v, release }: { v: Values; release: ReleaseLite | null }) {
  if (!release) return null;
  // The video is the better hero when there is one — it carries the artwork,
  // the sound and the brand in a single frame. Spotify remains the fallback.
  const ytId = parseYouTubeId(release.youtubeUrl);
  return (
    <section className="blk">
      <div className="wrap">
        <div className="sec-head rv-l"><div className="eyebrow">{str(v, 'eyebrow')}</div></div>
        <div className={ytId ? 'card latest latest-video rv' : 'card latest rv'}>
          <div className="latest-art">
            {ytId ? (
              <YouTubeHero id={ytId} title={`${release.title} — official video`} />
            ) : release.spotifyEmbedId && release.spotifyEmbedType ? (
              <iframe
                title={`${release.title} on Spotify`}
                src={`https://open.spotify.com/embed/${release.spotifyEmbedType}/${release.spotifyEmbedId}?utm_source=oembed`}
                width="100%"
                height={release.spotifyEmbedType === 'track' ? 152 : 352}
                style={{ borderRadius: 14, border: 0, display: 'block' }}
                allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            ) : (
              <div className="rel-art"><span className="badge">Cover art pending</span></div>
            )}
          </div>
          <div className="latest-body">
            <h2 className="display">{release.title}</h2>
            <div style={{ fontSize: '.68rem', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 600 }}>
              SnareByt · {TYPE_LABEL[release.type] ?? release.type} · {release.year}
            </div>
            <p className="lead" style={{ fontSize: '.92rem' }}>{str(v, 'body')}</p>
            {release.spotifyUrl || ytId ? (
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                {release.spotifyUrl ? (
                  <a className="btn btn-red btn-sm" href={release.spotifyUrl} target="_blank" rel="noopener noreferrer">
                    Open on Spotify ↗
                  </a>
                ) : null}
                {ytId ? (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`https://www.youtube.com/watch?v=${ytId}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    Watch on YouTube ↗
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Live singles as a numbered list. Rows link out where a verified URL exists. */
export function Recent({ v, releases }: { v: Values; releases: ReleaseLite[] }) {
  if (!releases.length) return null;
  return (
    <section className="blk" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head">
          <div className="row">
            <div className="rv-l">
              <div className="eyebrow">{str(v, 'eyebrow')}</div>
              <h2 className="display" style={{ marginTop: '1rem' }}>{str(v, 'h1')}</h2>
            </div>
            {str(v, 'link') ? <Link href="/music" className="link-arrow rv">{str(v, 'link')}</Link> : null}
          </div>
        </div>
        <div className="track-list">
          {releases.map((r, i) => {
            const row = (
              <>
                <span className="no">{String(i + 1).padStart(2, '0')}</span>
                <span className="nm2">
                  {r.title}
                  {r.about ? (
                    <em style={{ fontStyle: 'normal', color: 'var(--dim)', fontSize: '.78rem' }}> · {r.about}</em>
                  ) : null}
                </span>
                <span className="dur">{r.year}</span>
              </>
            );
            return r.spotifyUrl ? (
              <a className="trk" key={r.id} href={r.spotifyUrl} target="_blank" rel="noopener noreferrer">
                {row}<span className="dur redtext" style={{ width: 20, textAlign: 'right' }}>↗</span>
              </a>
            ) : (
              <div className="trk" key={r.id}>{row}<span className="dur" style={{ width: 20 }} /></div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Releases pinned as Featured, as live Spotify players. */
export function Featured({ v, releases }: { v: Values; releases: ReleaseLite[] }) {
  const playable = releases.filter((r) => r.spotifyEmbedId && r.spotifyEmbedType);
  if (!playable.length) return null;
  return (
    <section className="blk" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head rv-l">
          <div className="eyebrow">{str(v, 'eyebrow')}</div>
          <h2 className="display" style={{ marginTop: '1rem' }}>{str(v, 'h1')}</h2>
        </div>
        <div className="sp-grid">
          {playable.map((r) => (
            <div className="rv" key={r.id}>
              <iframe
                title={`${r.title} on Spotify`}
                src={`https://open.spotify.com/embed/${r.spotifyEmbedType}/${r.spotifyEmbedId}?utm_source=oembed`}
                width="100%"
                height={r.spotifyEmbedType === 'track' ? 152 : 352}
                style={{ borderRadius: 14, border: 0, display: 'block' }}
                allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Intro */

export function Intro({ v }: { v: Values }) {
  const cards = list<{ t?: string; b?: string }>(v, 'cards').filter((c) => c.t);
  return (
    <section className="blk" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="split">
          <div className="rv-l">
            <div className="eyebrow">{str(v, 'eyebrow')}</div>
            <h2 className="display" style={{ margin: '1rem 0' }}>
              {str(v, 'h1')}<br />
              <span className="serif redtext">{str(v, 'h2')}</span>
            </h2>
            <p className="lead">{str(v, 'p1')}</p>
            <p className="lead" style={{ marginTop: '1rem' }}>{str(v, 'p2')}</p>
            {str(v, 'link') ? (
              <Link href="/about" className="link-arrow" style={{ marginTop: '1.4rem' }}>
                {str(v, 'link')}
              </Link>
            ) : null}
          </div>
          <div className="grid rv" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {cards.map((c) => (
              <div className="card" key={c.t} style={{ padding: '1.3rem' }}>
                <div className="eyebrow">{c.t}</div>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: '.7rem', lineHeight: 1.6 }}>
                  {c.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Testimonials */

export function Testimonials({ v }: { v: Values }) {
  const quotes = list<{ q?: string; n?: string; r?: string }>(v, 'quotes').filter((q) => q.q && q.n);

  return (
    <section className="blk" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head rv-l">
          <div className="eyebrow">{str(v, 'eyebrow')}</div>
          <h2 className="display" style={{ marginTop: '1rem' }}>{str(v, 'h1')}</h2>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          {quotes.length
            ? quotes.map((q) => (
                <div className="card quote" key={`${q.n}-${q.q?.slice(0, 12)}`} style={{ padding: '1.6rem' }}>
                  <p className="lead" style={{ fontSize: '.92rem' }}>{q.q}</p>
                  <div className="eyebrow" style={{ marginTop: '1.1rem' }}>{q.n}</div>
                  {q.r ? <div style={{ fontSize: '.78rem', color: 'var(--dim)' }}>{q.r}</div> : null}
                </div>
              ))
            /* Empty slots, deliberately. Inventing a client quote on a real
               person's site is a reputational risk, not a design flourish.
               These fill in the moment real quotes with permission arrive. */
            : [0, 1, 2].map((i) => (
                <div className="card is-slot" key={i} style={{ padding: '1.6rem', borderStyle: 'dashed' }}>
                  <p style={{ fontSize: '.85rem', color: 'var(--dim)' }}>
                    Awaiting a real client quote with permission to publish.
                  </p>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Big CTA */

export function BookingCta({ v }: { v: Values }) {
  return (
    <section className="blk">
      <div className="wrap">
        <div className="cta rv">
          <div className="cta-in">
            <div className="eyebrow">{str(v, 'eyebrow')}</div>
            <h2 className="display" style={{ margin: '1rem 0' }}>
              {str(v, 'h1')}<br />
              <span className="serif">{str(v, 'h2')}</span>
            </h2>
            <p className="lead">{str(v, 'body')}</p>
            <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
              {str(v, 'b1') && str(v, 'b1h') ? (
                <Link href={str(v, 'b1h')} className="btn btn-red">{str(v, 'b1')}</Link>
              ) : null}
              {str(v, 'b2') && str(v, 'b2h') ? (
                <Link href={str(v, 'b2h')} className="btn btn-ghost">{str(v, 'b2')}</Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Newsletter */

export function Newsletter({ v }: { v: Values }) {
  return (
    <section className="blk" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="news rv">
          <div className="eyebrow">{str(v, 'eyebrow')}</div>
          {/* Not wired to Subscriber yet — the double opt-in flow is built with
              the email phase. Disabled rather than pretending to accept. */}
          <form className="form" style={{ marginTop: '1rem' }}>
            <input className="in" type="email" placeholder={str(v, 'ph', 'your@email.com')} disabled />
            <button className="btn btn-red" type="button" disabled>{str(v, 'btn', 'Subscribe')}</button>
          </form>
          <p className="note" style={{ marginTop: '.7rem' }}>{str(v, 'note')}</p>
        </div>
      </div>
    </section>
  );
}
