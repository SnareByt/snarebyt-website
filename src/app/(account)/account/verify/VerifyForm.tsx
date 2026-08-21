'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { verifyAction, resendAction } from '../actions';
import { initialFormState } from '../form-state';
import { OtpInput } from '@/components/account/OtpInput';
import { Banner } from '@/components/account/Field';

/**
 * Code entry.
 *
 * There is no submit button. The code is six digits with no ambiguity about
 * when it is finished, so the form submits itself on the sixth — a button here
 * would only ever be a second thing to do after the thing that was already
 * enough.
 *
 * Resending is rate-limited server-side, but the countdown exists so the limit
 * is visible before it is hit rather than as a refusal afterwards.
 */
export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const [cooldown, setCooldown] = useState(30);
  const [resent, setResent] = useState<string | null>(null);
  const [resending, startResend] = useTransition();

  // The action returns a fresh object on every submit, so comparing identity
  // catches a second rejection that carries the same wording as the first.
  const [rejections, setRejections] = useState(0);
  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    if (state.message) setRejections((n) => n + 1);
  }, [state]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function submit(code: string) {
    if (!codeRef.current || !formRef.current) return;
    codeRef.current.value = code;
    formRef.current.requestSubmit();
  }

  function resend() {
    setResent(null);
    startResend(async () => {
      const r = await resendAction();
      setResent(r.message);
      if (r.ok) setCooldown(30);
    });
  }

  return (
    <>
      {state.message && <Banner kind="bad">{state.message}</Banner>}
      {resent && !state.message && <Banner kind="good">{resent}</Banner>}

      <form action={action} ref={formRef}>
        <input type="hidden" name="code" ref={codeRef} />
        <OtpInput
          onComplete={submit}
          disabled={pending}
          invalid={Boolean(state.message)}
          resetKey={rejections}
        />
      </form>

      {pending && (
        <p style={{ textAlign: 'center', fontSize: '.78rem', color: 'var(--muted)', marginTop: '1rem' }}>
          Checking…
        </p>
      )}

      <div className="otp-meta">
        Nothing arrived? Check spam first.
        <br />
        <button type="button" onClick={resend} disabled={cooldown > 0 || resending}>
          {resending ? 'Sending…' : cooldown > 0 ? `Send another in ${cooldown}s` : 'Send another code'}
        </button>
      </div>
    </>
  );
}
