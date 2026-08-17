'use client';

import { useEffect, useState, useTransition } from 'react';
import { getPulse, type Pulse } from './actions';

/**
 * The real-time panel.
 *
 * Polls every five seconds. Polling rather than a socket because Vercel's
 * serverless functions have no long-lived connection to hold one open, and a
 * five-second poll of two indexed COUNT queries is cheaper than the
 * infrastructure a socket would need.
 *
 * It pauses when the tab is hidden. A dashboard left open in a background tab
 * overnight would otherwise make thousands of pointless queries.
 */
export function LivePulse({ initial }: { initial: Pulse }) {
  const [pulse, setPulse] = useState(initial);
  const [, start] = useTransition();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (document.hidden) return;
      start(async () => {
        try {
          const next = await getPulse();
          if (alive) { setPulse(next); setStale(false); }
        } catch {
          if (alive) setStale(true);
        }
      });
    };

    const id = window.setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return (
    <div className="glass live-card">
      <div className="live-hd">
        <span className={pulse.live > 0 ? 'dot on' : 'dot'} aria-hidden="true" />
        <span className="lb">Right now</span>
        {stale ? <span className="chip warn">reconnecting</span> : null}
      </div>

      <div className="live-n">{pulse.live}</div>
      <div className="live-sub">
        {pulse.live === 1 ? 'person on the site' : 'people on the site'} · last 5 minutes
      </div>

      <div className="live-split">
        <div>
          <div className="live-k">{pulse.todayVisitors.toLocaleString('en-US')}</div>
          <div className="live-l">visitors today</div>
        </div>
        <div>
          <div className="live-k">{pulse.todayViews.toLocaleString('en-US')}</div>
          <div className="live-l">views today</div>
        </div>
      </div>

      <div className="live-feed">
        <div className="live-l" style={{ marginBottom: '.5rem' }}>Latest page views</div>
        {pulse.recent.length ? pulse.recent.map((r, i) => (
          <div className="feed-row" key={`${r.path}-${i}`}>
            <span className="feed-path">{r.path}</span>
            <span className="feed-meta">
              {r.country ? `${r.country} · ` : ''}{r.device ?? '—'} · {r.ago}
            </span>
          </div>
        )) : (
          <div className="feed-empty">Nothing yet. Views appear here within seconds.</div>
        )}
      </div>
    </div>
  );
}
