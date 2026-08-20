'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * The horizontal filter strip under a list's title.
 *
 * State lives in the URL rather than in React, which buys three things for
 * free: the back gesture returns to the previous filter instead of leaving the
 * screen, a filtered view can be linked to from elsewhere in the app (Today
 * links straight to `?filter=problem`), and a refresh keeps the view.
 */
export function Filter({
  options, active, basePath,
}: {
  options: readonly { key: string; label: string }[];
  active: string;
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="scroll-x" role="tablist" aria-label="Filter">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={o.key === active}
          className="chip-btn"
          data-on={o.key === active ? '1' : '0'}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            // "all" is the default, so it is left out of the URL entirely
            // rather than written as ?filter=all — a clean address for the
            // default view, and one fewer thing to keep in sync.
            if (o.key === 'all') next.delete('filter');
            else next.set('filter', o.key);
            const qs = next.toString();
            router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
