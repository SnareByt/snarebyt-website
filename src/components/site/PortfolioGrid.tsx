'use client';

import { useState } from 'react';
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

function Card({ p }: { p: PortfolioView }) {
  // A visual slot with neither a link nor a cover is an honest placeholder,
  // not a broken card.
  const isSlot = !p.externalUrl && !p.coverUrl && p.category === 'SELECTED_VISUAL_WORK';

  return (
    <article className={isSlot ? 'pf is-slot' : 'pf'}>
      <div className="bgl" style={p.coverUrl ? undefined : { background: coverCss(p.seed) }}>
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="covimg" src={p.coverUrl} alt="" />
        ) : null}
      </div>
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
              fontFamily: 'Archivo',
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
              {group.map((p) => <Card key={p.id} p={p} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}
