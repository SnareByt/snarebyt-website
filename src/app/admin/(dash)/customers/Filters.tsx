'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

/**
 * Search and filter, held in the URL.
 *
 * In the URL rather than in component state so a filtered view can be
 * bookmarked, reloaded and sent to someone. It also means the back button
 * does what it looks like it does.
 *
 * The search debounces at 300ms — long enough that typing an email is one
 * query rather than twenty, short enough that it still feels live.
 */
const FILTERS = [
  { v: 'all', l: 'All' },
  { v: 'active', l: 'Verified' },
  { v: 'unverified', l: 'Unverified' },
  { v: 'suspended', l: 'Suspended' },
];

export function ArtistFilters({ q, filter }: { q: string; filter: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [, start] = useTransition();

  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text.trim()) next.set('q', text.trim());
      else next.delete('q');
      start(() => router.replace(`/admin/customers?${next.toString()}`));
    }, 300);
    return () => clearTimeout(t);
  }, [text, q, params, router]);

  function setFilter(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === 'all') next.delete('filter');
    else next.set('filter', v);
    start(() => router.replace(`/admin/customers?${next.toString()}`));
  }

  return (
    <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        className="in"
        style={{ maxWidth: 320 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search name, artist name, email or phone…"
        aria-label="Search artists"
        type="search"
      />
      <div className="seg">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            type="button"
            className={filter === f.v ? 'on' : ''}
            onClick={() => setFilter(f.v)}
          >
            {f.l}
          </button>
        ))}
      </div>
    </div>
  );
}
