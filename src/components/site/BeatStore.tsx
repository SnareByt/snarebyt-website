'use client';

import { useMemo, useState, useEffect } from 'react';
import { coverCss } from '@/lib/cover-art';
import { Price } from './Currency';
import { PlayButton, usePlayer, type Track } from './Player';
import { useCart } from './Cart';
import Link from 'next/link';

export type LicenceView = {
  id: string;
  code: string;
  name: string;
  nameBn: string;
  multiplier: number;
  filesLabel: string;
  filesLabelBn: string;
  terms: string[];
  termsBn: string[];
  isExclusive: boolean;
};

export type BeatView = {
  id: string;
  slug: string;
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  musicalKey: string;
  tags: string[];
  basePriceBdt: number;
  exclusiveAvailable: boolean;
  soldExclusive: boolean;
  coverUrl: string | null;
  seed: number;
  purchaseCount: number;
  publishedAt: string | null;
  /** Public URL of the TAGGED preview. Null until the file is uploaded. */
  previewUrl: string | null;
};

/** Licence price = base × multiplier, rounded to ৳50. Mirrors licencePrice(). */
const price = (base: number, mult: number) => Math.round((base * mult) / 50) * 50;

type Filters = { q: string; genre: string; mood: string; key: string; bpm: number; sort: string };
const EMPTY: Filters = { q: '', genre: '', mood: '', key: '', bpm: 0, sort: 'popular' };

