'use client';

import { useActionState } from 'react';
import { saveSettings, type SettingsState } from './actions';

const initial: SettingsState = { ok: false };

export function SettingsForm({
  usdRate, whatsapp, businessEmail, youtubeChannel,
}: { usdRate: string; whatsapp: string; businessEmail: string; youtubeChannel: string }) {
  const [state, action, pending] = useActionState(saveSettings, initial);
  const e = state.errors ?? {};

  return (
    <form action={action} className="card" style={{ padding: '1.4rem', maxWidth: 560 }}>
      {state.ok ? <div className="chip ok" style={{ marginBottom: '1rem' }}>{state.message}</div> : null}

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
      </div>

      <button className="btn b-red" type="submit" style={{ marginTop: '1.4rem' }} disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
