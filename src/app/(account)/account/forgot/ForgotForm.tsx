'use client';

import { useActionState } from 'react';
import { forgotAction } from '../actions';
import { initialFormState } from '../form-state';
import { Field, Submit, Banner } from '@/components/account/Field';

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, initialFormState);
  const v = state.values ?? {};
  const err = state.errors ?? {};

  // Success is terminal on purpose: re-showing the form invites a second
  // submit, and each one invalidates the link the first one sent.
  if (state.ok && state.step === 'sent') {
    return (
      <>
        <Banner kind="good">{state.message}</Banner>
        <p style={{ fontSize: '.8rem', color: 'var(--dim)', lineHeight: 1.65 }}>
          Check spam if it has not arrived in a minute. The link expires in 30 minutes and
          stops working as soon as it is used once.
        </p>
      </>
    );
  }

  return (
    <form action={action} noValidate>
      <Field
        label="Email" name="email" type="email" required
        autoComplete="email" inputMode="email"
        defaultValue={v.email} error={err.email} disabled={pending}
      />
      <div style={{ marginTop: '1.4rem' }}>
        <Submit pending={pending}>{pending ? 'Sending…' : 'Send reset link'}</Submit>
      </div>
    </form>
  );
}
