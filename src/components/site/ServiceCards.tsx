'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Price } from './Currency';
import { useCart, serviceLine, lineKey } from './Cart';

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
 *
 * Both routes to a booking stay open on every package. A fixed-price package
 * can be paid for straight away; anything that needs discussion first goes
 * through the brief. Removing either one would strand a real customer.
 */
export function ServiceCards({ services, payable }: { services: ServiceView[]; payable: boolean }) {
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
              <p className="svc-tag">{s.tagline}</p>
              <ul>
                {s.included.slice(0, 4).map((i) => <li key={i}>{i}</li>)}
              </ul>
              <div className="svc-meta">
                <span className="micro">{s.deliveryDays}</span>
                <span className="micro">{s.revisions}</span>
              </div>
              <div className="svc-foot">
                {cheapest ? (
                  <div className="from">
                    <Price bdt={cheapest.priceBdt} /><small>from</small>
                  </div>
                ) : null}
                <div className="svc-btns">
                  <button
                    type="button"
                    className="btn btn-red btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setOpen(s)}
                  >
                    Packages
                  </button>
                  <Link className="btn btn-ghost btn-sm" href={`/contact?service=${s.slug}`}>Quote</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {open ? <PackageModal service={open} payable={payable} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PackageModal({
  service, payable, onClose,
}: { service: ServiceView; payable: boolean; onClose: () => void }) {
  const { add, has } = useCart();

  return (
    <div className="modal open" role="dialog" aria-modal="true" aria-label={`${service.title} packages`}>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal-box wide">
        <div className="modal-hd">
          <div>
            <div className="rule-eyebrow">Service package</div>
            <h3 className="display modal-title">{service.title}</h3>
            <p className="modal-sub">{service.tagline}</p>
          </div>
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-scroll">
          <dl className="spec">
            <div><dt>Who it&rsquo;s for</dt><dd>{service.audience}</dd></div>
            <div><dt>Delivery</dt><dd>{service.deliveryDays}</dd></div>
            <div><dt>Revisions</dt><dd>{service.revisions}</dd></div>
          </dl>

          {service.included.length ? (
            <section className="modal-sec">
              <h4 className="rule-eyebrow">What&rsquo;s included</h4>
              <ul className="tick-grid">
                {service.included.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </section>
          ) : null}

          {service.required.length ? (
            <section className="modal-sec">
              <h4 className="rule-eyebrow">What I need from you</h4>
              <ul className="tick-grid">
                {service.required.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </section>
          ) : null}

          {service.tiers.length ? (
            <section className="modal-sec">
              <h4 className="rule-eyebrow">Packages</h4>
              <div className="tiers">
                {service.tiers.map((t) => {
                  const key = lineKey(serviceLine(t.id));
                  const inCart = has(key);
                  return (
                    <div className={t.recommended ? 'tier best' : 'tier'} key={t.id}>
                      {t.recommended ? <span className="rec">Most chosen</span> : null}
                      <div className="tier-name">{t.name}</div>
                      <div className="from"><Price bdt={t.priceBdt} /></div>
                      <p className="tier-desc">{t.description}</p>
                      <p className="tier-desc bn">{t.descriptionBn}</p>
                      <p className="micro tier-meta">{service.deliveryDays}</p>
                      {payable ? (
                        <button
                          type="button"
                          className={inCart ? 'btn btn-ghost btn-sm tier-cta' : 'btn btn-red btn-sm tier-cta'}
                          onClick={() => add(serviceLine(t.id))}
                          disabled={inCart}
                        >
                          {inCart ? 'In your cart' : 'Add to cart'}
                        </button>
                      ) : (
                        <Link
                          className="btn btn-ghost btn-sm tier-cta"
                          href={`/contact?service=${service.slug}&package=${encodeURIComponent(t.name)}`}
                        >
                          Select
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="modal-foot">
            {payable ? <Link href="/cart" className="btn btn-red">Go to cart →</Link> : null}
            <Link href={`/contact?service=${service.slug}`} className="btn btn-ghost">
              Send a brief instead
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