export function BeatStore({ beats, licences }: { beats: BeatView[]; licences: LicenceView[] }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<BeatView | null>(null);
  const [tier, setTier] = useState<LicenceView | null>(null);

  const genres = useMemo(() => [...new Set(beats.map((b) => b.genre))].sort(), [beats]);
  const moods = useMemo(() => [...new Set(beats.map((b) => b.mood))].sort(), [beats]);
  const keys = useMemo(() => [...new Set(beats.map((b) => b.musicalKey))].filter(Boolean).sort(), [beats]);

  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const out = beats.filter((b) => {
      if (q && !b.title.toLowerCase().includes(q) && !b.tags.some((t) => t.toLowerCase().includes(q))) return false;
      if (f.genre && b.genre !== f.genre) return false;
      if (f.mood && b.mood !== f.mood) return false;
      if (f.key && b.musicalKey !== f.key) return false;
      if (f.bpm && b.bpm < f.bpm) return false;
      return true;
    });
    const by: Record<string, (a: BeatView, b: BeatView) => number> = {
      popular: (a, b) => b.purchaseCount - a.purchaseCount,
      new: (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
      lo: (a, b) => a.basePriceBdt - b.basePriceBdt,
      hi: (a, b) => b.basePriceBdt - a.basePriceBdt,
      excl: (a, b) => Number(b.exclusiveAvailable) - Number(a.exclusiveAvailable),
    };
    return [...out].sort(by[f.sort] ?? by.popular);
  }, [beats, f]);

  const activeCount =
    (f.q ? 1 : 0) + (f.genre ? 1 : 0) + (f.mood ? 1 : 0) + (f.key ? 1 : 0) + (f.bpm ? 1 : 0);

  // The queue follows the visible, filtered list, so "next" plays the next
  // beat the visitor can actually see rather than something they filtered out.
  const tracks: Track[] = useMemo(
    () => shown.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: `Prod. SnareByt · ${b.bpm} BPM${b.musicalKey ? ` · ${b.musicalKey}` : ''}`,
      src: b.previewUrl,
      coverUrl: b.coverUrl,
      seed: b.seed,
    })),
    [shown],
  );

  const { isCurrent } = usePlayer();
  const { add, has } = useCart();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <div className="store-head">
        <span className="f-count">
          {shown.length} {shown.length === 1 ? 'beat' : 'beats'}
          {activeCount ? ` · ${activeCount} filter${activeCount === 1 ? '' : 's'}` : ''}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet(true)}>
          ☰ Filters{activeCount ? <span className="fbadge">{activeCount}</span> : null}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>Reset</button>
      </div>

      <div id="fScrim" className={sheet ? 'on' : undefined} onClick={() => setSheet(false)} />
      <div className={sheet ? 'filters on' : 'filters'}>
        <div className="sheet-hd">
          <span className="eyebrow">Filter beats</span>
          <button type="button" className="x-btn" onClick={() => setSheet(false)}>✕</button>
        </div>
        <div className="fld">
          <input
            className="inp"
            placeholder="Search title or tag…"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
        <select className="sel" value={f.genre} onChange={(e) => set({ genre: e.target.value })}>
          <option value="">All genres</option>
          {genres.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="sel" value={f.mood} onChange={(e) => set({ mood: e.target.value })}>
          <option value="">All moods</option>
          {moods.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="sel" value={f.key} onChange={(e) => set({ key: e.target.value })}>
          <option value="">Any key</option>
          {keys.map((k) => <option key={k}>{k}</option>)}
        </select>
        <div className="bpm-box">
          <span style={{ fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'Archivo', fontWeight: 600 }}>
            BPM
          </span>
          <input type="range" min={0} max={160} step={2} value={f.bpm} onChange={(e) => set({ bpm: Number(e.target.value) })} />
          <span className="v">{f.bpm ? `≥ ${f.bpm}` : 'Any'}</span>
        </div>
        <select className="sel" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="popular">Most popular</option>
          <option value="new">Newest</option>
          <option value="lo">Price: low → high</option>
          <option value="hi">Price: high → low</option>
          <option value="excl">Exclusive available</option>
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>Reset</button>
        <button type="button" className="btn btn-red btn-sm btn-full" onClick={() => setSheet(false)}>Show results</button>
      </div>

      <div className="beats-grid">
        {shown.map((b, i) => {
          const cheapest = licences.length
            ? licences.reduce((a, c) => (c.multiplier < a.multiplier ? c : a))
            : null;
          return (
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
                {/* A sold exclusive gets no preview. It is off the market, and
                    streaming it would advertise something nobody can buy. */}
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
                <span className="chip">{b.mood}</span>
                <span className="chip">{b.bpm} BPM</span>
                {b.musicalKey ? <span className="chip k">{b.musicalKey}</span> : null}
              </div>
              <div className="beat-foot">
                {cheapest ? (
                  <div className="price">
                    <Price bdt={price(b.basePriceBdt, cheapest.multiplier)} />
                    <small>from · {cheapest.name.toLowerCase()}</small>
                  </div>
                ) : null}
                <div className="beat-acts">
                  <button type="button" className="btn btn-red btn-sm" onClick={() => { setOpen(b); setTier(null); }}>
                    {b.soldExclusive ? 'View' : 'Licence'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!shown.length ? (
        <div className="empty">
          <p className="lead">
            {beats.length
              ? 'No beats match those filters.'
              : 'No beats are published yet. Each one needs its tagged preview and untagged MP3 uploaded before it can go on sale.'}
          </p>
          {beats.length ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>Reset filters</button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="modal open" role="dialog" aria-modal="true" aria-label={`${open.title} licences`}>
          <div className="modal-bd" onClick={() => setOpen(null)} />
          <div className="modal-box">
            <div className="modal-hd">
              <div>
                <div className="eyebrow">Licence</div>
                <h3 className="display" style={{ marginTop: '.5rem' }}>{open.title}</h3>
              </div>
              <button type="button" className="x-btn" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            </div>
            <div style={{ padding: '1.2rem' }}>
              {open.soldExclusive ? (
                <div className="notice" style={{ marginBottom: '1.2rem' }}>
                  <span>⚑</span>
                  <span>
                    <b>Sold exclusively.</b> This beat has been bought outright and is no longer
                    licensable. It stays listed so the buyer&apos;s licence remains provable.
                  </span>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
                {licences
                  .filter((l) => !open.soldExclusive || l.isExclusive)
                  .map((l) => (
                    <div
                      className={tier?.id === l.id ? 'lic sel' : 'lic'}
                      key={l.id}
                      onClick={() => setTier(l)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTier(l); } }}
                    >
                      <div className="lic-main">
                        <div className="lic-top">
                          <span className="lic-name">
                            {l.name}
                            <span className="bn" style={{ display: 'block', fontSize: '.8rem', fontWeight: 500, color: 'var(--muted)' }}>
                              {l.nameBn}
                            </span>
                          </span>
                          <span className="lic-price"><Price bdt={price(open.basePriceBdt, l.multiplier)} /></span>
                        </div>
                        <div className="lic-files">{l.filesLabel}</div>
                        <div className="bn" style={{ fontSize: '.8rem', color: 'var(--dim)' }}>{l.filesLabelBn}</div>
                        {/* Both languages, always. The buyer agrees to these exact
                            words, and they are snapshotted into the licence PDF. */}
                        <ul className="lic-terms">
                          {l.terms.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                        <div className="bn-block">
                          <span className="bn-tag">বাংলায়</span>
                          <ul className="bn-terms bn">
                            {l.termsBn.map((t) => <li key={t}>{t}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Orders are requests, not payments. Saying so here stops anyone
                  expecting a card form on the next screen. */}
              <div className="notice" style={{ marginTop: '1.4rem' }}>
                <span>ℹ</span>
                <span>
                  <b>No payment is taken on the site.</b> Add a licence to your cart and place the
                  order — SnareByt messages you on WhatsApp to arrange payment and send the files.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                {open.soldExclusive ? null : (
                  <button
                    type="button"
                    className="btn btn-red"
                    disabled={!tier}
                    onClick={() => {
                      if (!tier) return;
                      add({ beatId: open.id, tierId: tier.id });
                      setOpen(null);
                    }}
                  >
                    {!tier
                      ? 'Choose a licence above'
                      : has(open.id, tier.id) ? 'Already in your cart' : `Add ${tier.name} to cart →`}
                  </button>
                )}
                <Link href="/cart" className="btn btn-ghost">View cart</Link>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
