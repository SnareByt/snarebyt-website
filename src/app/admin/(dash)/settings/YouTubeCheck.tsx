'use client';

import { useState, useTransition } from 'react';
import { testYouTube, type YtCheck } from './actions';

/**
 * "Test connection" for the YouTube strip.
 *
 * The home page section hides itself when anything is wrong, which is right
 * for visitors and useless for whoever has to fix it. This says which of the
 * three real causes it is, in words that map to a button in Google Cloud.
 */
export function YouTubeCheck() {
  const [busy, start] = useTransition();
  const [res, setRes] = useState<YtCheck | null>(null);

  return (
    <div style={{ marginTop: '.9rem' }}>
      <button
        type="button" className="btn b-gh b-sm" disabled={busy}
        onClick={() => start(async () => setRes(await testYouTube()))}
      >
        {busy ? 'Checking…' : 'Test YouTube connection'}
      </button>

      {res?.ok ? (
        <div className="ok-box">
          <b>Connected.</b> {res.title} — {res.subscribers} subscribers, {res.views} total views,{' '}
          {res.videos} uploads. The strip is showing on the home page.
        </div>
      ) : null}

      {res && !res.ok ? (
        <div className="err-box">
          <b>{res.problem}</b>
          <div style={{ marginTop: '.4rem', color: 'var(--muted)' }}>{res.fix}</div>
        </div>
      ) : null}
    </div>
  );
}
