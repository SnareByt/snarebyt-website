'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { appLogin, beginFaceId, finishFaceId, type LoginState } from './actions';
import { Wordmark, useToast } from '@/components/app/Ui';
import { IcFaceId, IcLock } from '@/components/app/Icons';

const EMPTY: LoginState = { ok: false, attempt: 0 };

export function LoginForm({ next, hasPasskeys }: { next: string; hasPasskeys: boolean }) {
  const [state, action, pending] = useActionState(appLogin, EMPTY);
  const [faceBusy, setFaceBusy] = useState(false);
  /* Held in state so the code step can post it again without asking. The
     server re-verifies the password before it will look at the code, so it
     genuinely needs both — see signIn() in src/lib/auth.ts. */
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(!hasPasskeys);
  const router = useRouter();
  const toast = useToast();

  /**
   * The redirect happens here rather than with `redirect()` inside the action.
   *
   * A server-side redirect out of a `useActionState` action throws a control-
   * flow error that React surfaces before the cookie the action just set has
   * been committed by the browser — the app lands on the dashboard, the
   * middleware sees no cookie yet and bounces it straight back to this screen.
   * Navigating from the client after the action resolves means the Set-Cookie
   * header is already applied.
   */
  useEffect(() => {
    if (state.ok) router.replace(next);
  }, [state.ok, state.attempt, next, router]);

  async function faceId() {
    setFaceBusy(true);
    try {
      const challenge = await beginFaceId();
      if (!challenge.ok) {
        toast(challenge.error, 'bad');
        return;
      }
      // Raises the Face ID sheet. Throws if the user cancels or looks away.
      const assertion = await startAuthentication({ optionsJSON: challenge.options });
      const res = await finishFaceId(challenge.handle, assertion);
      if (!res.ok) {
        toast(res.error ?? 'Face ID sign-in failed.', 'bad');
        setShowPassword(true);
        return;
      }
      router.replace(next);
    } catch (err) {
      /* A cancelled Face ID prompt is not an error worth shouting about — the
         user chose to dismiss it. Anything else is. */
      const name = (err as { name?: string })?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        toast('Face ID is not available on this device. Use your password.', 'bad');
      }
      setShowPassword(true);
    } finally {
      setFaceBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-mark">
        <Wordmark />
      </div>

      <h1 className="display">
        {state.needsTotp ? 'One more step' : 'Your dashboard'}
      </h1>
      <p className="login-sub">
        {state.needsTotp
          ? 'Open your authenticator app and enter the current six-digit code.'
          : 'Private to SnareByt. There is no sign-up and no other account.'}
      </p>

      {/* Face ID first when a passkey is enrolled — it is the fast path and
          should not be buried under a form nobody wants to fill in. */}
      {hasPasskeys && !state.needsTotp && (
        <>
          <button type="button" className="faceid" onClick={faceId} disabled={faceBusy}>
            <IcFaceId />
            <span>{faceBusy ? 'Waiting for Face ID…' : 'Unlock with Face ID'}</span>
          </button>

          {!showPassword && (
            <button
              type="button"
              className="nav-btn"
              style={{ margin: '1.2rem auto 0', display: 'flex' }}
              onClick={() => setShowPassword(true)}
            >
              <IcLock />
              Use password instead
            </button>
          )}

          {showPassword && <div className="or">or</div>}
        </>
      )}

      {(showPassword || state.needsTotp) && (
        <form action={action}>
          {state.needsTotp ? (
            <>
              {/* The credentials are carried forward hidden so the second step
                  does not make him retype them — the server needs all three
                  together, since signIn() verifies the password again before
                  it will look at the code. */}
              <input type="hidden" name="email" value={state.email ?? ''} />
              <input type="hidden" name="password" value={password} />
              <div className="field">
                <label className="fl" htmlFor="totp">Authenticator code</label>
                <input
                  id="totp"
                  name="totp"
                  className="in totp-in"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="······"
                  autoFocus
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label className="fl" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="in"
                  autoComplete="username"
                  defaultValue={state.email ?? ''}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  required
                />
              </div>
              <div className="field">
                <label className="fl" htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="in"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {state.error && <p className="err" style={{ marginBottom: '.8rem' }}>{state.error}</p>}

          <button type="submit" className="btn btn-full" disabled={pending}>
            {pending ? 'Checking…' : state.needsTotp ? 'Verify' : 'Sign in'}
          </button>
        </form>
      )}

      <p className="hint" style={{ textAlign: 'center', marginTop: '1.6rem' }}>
        Five wrong attempts locks this account for fifteen minutes.
      </p>
    </div>
  );
}
