'use client';

import { useActionState, useState, useTransition } from 'react';
import { saveProfile, changePassword, signOutDevice, signOutEverywhere, type Result } from './actions';
import { logoutAction } from '../actions';
import { Field, PasswordField, PasswordStrength, Submit, Banner } from '@/components/account/Field';
import { relative } from '@/components/account/bits';

export function ProfileForm({
  name, artistName, phone, country, email,
}: {
  name: string; artistName: string; phone: string; country: string; email: string;
}) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveProfile, null);

  return (
    <form action={action} noValidate>
      {state && <Banner kind={state.ok ? 'good' : 'bad'}>{state.ok ? state.message : state.error}</Banner>}

      <Field label="Your name" name="name" required defaultValue={name} autoComplete="name" disabled={pending} />
      <Field label="Artist or producer name" name="artistName" defaultValue={artistName} autoComplete="nickname" disabled={pending} />
      <Field label="WhatsApp number" name="phone" type="tel" defaultValue={phone} autoComplete="tel" inputMode="tel" disabled={pending} />
      <Field label="Country" name="country" defaultValue={country} autoComplete="country-name" disabled={pending} />

      {/* Shown, not editable. Changing the address is its own verification
          flow — swapping it here would move every past order and licence to
          an address nobody has proven. */}
      <div style={{ marginTop: '.95rem', padding: '.85rem .95rem', borderRadius: 12,
        border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}>
        <div style={{ fontFamily: 'var(--font-archivo),sans-serif', fontWeight: 600, fontSize: '.6rem',
          letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--dim)' }}>Email</div>
        <div style={{ fontSize: '.88rem', marginTop: '.25rem', overflowWrap: 'anywhere' }}>{email}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: '.35rem', lineHeight: 1.55 }}>
          Your orders and licences are tied to this address. Message SnareByt to change it.
        </div>
      </div>

      <div style={{ marginTop: '1.3rem' }}>
        <Submit pending={pending} className="btn btn-red">
          {pending ? 'Saving…' : 'Save details'}
        </Submit>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<Result | null, FormData>(changePassword, null);
  const [pw, setPw] = useState('');

  return (
    <form action={action} noValidate>
      {state && <Banner kind={state.ok ? 'good' : 'bad'}>{state.ok ? state.message : state.error}</Banner>}

      <PasswordField
        label="Current password" name="current"
        autoComplete="current-password" disabled={pending}
      />
      <PasswordField
        label="New password" name="next"
        autoComplete="new-password" onChange={setPw} disabled={pending}
      />
      <PasswordStrength value={pw} />

      <div style={{ marginTop: '1.3rem' }}>
        <Submit pending={pending} className="btn btn-red">
          {pending ? 'Changing…' : 'Change password'}
        </Submit>
      </div>
      <p style={{ fontSize: '.74rem', color: 'var(--dim)', marginTop: '.8rem', lineHeight: 1.6 }}>
        Changing this signs out every other device and emails you a confirmation.
      </p>
    </form>
  );
}

export function DeviceList({
  devices,
}: {
  devices: { id: string; current: boolean; label: string; ip: string | null; lastSeenAt: string }[];
}) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);

  return (
    <>
      {msg && <Banner kind={msg.ok ? 'good' : 'bad'}>{msg.ok ? msg.message : msg.error}</Banner>}

      <div className="pt-list">
        {devices.map((d) => (
          <div key={d.id} className="pt-row">
            <div>
              <div className="t">
                {d.label}
                {d.current && <span className="pill ok">This device</span>}
              </div>
              <div className="s">
                Last used {relative(d.lastSeenAt)}
                {d.ip ? ` · ${d.ip}` : ''}
              </div>
            </div>
            {!d.current && (
              <div className="r">
                <button
                  type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => start(async () => setMsg(await signOutDevice(d.id)))}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {devices.length > 1 && (
        <button
          type="button" className="btn btn-ghost btn-sm" disabled={busy}
          style={{ marginTop: '1rem' }}
          onClick={() => start(async () => setMsg(await signOutEverywhere()))}
        >
          {busy ? 'Working…' : 'Sign out everywhere else'}
        </button>
      )}

      <p style={{ fontSize: '.74rem', color: 'var(--dim)', marginTop: '1rem', lineHeight: 1.6 }}>
        Do not recognise one of these? Sign it out, then change your password.
      </p>
    </>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="btn btn-ghost btn-sm">Sign out</button>
    </form>
  );
}
