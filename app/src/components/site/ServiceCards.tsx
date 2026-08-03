'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Price } from './Currency';

export type ServiceTierView = {
  id: string;
  name: string;
  priceBdt: number;
  description: string;
  descriptionBn: string;
  recommended: boolean;
};

export type ServiceView = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  icon: string | null;
  audience: string;
  included: string[];
  required: string[];
  deliveryDays: string;
  revisions: string;
  tiers: ServiceTierView[];
};

/**
 * Service grid plus the package modal.
 *
 * Every tier shows its description in English AND Bangla. That pairing is a
 * requirement, not a nicety — `descriptionBn` is non-nullable in the schema
 * precisely so a Bangladeshi buyer can never be shown an English-only
 * description of what they are paying for.
 */
export function ServiceCards({ services }: { services: ServiceView[] }) {
  const [open, setOpen] = useState<ServiceView | null>(null);

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <div className="svc-grid">
        {services.map((s) => {
          const cheapest = s.tiers.length
            ? s.tiers.reduce((a, b) => (b.priceBdt < a.priceBdt ? b : a))
            : null;
          return (
            <article className="card svc rv" key={s.id}>
              {s.icon ? <div className="ico">{s.icon}</div> : null}
              <h3 className="display">{s.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.86rem' }}>{s.tagline}</p>
              <ul>
                {s.included.slice(0, 4).map((i) => <li key={i}>{i}</li>)}
              </ul>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
                <span className="chip">{s.deliveryDays}</span>
                <span className="chip">{s.revisions}</span>
              </div>
              {cheapest ? (
                <div className="from" style={{ marginTop: 'auto' }}>
                  <Price bdt={cheapest.priceBdt} /><small>from</small>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button
                  type="button"
                  className="btn btn-red btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setOpen(s)}
                >
                  Packages
                </button>
                <Link className="btn btn-ghost btn-sm" href="/contact">Quote</Link>
              </div>
            </article>
          );
        })}
      </div>

      {open ? (
        <div className="modal open" role="dialog" aria-modal="true" aria-label={`${open.title} packages`}>
          <div className="modal-bd" onClick={() => setOpen(null)} />
          <div className="modal-box">
            <div className="modal-hd">
              <div>
                <div className="eyebrow">Packages</div>
                <h3 className="display" style={{ marginTop: '.5rem' }}>{open.title}</h3>
              </div>
              <button type="button" className="x-btn" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            </div>
            <div className="modal-bd-content" style={{ padding: '1.2rem' }}>
              <p className="lead" style={{ fontSize: '.9rem' }}>{open.audience}</p>

              <div className="tiers" style={{ marginTop: '1.2rem' }}>
                {open.tiers.map((t) => (
                  <div className={t.recommended ? 'tier best' : 'tier'} key={t.id}>
                    {t.recommended ? <span className="rec">Recommended</span> : null}
                    <div className="eyebrow">{t.name}</div>
                    <div className="from" style={{ margin: '.6rem 0' }}><Price bdt={t.priceBdt} /></div>
                    <p style={{ fontSize: '.84rem', color: 'var(--muted)' }}>{t.description}</p>
                    <p className="bn" style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: '.5rem' }}>
                      {t.descriptionBn}
                    </p>
                  </div>
                ))}
              </div>

              {open.included.length ? (
                <>
                  <div className="hairline" style={{ margin: '1.6rem 0 1rem' }} />
                  <div className="eyebrow">What is included</div>
                  <ul style={{ marginTop: '.7rem' }}>
                    {open.included.map((i) => <li key={i} style={{ fontSize: '.86rem' }}>{i}</li>)}
                  </ul>
                </>
              ) : null}

              {open.required.length ? (
                <>
                  <div className="eyebrow" style={{ marginTop: '1.2rem' }}>What I need from you</div>
                  <ul style={{ marginTop: '.7rem' }}>
                    {open.required.map((i) => <li key={i} style={{ fontSize: '.86rem' }}>{i}</li>)}
                  </ul>
                </>
              ) : null}

              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
                {/* Booking runs through the brief form until checkout exists —
                    no button here pretends to take a payment. */}
                <Link href="/contact" className="btn btn-red">Send a brief →</Link>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
