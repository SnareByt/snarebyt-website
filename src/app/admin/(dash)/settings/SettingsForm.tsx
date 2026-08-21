'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { YouTubeCheck } from './YouTubeCheck';
import { NotifyCheck } from './NotifyCheck';
import { saveSettings, type SettingsState } from './actions';
import { CHECKOUT_FLOWS, FLOW_LABEL, FLOW_DESC, type CheckoutFlow } from '@/lib/checkout-flow-rules';

const initial: SettingsState = { ok: false };

const MODES = [
  { v: 'live' as const, label: 'Live', desc: 'Open to everyone. Normal trading.' },
  { v: 'soon' as const, label: 'Coming soon', desc: 'Pre-launch. Site blurred behind the panel.' },
  { v: 'maintenance' as const, label: 'Under maintenance', desc: 'Temporarily down. Site blurred behind the panel.' },
];

export function SettingsForm({
  usdRate, whatsapp, businessEmail, youtubeChannel, beatsComingSoon,
  notifyEmail, notifyOnOrder, notifyOnPaid, notifyOnEnquiry, pointerSheen, siteMode,
  checkoutFlow, paymentsConfigured, signature,
}: {
  usdRate: string; whatsapp: string; businessEmail: string;
  youtubeChannel: string; beatsComingSoon: boolean;
  notifyEmail: string; notifyOnOrder: boolean; notifyOnPaid: boolean; notifyOnEnquiry: boolean;
  pointerSheen: boolean;
  siteMode: 'live' | 'soon' | 'maintenance';
  checkoutFlow: CheckoutFlow;
  /** Fingerprint of the stored values this form was rendered from. */
  signature: string;
  /** Whether SSLCOMMERZ credentials exist at all. Never the credentials. */
  paymentsConfigured: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSettings, initial);
  const [mode, setMode] = useState(siteMode);
  const [flow, setFlow] = useState<CheckoutFlow>(checkoutFlow);

  /* Re-sync from the server whenever it sends something different.
     These start as useState(prop), which captures the value ONCE. A tab left
     open therefore kept showing whatever was set when it loaded — and because
     this form saves every field together, pressing Save on that stale tab
     wrote the old site mode back over a change made somewhere else. That is
     the "it goes back to the previous selection" bug: the tab was not merely
     showing a stale picture, it was actively restoring one. */
  useEffect(() => { setMode(siteMode); }, [siteMode]);
  useEffect(() => { setFlow(checkoutFlow); }, [checkoutFlow]);

  /* And refetch after a save, so what is on screen is what is stored rather
     than what was submitted. Keyed on the result object, which is a new object
     for every run of the action, so this fires once per save and never loops. */
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  const e = state.errors ?? {};

  return (
    <form action={action} className="card" style={{ padding: '1.4rem', maxWidth: 560 }}>
      {state.ok ? <div className="chip ok" style={{ marginBottom: '1rem' }}>{state.message}</div> : null}
      {/* Not auto-refreshed. Reloading would remount this form and take the
          explanation with it, leaving the fields silently changing under him.
          One button keeps the message on screen until it has been read. */}
      {state.stale ? (
        <div className="err-box" style={{ margin: '0 0 1rem' }}>
          {state.message}
          <div style={{ marginTop: '.7rem' }}>
            <button type="button" className="btn b-gh b-sm" onClick={() => router.refresh()}>
              Show what is saved
            </button>
          </div>
        </div>
      ) : null}

      {/* What the stored values looked like when this form was drawn. The
          server compares it before writing, so a tab left open cannot put an
          old setting back. */}
      <input type="hidden" name="_signature" value={signature} />

      <div className={`fg ${e.usdRate ? 'bad' : ''}`}>
        <label className="fl" htmlFor="usdRate">USD rate</label>
        <input className="in" id="usdRate" name="usdRate" type="number" step="0.01" min="1"
          defaultValue={usdRate} required />
        <div className="hint">
          How many Taka to one US dollar. Prices are stored in BDT and converted for display only,
          so changing this never changes what anyone is actually charged.
        </div>
        {e.usdRate && <div className="err">{e.usdRate}</div>}
      </div>

      <div className={`fg ${e.whatsapp ? 'bad' : ''}`} style={{ marginTop: '1.1rem' }}>
        <label className="fl" htmlFor="whatsapp">WhatsApp number</label>
        <input className="in" id="whatsapp" name="whatsapp" defaultValue={whatsapp}
          placeholder="8801XXXXXXXXX" />
        <div className="hint">
          Country code, digits only. The button on the contact page stays hidden until this is
          filled in — a wa.me link built from a placeholder opens a chat with nobody.
        </div>
        {e.whatsapp && <div className="err">{e.whatsapp}</div>}
      </div>

      <div className={`fg ${e.businessEmail ? 'bad' : ''}`} style={{ marginTop: '1.1rem' }}>
        <label className="fl" htmlFor="businessEmail">Business email</label>
        <input className="in" id="businessEmail" name="businessEmail" type="email"
          defaultValue={businessEmail} required />
        {e.businessEmail && <div className="err">{e.businessEmail}</div>}
      </div>

      <div className={`fg ${e.youtubeChannel ? 'bad' : ''}`} style={{ marginTop: '1.1rem' }}>
        <label className="fl" htmlFor="youtubeChannel">YouTube channel</label>
        <input className="in" id="youtubeChannel" name="youtubeChannel"
          placeholder="@snarebyt" defaultValue={youtubeChannel} />
        <div className="hint">
          Powers the live subscriber and view counts on the home page. Paste your @handle or the
          UC… channel id. Leave empty to hide the section.
        </div>
        {e.youtubeChannel && <div className="err">{e.youtubeChannel}</div>}
        <YouTubeCheck />
      </div>

      <div className="fg" style={{ marginTop: '1.4rem' }}>
        <label className="fl" htmlFor="notifyEmail">Alerts</label>
        <input
          className="in" id="notifyEmail" name="notifyEmail" type="email"
          placeholder={businessEmail || 'you@example.com'} defaultValue={notifyEmail}
        />
        <div className="hint">
          Where order and enquiry alerts are sent. Leave blank to use your business email.
        </div>

        <label className="check" style={{ marginTop: '.7rem' }}>
          <input type="checkbox" name="notifyOnOrder" defaultChecked={notifyOnOrder} />
          <span>New order placed — before payment</span>
        </label>
        <label className="check" style={{ marginTop: '.4rem' }}>
          <input type="checkbox" name="notifyOnPaid" defaultChecked={notifyOnPaid} />
          <span>Payment confirmed — money actually arrived</span>
        </label>
        <label className="check" style={{ marginTop: '.4rem' }}>
          <input type="checkbox" name="notifyOnEnquiry" defaultChecked={notifyOnEnquiry} />
          <span>New enquiry from the contact form</span>
        </label>

        <NotifyCheck />
      </div>

      <div className="fg" style={{ marginTop: '1.4rem' }}>
        <label className="fl" htmlFor="pointerSheen">Cursor light</label>
        <label className="check" style={{ marginTop: '.4rem' }}>
          <input type="checkbox" id="pointerSheen" name="pointerSheen" defaultChecked={pointerSheen} />
          <span>Cards catch the light where the mouse is</span>
        </label>
        <div className="hint">
          Desktop only — it never runs on a phone, and it is always off for visitors
          who ask for reduced motion.
        </div>
      </div>

      <div className="fg" style={{ marginTop: '1.4rem' }}>
        <label className="fl" htmlFor="beatsComingSoon">Beat store</label>
        <label className="check" style={{ marginTop: '.4rem' }}>
          <input
            type="checkbox" id="beatsComingSoon" name="beatsComingSoon"
            defaultChecked={beatsComingSoon}
          />
          <span>
            Show &ldquo;Coming soon&rdquo; instead of the store
          </span>
        </label>
        <div className="hint">
          Hides the beat grid and licence pricing from visitors and stops beat orders being
          placed. Your catalogue and prices are untouched — untick this to reopen.
        </div>
      </div>

      <div className="fg" style={{ marginTop: '1.8rem' }}>
        <label className="fl">Website access</label>
        <div className="hint" style={{ marginBottom: '.6rem' }}>
          Controls the whole public site — every page, the cart, enquiries and new
          sign-ups. You can still browse it yourself while signed in here.
        </div>

        {/* Radios, not two checkboxes. "Coming soon" and "under maintenance"
            contradict each other, and separate switches would let both be on
            at once — a state with no meaning that something would then have to
            resolve arbitrarily. */}
        <div className="modes">
          {MODES.map((m) => (
            <label key={m.v} className={mode === m.v ? 'mode on' : 'mode'}>
              <input
                type="radio" name="siteMode" value={m.v}
                checked={mode === m.v} onChange={() => setMode(m.v)}
              />
              <span className="mode-t">{m.label}</span>
              <span className="mode-d">{m.desc}</span>
            </label>
          ))}
        </div>

        {mode !== 'live' && (
          <div className="note" style={{ marginTop: '.9rem' }}>
            <span>⚠</span>
            <span>
              {mode === 'soon'
                ? <>Visitors see a <b>Coming soon</b> panel with the site blurred behind it. Nothing can be ordered and no new artist accounts can be created. Existing artists can still sign in for their files.</>
                : <>Visitors see an <b>Under maintenance</b> panel with the site blurred behind it. Nothing can be ordered and no new artist accounts can be created. Existing artists can still sign in for their files.</>}
            </span>
          </div>
        )}
      </div>

      <div className="fg" style={{ marginTop: '1.8rem' }}>
        <label className="fl">Checkout</label>
        <div className="hint" style={{ marginBottom: '.6rem' }}>
          What happens the moment someone presses Place order. Either way the order is saved
          first and nothing is charged until they finish at SSLCOMMERZ, so switching this can
          never lose an order.
        </div>

        <div className="modes">
          {CHECKOUT_FLOWS.map((f) => (
            <label key={f} className={flow === f ? 'mode on' : 'mode'}>
              <input
                type="radio" name="checkoutFlow" value={f}
                checked={flow === f} onChange={() => setFlow(f)}
              />
              <span className="mode-t">{FLOW_LABEL[f]}</span>
              <span className="mode-d">{FLOW_DESC[f]}</span>
            </label>
          ))}
        </div>

        {/* Said plainly, because "straight to payment" with no gateway
            configured would be a promise the site cannot keep. */}
        {!paymentsConfigured ? (
          <div className="note" style={{ marginTop: '.9rem' }}>
            <span>⚠</span>
            <span>
              <b>No SSLCOMMERZ credentials are set, so neither option can take a payment yet.</b>{' '}
              Until they are, every order lands on the confirmation screen with the WhatsApp
              button — which is the only thing that still works. Add SSLC_STORE_ID and
              SSLC_STORE_PASSWORD in Vercel to switch payments on.
            </span>
          </div>
        ) : flow === 'review' ? (
          <div className="note" style={{ marginTop: '.9rem' }}>
            <span>💬</span>
            <span>
              Customers see their order number, a <b>Pay now</b> button and an{' '}
              <b>Arrange on WhatsApp</b> button. Use this when you want a word before money
              moves — a custom job whose price might still change. Expect fewer to pay the same
              day than with straight to payment.
            </span>
          </div>
        ) : null}
      </div>

      <button className="btn b-red" type="submit" style={{ marginTop: '1.4rem' }} disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
