'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveSettings, type SettingsState } from '@/app/admin/(dash)/settings/actions';
import { CHECKOUT_FLOWS, FLOW_LABEL, FLOW_DESC, type CheckoutFlow } from '@/lib/checkout-flow-rules';
import { useToast } from '@/components/app/Ui';
import { IcCheck } from '@/components/app/Icons';

type SiteMode = 'live' | 'soon' | 'maintenance';

/**
 * The three states of the public site, in the order of least to most closed.
 *
 * One setting with three values rather than two switches: "coming soon" and
 * "under maintenance" say contradictory things, and two booleans could be on
 * at once — a state with no meaning that some arbitrary precedence rule would
 * have to resolve. A single mode cannot contradict itself.
 */
const MODES: { v: SiteMode; label: string; desc: string }[] = [
  { v: 'live', label: 'Live', desc: 'Open to everyone. Normal trading.' },
  { v: 'soon', label: 'Coming soon', desc: 'Pre-launch. Visitors see the holding panel.' },
  { v: 'maintenance', label: 'Under maintenance', desc: 'Temporarily down. Back shortly.' },
];

/**
 * A radio rendered as a list row, which is what iOS does for a choice of one.
 *
 * The whole row is the label, so the tap target is the full width rather than
 * a 20px circle — the difference between a setting you can change one-handed
 * on a bus and one you mis-tap.
 */
function PickRow({
  name, value, checked, onPick, title, sub,
}: {
  name: string; value: string; checked: boolean; onPick: () => void;
  title: string; sub: string;
}) {
  return (
    <label className="row">
      <input
        type="radio" name={name} value={value} checked={checked} onChange={onPick}
        className="sr-only"
      />
      <div className="row-main">
        <div className="row-t">{title}</div>
        <div className="row-s">{sub}</div>
      </div>
      <span className="row-x" aria-hidden="true">
        {checked ? <IcCheck className="ic-sm" /> : null}
      </span>
    </label>
  );
}

type Values = {
  usdRate: string; whatsapp: string; businessEmail: string; youtubeChannel: string;
  notifyEmail: string; beatsComingSoon: boolean; notifyOnOrder: boolean;
  notifyOnPaid: boolean; notifyOnEnquiry: boolean; pointerSheen: boolean;
  siteMode: SiteMode; checkoutFlow: CheckoutFlow;
};

const EMPTY: SettingsState = { ok: false };

