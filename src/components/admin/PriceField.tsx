'use client';

import { useState, useTransition } from 'react';

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * An inline, save-on-demand price box.
 *
 * Deliberately not a form that saves on blur: a price is money, and a stray
 * click should never commit one. Save only appears once the number differs
 * from what is stored, so the row stays quiet until there is something to do.
 *
 * The field is `inputMode="numeric"` rather than `type="number"` so a stray
 * scroll over the box cannot silently change a price — a real hazard on long
 * catalogue pages.
 */
export function PriceField({
  id, initial, action, prefix = '৳', step, label,
}: {
  id: string;
  initial: number;
  action: (id: string, fd: FormData) => Promise<Result>;
  prefix?: string;
  /** Field name sent to the action. */
  step: 'priceBdt' | 'basePriceBdt' | 'multiplier';
  label: string;
}) {
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState(initial);
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  const dirty = value.trim() !== String(saved);

  const submit = () => {
    setRes(null);
    start(async () => {
      const fd = new FormData();
      fd.set(step, value.trim());
      const r = await action(id, fd);
      setRes(r);
      if (r.ok) setSaved(Number(value.trim()));
    });
  };

  return (
    <div className="pricefield">
      <div className="pf-row">
        <span className="pf-prefix" aria-hidden="true">{prefix}</span>
        <input
          className="in pf-in"
          value={value}
          inputMode="numeric"
          aria-label={label}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) { e.preventDefault(); submit(); } }}
        />
        {dirty ? (
          <>
            <button type="button" className="btn b-red b-sm" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button" className="btn b-gh b-sm" disabled={busy}
              onClick={() => { setValue(String(saved)); setRes(null); }}
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {res && !res.ok ? <div className="pf-err">{res.error}</div> : null}
      {res?.ok && !dirty ? <div className="pf-ok">{res.message}</div> : null}
    </div>
  );
}

/** Publish / hide toggle that reports refusals instead of silently doing nothing. */
export function ToggleButton({
  id, action, on, onLabel, offLabel, disabled, disabledReason,
}: {
  id: string;
  action: (id: string) => Promise<Result>;
  on: boolean;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  if (disabled) return <span className="sub">{disabledReason}</span>;

  return (
    <div>
      <button
        type="button"
        className={on ? 'btn b-gh b-sm' : 'btn b-red b-sm'}
        disabled={busy}
        onClick={() => { setRes(null); start(async () => setRes(await action(id))); }}
      >
        {busy ? '…' : on ? onLabel : offLabel}
      </button>
      {res && !res.ok ? <div className="pf-err">{res.error}</div> : null}
    </div>
  );
}
