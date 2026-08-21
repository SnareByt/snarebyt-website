'use client';

import { useEffect, useState } from 'react';
import { coverCss } from '@/lib/cover-art';

export type PortfolioView = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  /** Exactly what SnareByt did. Required by the schema — never inferred. */
  role: string;
  clientName: string | null;
  summary: string;
  externalUrl: string | null;
  ctaLabel: string | null;
  majorCredit: boolean;
  coverUrl: string | null;
  /**
   * Derived at render from the item's own links, never stored.
   *
   * Copying the still into R2 would mean uploading artwork that already
   * exists, and a cached copy that goes stale the moment the video's
   * thumbnail changes. The id is enough to build both the poster and the
   * player, so the credit brings its own artwork for free.
   */
  youtubeId: string | null;
  seed: number;
};

export const CATEGORY_ORDER = [
  'PRODUCED_BY_SNAREBYT',
  'MIXED_AND_MASTERED_BY_SNAREBYT',
  'SNAREBYT_RELEASES',
  'SELECTED_VISUAL_WORK',
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  PRODUCED_BY_SNAREBYT: 'Produced by SnareByt',
  MIXED_AND_MASTERED_BY_SNAREBYT: 'Mixed & Mastered by SnareByt',
  SNAREBYT_RELEASES: 'SnareByt Releases',
  SELECTED_VISUAL_WORK: 'Selected Visual Work',
};

/** YouTube's own still. `maxres` does not exist for every video, hence `hq`. */
const ytThumb = (id: string, size: 'max' | 'hq' = 'max') =>
  `https://i.ytimg.com/vi/${id}/${size === 'max' ? 'maxresdefault' : 'hqdefault'}.jpg`;

/**
 * The player, opened over the grid.
 *
 * Nothing from YouTube is fetched until this mounts — the grid is posters and
 * markup only. A page of embedded iframes would pull a megabyte of script per
 * credit before anyone asked to watch anything.
 *
 * `youtube-nocookie` sets no tracking cookie unless the visitor actually
 * watches, and autoplay means the click that opens the player is the same
 * click that starts it.
 */
function VideoLightbox({ item, onClose }: { item: PortfolioView; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // A page that scrolls behind an open player feels broken on a phone.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="ytbox" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" className="ytbox-scrim" onClick={onClose} aria-label="Close" />
      <div className="ytbox-panel">
        <div className="ytbox-hd">
          <div>
            <div className="ytbox-role">{item.role}</div>
            <div className="ytbox-title">{item.title}</div>
          </div>
          <button type="button" className="ytbox-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ytbox-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            title={item.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {item.externalUrl ? (
          <a className="ytbox-out" href={item.externalUrl} target="_blank" rel="noopener noreferrer">
            {item.ctaLabel || 'Open'} on YouTube ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Card({ p, onPlay }: { p: PortfolioView; onPlay: (p: PortfolioView) => void }) {
  // A visual slot with neither a link nor a cover is an honest placeholder,
  // not a broken card.
  const isSlot = !p.externalUrl && !p.coverUrl && p.category === 'SELECTED_VISUAL_WORK';

  // An uploaded cover still wins — it was chosen deliberately. The YouTube
  // still is what fills the gap where there would otherwise be generated art.
  const art = p.coverUrl ?? (p.youtubeId ? ytThumb(p.youtubeId) : null);

  return (
    <article className={isSlot ? 'pf is-slot' : 'pf'}>
      <div className="bgl" style={art ? undefined : { background: coverCss(p.seed) }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="covimg"
            src={art}
            alt=""
            loading="lazy"
            decoding="async"
            // Not every video has a maxres still; fall back rather than
            // leaving a hole where the artwork should be.
            onError={(e) => {
              const img = e.currentTarget;
              if (p.youtubeId && !img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = ytThumb(p.youtubeId, 'hq');
              }
            }}
          />
        ) : null}
      </div>

      {/* The whole card becomes the play control when there is a video, so
          the thumbnail is the target rather than a small button on top of it. */}
      {p.youtubeId ? (
        <button
          type="button"
          className="pf-play"
          onClick={() => onPlay(p)}
          aria-label={`Play ${p.title}`}
        >
          <span className="pf-play-btn" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        </button>
      ) : null}
      <div className="noise" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} />

      {p.majorCredit ? (
        <span className="badge excl" style={{ top: '.7rem', left: '.7rem' }}>Major credit</span>
      ) : null}
      {isSlot ? (
        <span className="badge" style={{ top: '.7rem', left: '.7rem' }}>Awaiting files</span>
      ) : null}

      <div className="ov">
        {/* The role, always. A card cannot render without stating exactly what
            SnareByt did — this is what stops a mix credit ever reading as a
            production credit. */}
        <span className="cat">{p.role}</span>
        <span className="nm">{p.title}</span>
        {p.clientName ? (
          <span
            style={{
              fontSize: '.7rem',
              color: 'var(--muted)',
              fontFamily: 'var(--font-archivo), sans-serif',
              fontWeight: 600,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}
          >
            {p.clientName}
          </span>
        ) : null}
        <span className="dsc">{p.summary}</span>
        {p.externalUrl ? (
          <a className="pf-cta" href={p.externalUrl} target="_blank" rel="noopener noreferrer">
            {p.ctaLabel || 'Open'} ↗
          </a>
        ) : isSlot ? null : (
          <span className="pf-cta dimmed">Link to be added</span>
        )}
      </div>
    </article>
  );
}

export function PortfolioGrid({ items }: { items: PortfolioView[] }) {
  const [cat, setCat] = useState<string>('All');
  const [playing, setPlaying] = useState<PortfolioView | null>(null);

  const present = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  const groups = cat === 'All' ? present : present.filter((c) => c === cat);

  return (
    <>
      <div className="pill-row">
        <button type="button" className={cat === 'All' ? 'pill on' : 'pill'} onClick={() => setCat('All')}>
          All
        </button>
        {present.map((c) => (
          <button
            key={c}
            type="button"
            className={cat === c ? 'pill on' : 'pill'}
            onClick={() => setCat(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const group = items.filter((i) => i.category === g);
        if (!group.length) return null;
        return (
          <div key={g} style={{ marginBottom: '3rem' }}>
            <div className="sec-head" style={{ marginBottom: '1.5rem' }}>
              <div className="eyebrow">{CATEGORY_LABEL[g]}</div>
              <h2 className="display" style={{ marginTop: '.2rem' }}>
                {group.length} {group.length === 1 ? 'project' : 'projects'}
              </h2>
            </div>
            <div className="pf-grid">
              {group.map((p) => <Card key={p.id} p={p} onPlay={setPlaying} />)}
            </div>
          </div>
        );
      })}

      {playing ? <VideoLightbox item={playing} onClose={() => setPlaying(null)} /> : null}
    </>
  );
}
