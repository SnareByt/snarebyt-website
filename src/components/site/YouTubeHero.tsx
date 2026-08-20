'use client';

import { useState } from 'react';

/**
 * The video player on the home page.
 *
 * It does NOT embed YouTube until someone presses play. A YouTube iframe pulls
 * well over a megabyte of script before anyone has asked to watch anything, and
 * on a home page that costs every visitor — including the ones who scroll past.
 * Until then this is one poster image and a button, which is also why it can
 * carry the site's own framing rather than YouTube's chrome.
 *
 * Pressing play swaps in the real player with autoplay, so the click that
 * loads it is the same click that starts it.
 */
export function YouTubeHero({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="ythero">
      <span className="ythero-glow" aria-hidden="true" />

      <div className="ythero-frame">
        {playing ? (
          <iframe
            className="ythero-media"
            // nocookie: no tracking cookie is set unless the visitor actually watches.
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="ythero-poster"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ythero-thumb"
              src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
              // Not every video has a maxres still; fall back rather than
              // leaving a broken image where the artwork should be.
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1';
                  img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
                }
              }}
            />
            <span className="ythero-scrim" aria-hidden="true" />
            <span className="ythero-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
            <span className="ythero-tag" aria-hidden="true">Watch the video</span>
          </button>
        )}
      </div>
    </div>
  );
}
