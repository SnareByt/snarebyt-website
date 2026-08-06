'use client';

import { useActionState } from 'react';
import {
  changePassword, beginTotp, confirmTotp, disableTotp,
  type PwState, type TotpState,
} from './actions';

const pwInit: PwState = { ok: false, attempt: 0 };
const totpInit: TotpState = { ok: false, attempt: 0 };

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, pwInit);

  return (
    <form action={action} className="card" style={{ padding: '1.4rem', maxWidth: 460 }}>
      {state.ok ? <div className="ok-box">{state.message}</div> : null}
      {state.error ? <div className="err-box">{state.error}</div> : null}

      <div className="fg" style={{ marginTop: state.ok || state.error ? '1rem' : 0 }}>
        <label className="fl" htmlFor="current">Current password</label>
        <input className="in" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="fg" style={{ marginTop: '1rem' }}>
        <label className="fl" htmlFor="next">New password</label>
        <input className="in" id="next" name="next" type="password" autoComplete="new-password" required />
      </div>
      <div className="fg" style={{ marginTop: '1rem' }}>
        <label className="fl" htmlFor="confirm">Repeat new password</label>
        <input className="in" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      <ul className="pw-rules">
        <li>At least 10 characters</li>
        <li>One uppercase and one lowercase letter</li>
        <li>At least one number</li>
      </ul>

      <button className="btn b-red" type="submit" style={{ marginTop: '1.3rem' }} disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </button>
      <div className="hint" style={{ marginTop: '.7rem' }}>
        Changing this signs out every other device, including this one.
      </div>
    </form>
  );
}

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [begin, beginAction, beginning] = useActionState(beginTotp, totpInit);
  const [confirm, confirmAction, confirming] = useActionState(confirmTotp, totpInit);
  const [off, offAction, disabling] = useActionState(disableTotp, totpInit);

  /* ---- already on ---- */
  if (enabled && !off.ok) {
    return (
      <div className="card" style={{ padding: '1.4rem', maxWidth: 460 }}>
        <span className="chip ok">Two-factor is on</span>
        <p className="sub" style={{ margin: '1rem 0' }}>
          Every sign-in asks for a six-digit code from your authenticator app as well as your
          password.
        </p>
        {off.error ? <div className="err-box">{off.error}</div> : null}
        <form action={offAction}>
          <label className="fl" htmlFor="offToken">Current code, to switch it off</label>
          <input className="in totp-in" id="offToken" name="token" inputMode="numeric"
            maxLength={6} pattern="[0-9]{6}" placeholder="000000" required />
          <button className="btn b-gh" type="submit" style={{ marginTop: '1rem' }} disabled={disabling}>
            {disabling ? 'Checking…' : 'Turn off two-factor'}
          </button>
        </form>
      </div>
    );
  }

  /* ---- just turned on or off ---- */
  if (confirm.ok || off.ok) {
    return (
      <div className="card" style={{ padding: '1.4rem', maxWidth: 460 }}>
        <div className="ok-box">{confirm.ok ? confirm.message : off.message}</div>
      </div>
    );
  }

  /* ---- mid-setup: secret issued, waiting for a code ---- */
  const active = confirm.secret ?? begin.secret;
  const qr = confirm.qr ?? begin.qr;

  if (active) {
    return (
      <div className="card" style={{ padding: '1.4rem', maxWidth: 460 }}>
        <div className="eyebrow">Step 1 — scan</div>
        <p className="sub" style={{ margin: '.7rem 0 1rem' }}>
          Open Google Authenticator, tap +, then <b>Scan a QR code</b>.
        </p>
        {qr ? <div className="qr-box" dangerouslySetInnerHTML={{ __html: qr }} /> : null}

        <div className="eyebrow" style={{ marginTop: '1.4rem' }}>Can&apos;t scan?</div>
        <p className="sub" style={{ margin: '.5rem 0' }}>
          Choose <b>Enter a setup key</b> and type this. Account name: SnareByt.
        </p>
        <code className="mono secret-key">{active}</code>
        <div className="hint" style={{ marginTop: '.6rem' }}>
          <b>Save this somewhere offline.</b> If you lose your phone it is the only way back in.
        </div>

        <div className="eyebrow" style={{ marginTop: '1.4rem' }}>Step 2 — confirm</div>
        {confirm.error ? <div className="err-box">{confirm.error}</div> : null}
        <form action={confirmAction}>
          <input type="hidden" name="secret" value={active} />
          <label className="fl" htmlFor="token">Code from the app</label>
          <input className="in totp-in" id="token" name="token" inputMode="numeric"
            maxLength={6} pattern="[0-9]{6}" placeholder="000000" autoFocus required />
          <button className="btn b-red" type="submit" style={{ marginTop: '1rem' }} disabled={confirming}>
            {confirming ? 'Checking…' : 'Turn on two-factor'}
          </button>
        </form>
        <div className="hint" style={{ marginTop: '.7rem' }}>
          Nothing is saved until a working code proves the app is set up — so a half-finished
          setup can never lock you out.
        </div>
      </div>
    );
  }

  /* ---- not started ---- */
  return (
    <form action={beginAction} className="card" style={{ padding: '1.4rem', maxWidth: 460 }}>
      <span className="chip warn">Two-factor is off</span>
      <p className="sub" style={{ margin: '1rem 0' }}>
        With it on, someone who steals your password still cannot get in without your phone. Works
        with Google Authenticator, Authy and 1Password.
      </p>
      <button className="btn b-red" type="submit" disabled={beginning}>
        {beginning ? 'Preparing…' : 'Set up two-factor'}
      </button>
    </form>
  );
}
