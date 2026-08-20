'use client';

import { useState, useTransition } from 'react';
import { sendTestNotification, type NotifyTest } from './actions';

/**
 * Sends a real alert to the configured address.
 *
 * A test that only inspected configuration would prove nothing — a wrong key,
 * an unverified sending domain and a provider rejection all look identical
 * until a message is actually attempted.
 */
export function NotifyCheck() {
  const [busy, start] = useTransition();
  const [res, setRes] = useState<NotifyTest | null>(null);

  return (
    <div style={{ marginTop: '.9rem' }}>
      <button
        type="button" className="btn b-gh b-sm" disabled={busy}
        onClick={() => start(async () => setRes(await sendTestNotification()))}
      >
        {busy ? 'Sending…' : 'Send a test alert'}
      </button>

      {res?.ok ? <div className="ok-box">{res.message}</div> : null}
      {res && !res.ok ? (
        <div className="err-box">
          <b>{res.problem}</b>
          <div style={{ marginTop: '.4rem', color: 'var(--muted)' }}>{res.fix}</div>
        </div>
      ) : null}
    </div>
  );
}
