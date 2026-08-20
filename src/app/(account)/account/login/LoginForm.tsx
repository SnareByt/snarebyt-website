'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions';
import { initialFormState } from '../form-state';
import { Field, PasswordField, Submit, Banner } from '@/components/account/Field';

export function LoginForm({ next, justReset }: { next: string; justReset: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  const v = state.values ?? {};

  return (
    <form action={action} noValidate>
      {justReset && !state.message && (
        <Banner kind="good">Password changed. Sign in with the new one.</Banner>
      )}
      {state.message && <Banner kind="bad">{state.message}</Banner>}

      {/* Carried through the form rather than read from the URL on the server,
          so a sign-in that fails and retries keeps the destination. */}
      <input type="hidden" name="next" value={next} />

      <Field
        label="Email" name="email" type="email" required
        autoComplete="email" inputMode="email"
        defaultValue={v.email} disabled={pending}
      />
      <PasswordField autoComplete="current-password" disabled={pending} />

      <div style={{ marginTop: '1.4rem' }}>
        <Submit pending={pending}>{pending ? 'Signing in…' : 'Sign in →'}</Submit>
      </div>
    </form>
  );
}
