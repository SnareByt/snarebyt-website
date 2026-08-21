'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useCart, lineKey } from './Cart';
import { Price } from './Currency';
import { placeOrder, startPayment, type OrderState } from '@/app/(site)/cart/actions';
import { resolveFields, intakeName, type IntakeSpec } from '@/lib/service-intake';

export type CatalogueBeat = { id: string; title: string; basePriceBdt: number; exclusiveAvailable: boolean };
export type CatalogueTier = {
  id: string; name: string; nameBn: string; multiplier: number;
  filesLabel: string; isExclusive: boolean;
};
export type CatalogueService = {
  id: string; name: string; priceBdt: number; descriptionBn: string;
  serviceTitle: string; deliveryDays: string;
  /** Keys of what must be answered before this package can be ordered. */
  intakeFields: string[];
};

const price = (base: number, mult: number) => Math.round((base * mult) / 50) * 50;

const initial: OrderState = { ok: false, attempt: 0 };

/** One resolved cart row, whichever kind of thing it is. */
type Row = {
  key: string;
  title: string;
  sub: string;
  bn: string;
  priceBdt: number;
  /** Services need a brief afterwards; beats do not. */
  isService: boolean;
  /** Set for services: the tier id, used to name this line's brief fields. */
  serviceTierId?: string;
  /** What this line must be told before it can be ordered. Empty for beats. */
  fields: IntakeSpec[];
};

