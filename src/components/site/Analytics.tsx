'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Sends one page view per navigation.
 *
 * Rules it follows so it can never be the reason a page feels slow or breaks:
 *
 *   · keepalive, so a view still arrives if the visitor navigates away
 *     immediately — without holding the page open.
 *   · Fired after paint, never during render.
 *   · Every failure is swallowed. A tracker that throws is worse than a
 *     tracker that misses a count.
 *   · A ref guards against React 18 double-effects and repeat renders on the
 *     same path, which would otherwise count one visit twice.
 */
export function Analytics() {
  const pathname = usePathname();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || sent.current === pathname) return;
    sent.current = pathname;

    const id = window.setTimeout(() => {
      try {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: pathname, referrer: document.referrer || null }),
          keepalive: true,
          cache: 'no-store',
        }).catch(() => {});
      } catch {
        /* never surface */
      }
    }, 0);

    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}
