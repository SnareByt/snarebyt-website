'use client';

import { useState, useId } from 'react';

/**
 * The form controls the artist portal is built from.
 *
 * The floating label is CSS-only, driven by `:placeholder-shown`. That matters
 * more than it sounds: the field reports its own emptiness, so nothing has to
 * track value state to know where the label belongs. A controlled component
 * per input would be several hundred re-renders across a registration form for
 * an effect the browser already knows how to do.
 *
 * Which is why every input here carries `placeholder=" "` — a single space.
 * It is never seen, but without it `:placeholder-shown` never matches and the
 * label sits permanently on top of whatever is typed.
 */

export function Field({
  label, name, type = 'text', required, error, defaultValue, autoComplete,
  inputMode, hint, disabled, maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  hint?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <label className={`ff${error ? ' bad' : ''}`} htmlFor={id}>
      <input
        id={id}
        name={name}
        type={type}
        placeholder=" "
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-m` : undefined}
      />
      <span className="lbl">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      <span className="ff-msg" id={`${id}-m`}>
        <span>{error}</span>
      </span>
      {hint && !error ? <span className="hint-sm">{hint}</span> : null}
    </label>
  );
}

const EYE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_OFF = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

/**
 * A password field that can be read back.
 *
 * The reveal toggle is not a convenience, it is an error-prevention measure:
 * the alternative to letting someone check what they typed is a "confirm
 * password" box, which doubles the typing and catches only repeated mistakes.
 */
export function PasswordField({
  label = 'Password', name = 'password', error, autoComplete = 'current-password',
  onChange, disabled,
}: {
  label?: string;
  name?: string;
  error?: string;
  autoComplete?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);

  return (
    <label className={`ff ff-pw${error ? ' bad' : ''}`} htmlFor={id}>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        placeholder=" "
        required
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-m` : undefined}
      />
      <span className="lbl">{label}<span className="req"> *</span></span>
      <button
        type="button"
        className="ff-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? EYE_OFF : EYE}
      </button>
      <span className="ff-msg" id={`${id}-m`}><span>{error}</span></span>
    </label>
  );
}

/**
 * Live feedback on a new password.
 *
 * Deliberately shows every rule from the start rather than revealing them one
 * failure at a time. Being told "needs a number" only after submitting is what
 * makes people write Password1 — they are solving the error message, not
 * choosing a password.
 */
export function PasswordStrength({ value }: { value: string }) {
  const rules = [
    { label: '10+ characters', met: value.length >= 10 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'Lowercase letter', met: /[a-z]/.test(value) },
    { label: 'A number', met: /[0-9]/.test(value) },
  ];
  const score = rules.filter((r) => r.met).length;
  // Length beyond the minimum is worth more than another character class, so a
  // long passphrase reads as strong even though it may miss a rule.
  const bonus = value.length >= 16 ? 1 : 0;
  const level = value ? Math.min(4, score + bonus) : 0;

  return (
    <>
      <div className={`pw-meter s${level}`} aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <ul className="pw-rules">
        {rules.map((r) => (
          <li key={r.label} className={r.met ? 'met' : ''}>{r.label}</li>
        ))}
      </ul>
    </>
  );
}

/** Submit button that shows it is working and cannot be double-fired. */
export function Submit({
  children, pending, className = 'btn btn-red btn-full',
}: {
  children: React.ReactNode;
  pending: boolean;
  className?: string;
}) {
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Banner({
  kind, children,
}: {
  kind: 'bad' | 'good' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div className={`banner ${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      <i aria-hidden="true">{kind === 'bad' ? '!' : kind === 'good' ? '✓' : 'i'}</i>
      <span>{children}</span>
    </div>
  );
}
