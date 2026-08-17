import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getPage, getNav } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { coverCss, seedFrom } from '@/lib/cover-art';
import { PageHead } from '@/components/site/PageHead';
import { SpotifyEmbed } from '@/components/site/SpotifyEmbed';
import { isFullPlayer, type SpotifyRef } from '@/lib/spotify';

/**
 * MUSIC — the catalogue.
 *
 * Only releases with `live` switched on appear. That flag defaults to off, so
 * a record that was taken down, or was never officially released, cannot keep
 * advertising itself here.
 */

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;
const list = <T,>(v: Values, k: string): T[] => (Array.isArray(v[k]) ? (v[k] as T[]) : []);

const PROJECT_TYPES = ['ALBUM', 'EP', 'BEAT_TAPE'];
const TYPE_LABEL: Record<string, string> = {
  ALBUM: 'Album', EP: 'EP', BEAT_TAPE: 'Beat tape',
  SINGLE: 'Single', COLLABORATION: 'Collaboration',
};

const DSPS = ['Spotify', 'Apple Music', 'SoundCloud', 'TIDAL', 'Deezer'];

/** An unverified year is a dash, never a guess. */
const year = (d: Date | null) => (d ? String(d.getUTCFullYear()) : '—');

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('music');
}

export default async function MusicPage() {
  const [page, releases, socials] = await Promise.all([
    getPage('music'),
    prisma.release.findMany({ where: { live: true }, orderBy: { sortOrder: 'asc' } }),
    getNav('SOCIAL'),
  ]);
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const projectsSec = sec('projects');
  const singlesSec = sec('singles');
  const spotifySec = sec('spotify');
  const collabsSec = sec('collabs');

  const byLabel = new Map(socials.map((s) => [s.label, s.href]));
  const dsps = DSPS.filter((d) => byLabel.has(d));

  const projects = releases.filter((r) => PROJECT_TYPES.includes(r.type));
  const singles = releases.filter((r) => !PROJECT_TYPES.includes(r.type));
  const withSpotify = releases.filter((r) => r.spotifyEmbedId && r.spotifyEmbedType);
  // Split by player height. A grid holding both 352px and 152px players leaves
  // a hole under every short one, which is exactly the ragged look this
  // section had. Each group is uniform, so each grid aligns.
  const fullPlayers = withSpotify.filter((r) => isFullPlayer(r.trackCount));
  const compactPlayers = withSpotify.filter((r) => !isFullPlayer(r.trackCount));
  const awaitingSpotify = releases.filter((r) => !r.spotifyEmbedId);
  const collabNames = list<{ t?: string }>(collabsSec, 'names').filter((n) => n.t);

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
          {dsps.length ? (
            <div className="dsp-row" style={{ marginBottom: '2.6rem' }}>
              {dsps.map((d) => (
                <a key={d} className="btn btn-ghost btn-sm" href={byLabel.get(d)} target="_blank" rel="noopener noreferrer">
                  {d} ↗
                </a>
              ))}
            </div>
          ) : null}

          {/* ---------------- Albums, EPs and tapes ---------------- */}
          {projects.length ? (
            <>
              <div className="sec-head rv-l">
                <div className="eyebrow">{str(projectsSec, 'eyebrow')}</div>
                <h2 className="display" style={{ marginTop: '1rem' }}>{str(projectsSec, 'h1')}</h2>
                <p className="lead">{str(projectsSec, 'lead')}</p>
              </div>
              <div className="rel-grid">
                {projects.map((r) => (
                  <article className="card rel rv" key={r.id}>
                    {r.spotifyEmbedId && r.spotifyEmbedType ? (
                      <SpotifyEmbed
                        type={r.spotifyEmbedType as SpotifyRef['type']}
                        id={r.spotifyEmbedId}
                        title={r.title}
                        trackCount={r.trackCount}
                      />
                    ) : (
                      <div className="rel-art" style={{ background: coverCss(seedFrom(r.slug)) }}>
                        <div className="noise" />
                        {/* No invented artwork. The badge states the truth. */}
                        <span className="badge" style={{ zIndex: 4 }}>Cover art pending</span>
                      </div>
                    )}
                    <div>
                      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-.02em' }}>
                        {r.title}
                      </div>
                      <div
                        style={{
                          fontSize: '.64rem', letterSpacing: '.18em', textTransform: 'uppercase',
                          color: 'var(--dim)', fontFamily: 'var(--font-archivo), sans-serif', fontWeight: 600, marginTop: '.3rem',
                        }}
                      >
                        {TYPE_LABEL[r.type] ?? r.type} · {year(r.releasedAt)}
                        {r.trackCount ? ` · ${r.trackCount} tracks` : ''}
                      </div>
                    </div>
                    {r.about ? (
                      <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>{r.about}</p>
                    ) : null}
                    {r.spotifyUrl ? (
                      <div className="dsp-row">
                        <a className="btn btn-red btn-sm" href={r.spotifyUrl} target="_blank" rel="noopener noreferrer">
                          Open on Spotify ↗
                        </a>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {/* ---------------- Singles and collaborations ---------------- */}
          {singles.length ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="sec-head">
                <div className="row">
                  <div className="rv-l">
                    <div className="eyebrow">{str(singlesSec, 'eyebrow')}</div>
                    <h2 className="display" style={{ marginTop: '1rem' }}>
                      {singles.length} live {singles.length === 1 ? 'release' : 'releases'}
                    </h2>
                  </div>
                  {byLabel.has('Spotify') && str(singlesSec, 'link') ? (
                    <a className="link-arrow rv" href={byLabel.get('Spotify')} target="_blank" rel="noopener noreferrer">
                      {str(singlesSec, 'link')}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="track-list">
                {singles.map((r, i) => {
                  // The row links to Spotify where a verified URL exists. It is
                  // deliberately not a play button — the in-page player does not
                  // exist yet, and a control that does nothing is worse than none.
                  const row = (
                    <>
                      <span className="no">{String(i + 1).padStart(2, '0')}</span>
                      <span className="nm2">
                        {r.title}
                        {r.about ? (
                          <em style={{ fontStyle: 'normal', color: 'var(--dim)', fontSize: '.78rem' }}>
                            {' · '}{r.about}
                          </em>
                        ) : null}
                      </span>
                      <span className="dur">{year(r.releasedAt)}</span>
                    </>
                  );
                  return r.spotifyUrl ? (
                    <a className="trk" key={r.id} href={r.spotifyUrl} target="_blank" rel="noopener noreferrer">
                      {row}
                      <span className="dur redtext" style={{ width: 20, textAlign: 'right' }}>↗</span>
                    </a>
                  ) : (
                    <div className="trk" key={r.id}>
                      {row}
                      <span className="dur" style={{ width: 20 }} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* ---------------- Live Spotify players ---------------- */}
          {withSpotify.length ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="sec-head rv-l">
                <div className="eyebrow">{str(spotifySec, 'eyebrow')}</div>
                <h2 className="display" style={{ marginTop: '1rem' }}>{str(spotifySec, 'h1')}</h2>
                <p className="lead">{str(spotifySec, 'lead')}</p>
              </div>
              {fullPlayers.length ? (
                <div className="sp-grid">
                  {fullPlayers.map((r) => (
                    <div className="rv" key={r.id}>
                      <SpotifyEmbed
                        type={r.spotifyEmbedType as SpotifyRef['type']}
                        id={r.spotifyEmbedId as string}
                        title={r.title}
                        trackCount={r.trackCount}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {compactPlayers.length ? (
                <div className="sp-grid compact" style={{ marginTop: fullPlayers.length ? '1rem' : 0 }}>
                  {compactPlayers.map((r) => (
                    <div className="rv" key={r.id}>
                      <SpotifyEmbed
                        type={r.spotifyEmbedType as SpotifyRef['type']}
                        id={r.spotifyEmbedId as string}
                        title={r.title}
                        trackCount={r.trackCount}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {awaitingSpotify.length ? (
            <div className="sp-note" style={{ marginTop: '1.2rem' }}>
              <span>✎</span>
              <span>
                <strong style={{ color: 'var(--text)' }}>Awaiting Spotify links: </strong>
                {awaitingSpotify.map((r) => r.title).join(' · ')}. Paste each Spotify URL in the
                dashboard and a live player with its real cover art appears here automatically —
                no image files to upload.
              </span>
            </div>
          ) : null}

          {/* ---------------- Collaborators ---------------- */}
          {collabNames.length ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="sec-head rv-l">
                <div className="eyebrow">{str(collabsSec, 'eyebrow')}</div>
                <h2 className="display" style={{ marginTop: '1rem' }}>{str(collabsSec, 'h1')}</h2>
              </div>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                {collabNames.map((n) => (
                  <span className="tag" key={n.t} style={{ fontSize: '.7rem', padding: '.5rem 1rem' }}>
                    {n.t}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