export function SettingsForm({
  values, paymentsConfigured,
}: {
  values: Values;
  paymentsConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettings, EMPTY);
  const toast = useToast();

  /* Controlled, so the ticks move on tap. Uncontrolled radios would still
     submit correctly but the checkmark would not follow the finger, which
     reads as the tap not having registered. */
  const [mode, setMode] = useState<SiteMode>(values.siteMode);
  const [flow, setFlow] = useState<CheckoutFlow>(values.checkoutFlow);

  useEffect(() => {
    if (state.ok && state.message) toast(state.message);
    else if (state.errors) toast(Object.values(state.errors)[0] ?? 'Check the form.', 'bad');
  }, [state, toast]);

  return (
    <>
      <div className="big-title">
        <h2>Settings</h2>
        <p>Live on the site the moment they save</p>
      </div>

      <form action={action} className="wrap stack-lg">
        {/* ---------- Website access ----------
            First, because it is the biggest switch on the screen and the one
            most likely to be reached for in a hurry — something is wrong with
            the site and you are not at a desk. */}
        <div>
          <div className="sec"><h3>Website access</h3></div>
          <div className="list">
            {MODES.map((m) => (
              <PickRow
                key={m.v}
                name="siteMode"
                value={m.v}
                checked={mode === m.v}
                onPick={() => setMode(m.v)}
                title={m.label}
                sub={m.desc}
              />
            ))}
          </div>
          {mode === 'live' ? (
            <p className="hint">
              Closing the site does not lock you out of it. Signed in, you still see
              the real pages with a banner saying why visitors cannot.
            </p>
          ) : (
            <div className="note warn" style={{ marginTop: '.7rem' }}>
              <b>Not saved until you press Save settings.</b>
              <br />
              While closed, orders and enquiries are refused by the server, not merely
              hidden — a form that is only invisible can still be posted to.
            </div>
          )}
        </div>

        {/* ---------- The store ---------- */}
        <div>
          <div className="sec"><h3>The store</h3></div>
          <div className="list">
            <label className="row">
              <div className="row-main">
                <div className="row-t">Beat store coming soon</div>
                <div className="row-s">
                  Shows the holding panel instead of the store
                </div>
              </div>
              <span className="sw">
                <input type="checkbox" name="beatsComingSoon" value="true"
                       defaultChecked={values.beatsComingSoon} aria-label="Beat store coming soon" />
                <i />
              </span>
            </label>
          </div>
        </div>

        {/* ---------- Money ---------- */}
        <div>
          <div className="sec"><h3>Currency</h3></div>
          <div className="field">
            <label className="fl" htmlFor="s-rate">Taka per US dollar</label>
            <input
              id="s-rate" name="usdRate" className="in" type="number"
              inputMode="decimal" step="0.01" min="1"
              defaultValue={values.usdRate} required
            />
            <p className="hint">
              Every price is stored in taka. The dollar figure shown to overseas buyers is
              worked out from this at render time and never stored, so the two can never
              drift apart. Orders already placed keep the rate they froze at checkout.
            </p>
            {state.errors?.usdRate && <p className="err">{state.errors.usdRate}</p>}
          </div>
        </div>

        {/* ---------- Checkout ---------- */}
        <div>
          <div className="sec"><h3>Checkout</h3></div>
          <div className="list">
            {CHECKOUT_FLOWS.map((f) => (
              <PickRow
                key={f}
                name="checkoutFlow"
                value={f}
                checked={flow === f}
                onPick={() => setFlow(f)}
                title={FLOW_LABEL[f]}
                sub={FLOW_DESC[f]}
              />
            ))}
          </div>
          {!paymentsConfigured && (
            <p className="hint">
              SSLCOMMERZ is not configured on the server, so orders behave as
              &ldquo;{FLOW_LABEL.review}&rdquo; whichever is picked here — that is the only
              setting that still reaches a customer. The order is saved either way.
            </p>
          )}
        </div>

        {/* ---------- Contact ---------- */}
        <div>
          <div className="sec"><h3>Contact</h3></div>
          <div className="field">
            <label className="fl" htmlFor="s-email">Business email</label>
            <input
              id="s-email" name="businessEmail" className="in" type="email"
              inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={values.businessEmail}
            />
            {state.errors?.businessEmail && <p className="err">{state.errors.businessEmail}</p>}
          </div>
          <div className="field">
            <label className="fl" htmlFor="s-wa">WhatsApp number</label>
            <input
              id="s-wa" name="whatsapp" className="in" type="tel" inputMode="tel"
              defaultValue={values.whatsapp} placeholder="+8801…"
            />
            {state.errors?.whatsapp && <p className="err">{state.errors.whatsapp}</p>}
          </div>
          <div className="field">
            <label className="fl" htmlFor="s-yt">YouTube channel</label>
            <input
              id="s-yt" name="youtubeChannel" className="in"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={values.youtubeChannel}
            />
            {state.errors?.youtubeChannel && <p className="err">{state.errors.youtubeChannel}</p>}
          </div>
        </div>

        {/* ---------- Alerts ---------- */}
        <div>
          <div className="sec"><h3>Where alerts go</h3></div>
          <div className="field">
            <label className="fl" htmlFor="s-notify">Alert email</label>
            <input
              id="s-notify" name="notifyEmail" className="in" type="email"
              inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={values.notifyEmail}
            />
            <p className="hint">
              Leave blank to use the business email. Push alerts to this phone are set up on
              the Alerts screen.
            </p>
            {state.errors?.notifyEmail && <p className="err">{state.errors.notifyEmail}</p>}
          </div>

          <div className="list">
            <label className="row">
              <div className="row-main">
                <div className="row-t">A new order is placed</div>
                <div className="row-s">Before payment is confirmed</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="notifyOnOrder" value="true"
                       defaultChecked={values.notifyOnOrder} aria-label="Alert on new order" />
                <i />
              </span>
            </label>
            <label className="row">
              <div className="row-main">
                <div className="row-t">A payment is verified</div>
                <div className="row-s">Money actually arrived</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="notifyOnPaid" value="true"
                       defaultChecked={values.notifyOnPaid} aria-label="Alert on verified payment" />
                <i />
              </span>
            </label>
            <label className="row">
              <div className="row-main">
                <div className="row-t">An enquiry arrives</div>
                <div className="row-s">Contact form and booking briefs</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="notifyOnEnquiry" value="true"
                       defaultChecked={values.notifyOnEnquiry} aria-label="Alert on enquiry" />
                <i />
              </span>
            </label>
          </div>
        </div>

        {/* ---------- Look ---------- */}
        <div>
          <div className="sec"><h3>The public site</h3></div>
          <div className="list">
            <label className="row">
              <div className="row-main">
                <div className="row-t">Cursor light</div>
                <div className="row-s">The glow that follows the pointer on desktop</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="pointerSheen" value="true"
                       defaultChecked={values.pointerSheen} aria-label="Cursor light" />
                <i />
              </span>
            </label>
          </div>
        </div>

        <button type="submit" className="btn btn-full" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>

        <p className="note">
          <b>Nothing secret is here.</b> The payment credentials, storage keys and email key
          live in server environment variables — set once in the hosting dashboard, never
          rendered into a browser and never editable from one.
        </p>
      </form>
    </>
  );
}
