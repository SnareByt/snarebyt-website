'use client';

import { useActionState, useState } from 'react';
import { resetAction } from '../../actions';
import { initialFormState } from '../../form-state';
import { PasswordField, PasswordStrength, Submit, Banner } from '@/components/account/Field';

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, initialFormState);
  const [pw, setPw] = useState('');
  const err = state.errors ?? {};

  return (
    <form action={action} noValidate>
      {state.message && <Banner kind="bad">{state.message}</Banner>}
      <input type="hidden" name="token" value={token} />

      <PasswordField
        label="New password" autoComplete="new-password"
        error={err.password} onChange={setPw} disabled={pending}
      />
      <PasswordStrength value={pw} />

      <div style={{ marginTop: '1.4rem' }}>
        <Submit pending={pending}>{pending ? 'Saving…' : 'Save new password'}</Submit>
      </div>
    </form>
  );
}
