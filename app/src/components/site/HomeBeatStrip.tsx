'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { coverCss } from '@/lib/cover-art';
import { Price } from './Currency';
import { PlayButton, usePlayer, type Track } from './Player';
import type { BeatView } from './BeatStore';

/**
 * The four-beat strip on the home page. Same card as the store, but the play
 * queue is only these four — pressing next should not wander into beats the
 * visitor has not seen.
 */
export function HomeBeatStrip({ beats, cheapestMultiplier }: { beats: BeatView[]; cheapestMultiplier: number }) {
  const { isCurrent } = usePlayer();

  const tracks: Track[] = useMemo(
    () => beats.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: `Prod. SnareByt · ${b.bpm} BPM${b.musicalKey ? ` · ${b.musicalKey}` : ''}`,
      src: b.previewUrl,
      coverUrl: b.coverUrl,
      seed: b.seed,
    })),
    [beats],
  );

  if (!beats.length) return null;

  return (
    <div className="beats-grid">
      {beats.map((b, i) => (
        <article className={isCurrent(b.id) ? 'card beat playing' : 'card beat'} key={b.id}>
          <div className="beat-art" style={b.coverUrl ? undefined : { background: coverCss(b.seed) }}>
            {b.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="covimg" src={b.coverUrl} alt="" />
            ) : null}
            <div className="noise" />
            {b.soldExclusive ? (
              <span className="badge sold">Sold — Exclusive</span>
            ) : b.exclusiveAvailable ? (
              <span className="badge excl">Exclusive available</span>
            ) : null}
            {b.soldExclusive ? null : <PlayButton queue={tracks} index={i} label={b.title} />}
          </div>
          <div>
            <div className="beat-title"><span>{b.title}</span></div>
            <div style={{ fontSize: '.68rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'Archivo', fontWeight: 600, marginTop: '.2rem' }}>
              Prod. SnareByt
            </div>
          </div>
          <div className="beat-meta">
            <span className="chip">{b.genre}</span>
            <span className="chip">{b.bpm} BPM</span>
            {b.musicalKey ? <span className="chip k">{b.musicalKey}</span> : null}
          </div>
          <div className="beat-foot">
            <div className="price">
              <Price bdt={Math.round((b.basePriceBdt * cheapestMultiplier) / 50) * 50} />
              <small>from</small>
            </div>
            <div className="beat-acts">
              <Link href="/beats" className="btn btn-red btn-sm">Licence</Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
