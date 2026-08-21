'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { registerAction } from '../actions';
import { initialFormState } from '../form-state';
import { Field, PasswordField, PasswordStrength, Submit, Banner } from '@/components/account/Field';

/**
 * Registration.
 *
 * useActionState keeps the typed values across a failed submit, which is the
 * difference between a form that corrects one field and one that makes you
 * start again. The password is deliberately not echoed back — it is stripped
 * server-side before the state comes home.
 *
 * Only name, email and password are required. Artist name, phone and country
 * are on the form because the licence PDF and the WhatsApp handover want them,
 * but asking for them is not the same as demanding them at the door.
 */
export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const [pw, setPw] = useState('');

  const v = state.values ?? {};
  const err = state.errors ?? {};

  return (
    <form action={action} noValidate>
      {state.message && <Banner kind="bad">{state.message}</Banner>}

      <Field
        label="Your name" name="name" required autoComplete="name"
        defaultValue={v.name} error={err.name} disabled={pending}
      />
      <Field
        label="Artist or producer name" name="artistName" autoComplete="nickname"
        defaultValue={v.artistName} error={err.artistName} disabled={pending}
      />
      <Field
        label="Email" name="email" type="email" required
        autoComplete="email" inputMode="email"
        defaultValue={v.email} error={err.email} disabled={pending}
      />
      <Field
        label="WhatsApp number" name="phone" type="tel" autoComplete="tel" inputMode="tel"
        defaultValue={v.phone} error={err.phone} disabled={pending}
      />
      <Field
        label="Country" name="country" autoComplete="country-name"
        defaultValue={v.country} error={err.country} disabled={pending}
      />

      <PasswordField
        label="Password" autoComplete="new-password"
        error={err.password} onChange={setPw} disabled={pending}
      />
      <PasswordStrength value={pw} />

      <label className="check" style={{ margin: '1.2rem 0 1.3rem' }}>
        <input type="checkbox" name="terms" disabled={pending} />
        <span>
          I accept the <Link href="/legal/terms" className="redt">terms</Link> and{' '}
          <Link href="/legal/privacy" className="redt">privacy policy</Link>.
          {err.terms && <span style={{ display: 'block', color: 'var(--red-bright)', marginTop: '.3rem' }}>{err.terms}</span>}
        </span>
      </label>

      <Submit pending={pending}>
        {pending ? 'Creating your account…' : 'Create account →'}
      </Submit>

      <p style={{ fontSize: '.74rem', color: 'var(--dim)', marginTop: '.9rem', lineHeight: 1.6 }}>
        We will email you a six-digit code to confirm the address. Anything you have already
        ordered with this email is attached to the account once it is confirmed.
      </p>
    </form>
  );
}
