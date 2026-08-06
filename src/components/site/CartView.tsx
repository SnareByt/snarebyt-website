'use client';

import Link from 'next/link';
import { useActionState, useMemo } from 'react';
import { useCart } from './Cart';
import { Price } from './Currency';
import { placeOrder, type OrderState } from '@/app/(site)/cart/actions';

export type CatalogueBeat = { id: string; title: string; basePriceBdt: number; exclusiveAvailable: boolean };
export type CatalogueTier = {
  id: string; name: string; nameBn: string; multiplier: number;
  filesLabel: string; isExclusive: boolean;
};

const price = (base: number, mult: number) => Math.round((base * mult) / 50) * 50;

const initial: OrderState = { ok: false, attempt: 0 };

export function CartView({ beats, tiers }: { beats: CatalogueBeat[]; tiers: CatalogueTier[] }) {
  const { lines, remove, clear, ready } = useCart();
  const [state, action, pending] = useActionState(placeOrder, initial);
  const e = state.errors ?? {};
  const v = state.values ?? {};

  const beatById = useMemo(() => new Map(beats.map((b) => [b.id, b])), [beats]);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);

  const rows = lines
    .map((l) => ({ line: l, beat: beatById.get(l.beatId), tier: tierById.get(l.tierId) }))
    .filter((r) => r.beat && r.tier);

  const total = rows.reduce((n, r) => n + price(r.beat!.basePriceBdt, r.tier!.multiplier), 0);

  /* ---------------- after a successful order ---------------- */
  if (state.ok) {
    const wa = state.whatsapp;
    const msg = encodeURIComponent(
      `Hi SnareByt — I've placed order ${state.number} on your site. Ready to arrange payment.`,
    );
    return (
      <div className="card" style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
        <div className="eyebrow">Order received</div>
        <h2 className="display" style={{ margin: '1rem 0' }}>{state.number}</h2>
        <p className="lead">
          Your order is saved. <strong>Nothing has been charged</strong> — SnareByt will message you
          to arrange payment, then send your files directly.
        </p>
        <p className="lead" style={{ marginTop: '.8rem' }}>
          The fastest way to finish is to message on WhatsApp with your order number.
        </p>
        <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
          {wa ? (
            <a className="btn btn-red" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer">
              Message on WhatsApp →
            </a>
          ) : null}
          <Link href="/beats" className="btn btn-ghost" onClick={() => clear()}>Back to the store</Link>
        </div>
        <p className="note" style={{ marginTop: '1.4rem' }}>
          Keep your order number. A copy of it is in SnareByt&apos;s dashboard against your email.
        </p>
      </div>
    );
  }

  /* ---------------- empty ---------------- */
  if (!ready) return <div className="note"><span>⏳</span><span>Loading your cart…</span></div>;

  if (!rows.length) {
    return (
      <div className="empty">
        <p className="lead">
          {lines.length
            ? 'Nothing in your cart is still on sale. It may have sold or been taken off the store.'
            : 'Your cart is empty.'}
        </p>
        <Link href="/beats" className="btn btn-red">Browse beats</Link>
      </div>
    );
  }

  /* ---------------- cart + order form ---------------- */
  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div>
        {rows.map(({ line, beat, tier }) => (
          <div className="cart-row" key={`${line.beatId}-${line.tierId}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ttl">{beat!.title}</div>
              <div className="sub">
                {tier!.name} · {tier!.filesLabel}
                {tier!.isExclusive ? ' · takes the beat off sale permanently' : ''}
              </div>
              <div className="bn sub">{tier!.nameBn}</div>
            </div>
            <div className="price"><Price bdt={price(beat!.basePriceBdt, tier!.multiplier)} /></div>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => remove(line.beatId, line.tierId)}
              aria-label={`Remove ${beat!.title}`}
            >✕</button>
          </div>
        ))}

        <div className="cart-sum">
          <div className="sum-row tot">
            <span>Total</span>
            <span><Price bdt={total} /></span>
          </div>
          <div className="sub" style={{ marginTop: '.5rem' }}>
            Charged in BDT. Any USD figure is a conversion for reference only.
          </div>
        </div>

        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '1rem' }} onClick={clear}>
          Empty cart
        </button>
      </div>

      <form className="card" style={{ padding: '1.6rem' }} action={action}>
        <div className="eyebrow">Your details</div>

        {state.message ? <div className="err-box" style={{ marginTop: '.8rem' }}>{state.message}</div> : null}

        <input type="hidden" name="lines" value={JSON.stringify(lines)} />

        <div className="form" style={{ marginTop: '1rem' }} key={state.attempt}>
          <div className={`field${e.name ? ' bad' : ''}`}>
            <label className="lb" htmlFor="name">Full name *</label>
            <input className="inp" id="name" name="name" defaultValue={v.name ?? ''} />
            {e.name && <div className="err">{e.name}</div>}
          </div>
          <div className={`field${e.email ? ' bad' : ''}`}>
            <label className="lb" htmlFor="email">Email *</label>
            <input className="inp" id="email" name="email" type="email" defaultValue={v.email ?? ''} />
            {e.email && <div className="err">{e.email}</div>}
          </div>
          <div className={`field${e.phone ? ' bad' : ''}`}>
            <label className="lb" htmlFor="phone">WhatsApp number *</label>
            <input className="inp" id="phone" name="phone" placeholder="+880…" defaultValue={v.phone ?? ''} />
            {e.phone
              ? <div className="err">{e.phone}</div>
              : <div className="hint">This is how your files will reach you.</div>}
          </div>
          <div className="field">
            <label className="lb" htmlFor="artistName">Artist name</label>
            <input className="inp" id="artistName" name="artistName" defaultValue={v.artistName ?? ''} />
          </div>
          <div className="field">
            <label className="lb" htmlFor="country">Country</label>
            <input className="inp" id="country" name="country" defaultValue={v.country ?? ''} />
          </div>
          <div className="field full">
            <label className="lb" htmlFor="notes">Anything else</label>
            <textarea className="inp" id="notes" name="notes" rows={3} defaultValue={v.notes ?? ''} />
          </div>
          <div className={`field full${e.terms ? ' bad' : ''}`}>
            <label className="check">
              <input type="checkbox" name="terms" />
              <span>I have read and accept the licence terms for the beats in this order. *</span>
            </label>
            {e.terms && <div className="err">{e.terms}</div>}
          </div>
        </div>

        <button className="btn btn-red btn-full" type="submit" style={{ marginTop: '1.2rem' }} disabled={pending}>
          {pending ? 'Placing order…' : 'Place order →'}
        </button>

        {/* Said plainly, twice, because a cart that takes no payment is not what
            anyone expects and being vague about it would be a complaint later. */}
        <p className="note" style={{ marginTop: '.9rem' }}>
          <b>No payment is taken here.</b> Placing the order sends it to SnareByt, who will message
          you on WhatsApp to arrange payment and deliver your files.
        </p>
      </form>
    </div>
  );
}