export function CartView({
  beats, tiers, services, payable, straightToPay,
}: {
  beats: CatalogueBeat[];
  tiers: CatalogueTier[];
  services: CatalogueService[];
  payable: boolean;
  /** Set from the Checkout setting: does the button end at the gateway? */
  straightToPay: boolean;
}) {
  const { lines, remove, clear, ready } = useCart();
  const [state, action, pending] = useActionState(placeOrder, initial);
  const [paying, startPaying] = useTransition();
  const [payError, setPayError] = useState<string | null>(null);
  const e = state.errors ?? {};
  const v = state.values ?? {};

  const beatById = useMemo(() => new Map(beats.map((b) => [b.id, b])), [beats]);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  // A line whose beat or package has since been withdrawn simply drops out —
  // the server would refuse it anyway, so showing it would only mislead.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const l of lines) {
      if (l.kind === 'service') {
        const s = serviceById.get(l.serviceTierId);
        if (!s) continue;
        out.push({
          key: lineKey(l),
          title: s.serviceTitle,
          sub: `${s.name} package · ${s.deliveryDays}`,
          bn: s.descriptionBn,
          priceBdt: s.priceBdt,
          isService: true,
          serviceTierId: s.id,
          fields: resolveFields(s.intakeFields),
        });
      } else {
        const b = beatById.get(l.beatId);
        const t = tierById.get(l.tierId);
        if (!b || !t) continue;
        out.push({
          key: lineKey(l),
          title: b.title,
          sub: `${t.name} · ${t.filesLabel}${t.isExclusive ? ' · takes the beat off sale permanently' : ''}`,
          bn: t.nameBn,
          priceBdt: price(b.basePriceBdt, t.multiplier),
          isService: false,
          fields: [],
        });
      }
    }
    return out;
  }, [lines, beatById, tierById, serviceById]);

  const total = rows.reduce((n, r) => n + r.priceBdt, 0);
  const hasService = rows.some((r) => r.isService);
  const briefRows = rows.filter((r) => r.serviceTierId && r.fields.length);

  /* Straight to the gateway.
     placeOrder opens the SSLCOMMERZ session itself, so the order and the
     payment screen are one action rather than two — no intermediate page with
     a second button to press, which is where people were dropping out. The
     cart is emptied first: the order now holds those lines, and coming back
     from the gateway to a still-full cart invites paying for them twice. */
  const payUrl = state.ok ? state.payUrl : undefined;
  useEffect(() => {
    if (!state.ok) return;
    clear();
    if (payUrl) window.location.href = payUrl;
  }, [state.ok, payUrl, clear]);

  /* ---------------- after a successful order ---------------- */
  if (state.ok) {
    // The gateway session is already open and the browser is on its way there.
    // Shown rather than left blank because a cross-origin navigation can take
    // a second or two on a Dhaka mobile connection, and a blank screen at the
    // moment of paying is the one place not to leave someone guessing.
    if (payUrl) {
      return (
        <div className="card" style={{ padding: '2rem', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow">Order {state.number} saved</div>
          <h2 className="display" style={{ margin: '1rem 0' }}>Taking you to secure payment…</h2>
          <p className="lead">
            SSLCOMMERZ handles the payment — card, bKash, Nagad or Rocket. SnareByt never sees
            your card details.
          </p>
          <p className="note" style={{ marginTop: '1.2rem' }}>
            Not moving? <a href={payUrl}>Open the payment page</a>.
          </p>
        </div>
      );
    }

    const wa = state.whatsapp;
    const msg = encodeURIComponent(
      `Hi SnareByt — I've placed order ${state.number} on your site. Ready to arrange payment.`,
    );
    return (
      <div className="card" style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
        <div className="eyebrow">Order received</div>
        <h2 className="display" style={{ margin: '1rem 0' }}>{state.number}</h2>
        <p className="lead">
          Saved, and <strong>nothing has been charged yet</strong>.{' '}
          {state.payable
            ? 'Pay by card, bKash, Nagad or Rocket now, or arrange it with SnareByt directly.'
            : 'SnareByt will message you to arrange payment and delivery.'}
        </p>

        {payError ? <div className="err-box" style={{ marginTop: '1rem' }}>{payError}</div> : null}

        <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
          {state.payable && state.orderId ? (
            <button
              type="button"
              className="btn btn-red"
              disabled={paying}
              onClick={() => {
                setPayError(null);
                startPaying(async () => {
                  const res = await startPayment(state.orderId!);
                  // The gateway is a different origin, so this is a full
                  // navigation rather than a router push.
                  if (res.ok) window.location.href = res.url;
                  else setPayError(res.error);
                });
              }}
            >
              {paying ? 'Opening secure payment…' : `Pay ৳${(state.totalBdt ?? 0).toLocaleString('en-US')} now →`}
            </button>
          ) : null}
          {wa ? (
            <a className="btn btn-ghost" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer">
              Arrange on WhatsApp
            </a>
          ) : null}
        </div>

        {state.hasService ? (
          <p className="note" style={{ marginTop: '1.4rem' }}>
            Your brief is attached to the order, so work can start as soon as the payment clears.
          </p>
        ) : null}

        <p className="note" style={{ marginTop: '.9rem' }}>
          Keep your order number.{state.payable ? ' Paying takes you to SSLCOMMERZ — SnareByt never sees your card details, and the payment is confirmed by their servers, not by your browser.' : ''}
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
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/beats" className="btn btn-red">Browse beats</Link>
          <Link href="/services" className="btn btn-ghost">See services</Link>
        </div>
      </div>
    );
  }

  /* ---------------- cart + order form ---------------- */
  return (
    <div className="split" style={{ alignItems: 'start' }}>
      <div>
        {rows.map((r) => (
          <div className="cart-row" key={r.key}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ttl">{r.title}</div>
              <div className="sub">{r.sub}</div>
              <div className="bn sub">{r.bn}</div>
            </div>
            <div className="price"><Price bdt={r.priceBdt} /></div>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => remove(r.key)}
              aria-label={`Remove ${r.title}`}
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
            <label className="lb" htmlFor="notes">
              {hasService ? 'Anything else about the job — deadline, anything I should know' : 'Anything else'}
            </label>
            <textarea className="inp" id="notes" name="notes" rows={3} defaultValue={v.notes ?? ''} />
          </div>
        </div>

        {/* What each service needs before it can be started. Asked here rather
            than chased on WhatsApp three days later, which is the single most
            common way a booking stalls. */}
        {briefRows.map((r) => (
          <div className="brief" key={`brief-${r.key}`}>
            <div className="brief-hd">
              <span className="eyebrow">Brief for {r.title}</span>
              <span className="req-chip">Required</span>
            </div>
            <div className="form" key={`${r.key}-${state.attempt}`}>
              {r.fields.map((f) => {
                const nm = intakeName(r.serviceTierId!, f.key);
                const err = e[nm];
                return (
                  <div className={`field full${err ? ' bad' : ''}`} key={nm}>
                    <label className="lb" htmlFor={nm}>{f.label} *</label>
                    <textarea
                      className="inp" id={nm} name={nm}
                      rows={f.kind === 'links' ? 2 : 4}
                      placeholder={f.placeholder}
                      defaultValue={v[nm] ?? ''}
                    />
                    {err ? <div className="err">{err}</div> : <div className="hint">{f.hint}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="form">
          <div className={`field full${e.terms ? ' bad' : ''}`}>
            <label className="check">
              <input type="checkbox" name="terms" />
              <span>
                I have read and accept the {hasService ? 'licence and service terms' : 'licence terms'} for
                this order. *
              </span>
            </label>
            {e.terms && <div className="err">{e.terms}</div>}
          </div>
        </div>

        <button className="btn btn-red btn-full" type="submit" style={{ marginTop: '1.2rem' }} disabled={pending}>
          {pending
            ? 'Placing order…'
            : straightToPay ? `Pay ৳${total.toLocaleString('en-US')} & place order →` : 'Place order →'}
        </button>

        {/* Said plainly, because what happens next differs entirely depending on
            whether the gateway is configured, and being vague is a complaint. */}
        <p className="note" style={{ marginTop: '.9rem' }}>
          {straightToPay
            ? <><b>Your order is saved first, then you go straight to SSLCOMMERZ</b> to pay by card,
                bKash, Nagad or Rocket. Nothing is charged until you complete it there, and if you
                back out the order is still yours to pay later.</>
            : payable
              ? <><b>Nothing is charged on this screen.</b> Placing the order gives you a payment button
                  for card, bKash, Nagad and Rocket — or you can arrange it on WhatsApp instead.</>
              : <><b>No payment is taken here.</b> Placing the order sends it to SnareByt, who will message
                  you on WhatsApp to arrange payment and deliver your files.</>}
        </p>
      </form>
    </div>
  );
}
