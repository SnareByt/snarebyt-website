'use client';

import { useActionState, useEffect } from 'react';
import { saveSettings, type SettingsState } from '@/app/admin/(dash)/settings/actions';
import { useToast } from '@/components/app/Ui';

type Values = {
  usdRate: string; whatsapp: string; businessEmail: string; youtubeChannel: string;
  notifyEmail: string; beatsComingSoon: boolean; notifyOnOrder: boolean;
  notifyOnPaid: boolean; notifyOnEnquiry: boolean; pointerSheen: boolean;
};

const EMPTY: SettingsState = { ok: false };

export function SettingsForm({ values }: { values: Values }) {
  const [state, action, pending] = useActionState(saveSettings, EMPTY);
  const toast = useToast();

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
