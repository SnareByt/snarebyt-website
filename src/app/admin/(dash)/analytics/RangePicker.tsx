'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

const PRESETS = [
  { key: '24h', label: '24 hours' },
  { key: '3d', label: '3 days' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Range selection lives in the URL, not in component state, so a particular
 * view can be bookmarked or reloaded and come back the same.
 */
export function RangePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get('range') ?? '7d';
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(active === 'custom');
  const [from, setFrom] = useState(params.get('from') ?? iso(new Date(Date.now() - 14 * 86_400_000)));
  const [to, setTo] = useState(params.get('to') ?? iso(new Date()));

  const go = (q: string) => start(() => router.push(`/admin/analytics?${q}`, { scroll: false }));

  return (
    <div className="range">
      <div className="seg">
        {PRESETS.map((p) => (
          <button
            key={p.key} type="button" disabled={pending}
            className={active === p.key ? 'on' : ''}
            onClick={() => { setCustom(false); go(`range=${p.key}`); }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button" className={active === 'custom' ? 'on' : ''}
          onClick={() => setCustom((c) => !c)}
        >
          Custom
        </button>
      </div>

      {custom ? (
        <div className="range-custom">
          <label>
            <span>From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="button" className="btn b-red b-sm" disabled={pending || !from || !to || from > to}
            onClick={() => go(`range=custom&from=${from}&to=${to}`)}
          >
            {pending ? 'Loading…' : 'Apply'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
