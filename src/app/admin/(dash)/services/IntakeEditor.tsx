'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { INTAKE_FIELDS } from '@/lib/service-intake';
import type { PriceResult } from './actions';

/**
 * What this service refuses to be ordered without.
 *
 * Tickboxes over free text on purpose: each key has a label, a placeholder and
 * validation already written for it, and a field typed in here would have none
 * of that — it would render as an unlabelled box that accepts anything, which
 * is worse than not asking at all.
 *
 * Saving is explicit rather than on-change. Ticking a box changes what every
 * future customer is forced to supply, and a stray click on a phone should not
 * quietly do that.
 */
export function IntakeEditor({
  serviceId, serviceTitle, initial, action,
}: {
  serviceId: string;
  serviceTitle: string;
  initial: string[];
  action: (id: string, fd: FormData) => Promise<PriceResult>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<string[]>(initial);
  const [picked, setPicked] = useState<string[]>(initial);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = [...picked].sort().join(',') !== [...saved].sort().join(',');

  function toggle(key: string) {
    setMsg(null);
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  function save() {
    const next = picked;
    start(async () => {
      const fd = new FormData();
      for (const k of next) fd.set(`f:${k}`, 'on');
      const res = await action(serviceId, fd);
      if (res.ok) {
        setSaved(next);
        setMsg({ ok: true, text: res.message });
        router.refresh();
      } else {
        setPicked(saved);
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="intake">
      <div className="sec-hd" style={{ marginBottom: '.7rem' }}>
        <h3 style={{ margin: 0, fontSize: '.82rem' }}>Required before ordering</h3>
        <span className={`chip ${picked.length ? 'ok' : 'warn'}`}>
          {picked.length ? `${picked.length} asked for` : 'Nothing asked for'}
        </span>
        <span className="sp" />
        {dirty ? (
          <>
            <button type="button" className="btn b-gh b-sm" disabled={busy}
              onClick={() => { setPicked(saved); setMsg(null); }}>
              Cancel
            </button>
            <button type="button" className="btn b-red b-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : null}
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      <div className="intake-grid">
        {Object.values(INTAKE_FIELDS).map((f) => {
          const on = picked.includes(f.key);
          return (
            <label className={`intake-opt${on ? ' on' : ''}`} key={f.key}>
              <input
                type="checkbox" checked={on} disabled={busy}
                onChange={() => toggle(f.key)}
                aria-label={`${f.label} — required for ${serviceTitle}`}
              />
              <span>
                <span className="io-t">{f.label}</span>
                <span className="sub">{f.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      {!picked.length ? (
        <div className="hint" style={{ marginTop: '.7rem' }}>
          Nothing is required, so this can be ordered with no brief at all — and you will be
          chasing the files afterwards.
        </div>
      ) : null}
    </div>
  );
}
