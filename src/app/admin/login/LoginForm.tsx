'use client';

import { useActionState, useState } from 'react';
import { login, createFirstPassword, type LoginState, type SetupState } from './actions';

const loginInit: LoginState = { attempt: 0 };
const setupInit: SetupState = { attempt: 0 };

export function LoginForm({ defaultEmail, justCreated }: { defaultEmail: string; justCreated: boolean }) {
  const [state, action, pending] = useActionState(login, loginInit);
  // signIn re-checks the password alongside the code, so the second step has to
  // resubmit it. Held in component state rather than echoed back from the
  // server, so the password only ever travels from this browser outward.
  const [password, setPassword] = useState('');

  // Once the password has been accepted the form asks only for the code, so
  // there is no chance of retyping the password into a half-completed sign-in.
  if (state.needsTotp) {
    return (
      <form action={action} className="login-box">
        <div className="eyebrow">Two-factor</div>
        <h1>Enter your code</h1>
        <p className="login-sub">
          Open your authenticator app and type the six digits for SnareByt. The code changes every
          30 seconds.
        </p>
        {state.error ? <div className="err-box">{state.error}</div> : null}

        <input type="hidden" name="email" value={state.email ?? ''} />
        <input type="hidden" name="password" value={password} />

        <label className="fl" htmlFor="totp">Six-digit code</label>
        <input
          className="in totp-in" id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code"
          maxLength={6} pattern="[0-9]{6}" placeholder="000000" autoFocus required
        />

        <button className="btn b-red b-full" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Verify →'}
        </button>
        <p className="login-note">
          Lost your phone? The secret you saved when enabling 2FA can be re-entered in any
          authenticator app.
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="login-box">
      <div className="eyebrow">Admin access</div>
      <h1>Sign in</h1>
      <p className="login-sub">The dashboard for SnareByt. This page is not linked from the public site.</p>

      {justCreated ? <div className="ok-box">Password set. Sign in with it now.</div> : null}
      {state.error ? <div className="err-box">{state.error}</div> : null}

      <label className="fl" htmlFor="email">Email</label>
      <input
        className="in" id="email" name="email" type="email" autoComplete="username"
        defaultValue={state.email ?? defaultEmail} required
      />

      <label className="fl" htmlFor="password">Password</label>
      <input
        className="in" id="password" name="password" type="password"
        autoComplete="current-password" required
        value={password} onChange={(e) => setPassword(e.target.value)}
      />

      <button className="btn b-red b-full" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in →'}
      </button>

      <p className="login-note">
        Five wrong attempts locks the account for fifteen minutes. That is deliberate.
      </p>
    </form>
  );
}

/** Shown only while the admin account has no password at all. */
export function FirstRunForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(createFirstPassword, setupInit);

  return (
    <form action={action} className="login-box">
      <div className="eyebrow">First run</div>
      <h1>Choose your password</h1>
      <p className="login-sub">
        No password exists for <strong>{email}</strong> yet. Set one now — this screen is only
        reachable once, and never again after.
      </p>

      {state.error ? <div className="err-box">{state.error}</div> : null}

      <label className="fl" htmlFor="password">New password</label>
      <input className="in" id="password" name="password" type="password" autoComplete="new-password" required />

      {/* id must not be "confirm": admin.css styles #confirm as a full-screen
          modal overlay, which made this field invisible, and Chrome silently
          refuses to submit a form containing a required field it cannot focus.
          The name stays "confirm" — only the id collided. */}
      <label className="fl" htmlFor="confirmPw">Repeat it</label>
      <input className="in" id="confirmPw" name="confirm" type="password" autoComplete="new-password" required />

      <ul className="pw-rules">
        <li>At least 10 characters</li>
        <li>One uppercase and one lowercase letter</li>
        <li>At least one number</li>
      </ul>

      <button className="btn b-red b-full" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Set password →'}
      </button>

      <p className="login-note">
        Checked on the server, not just here. Use something you have not used anywhere else — this
        is the key to your catalogue and your orders.
      </p>
    </form>
  );
}
