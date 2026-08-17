import { getYouTubeStats, compact } from '@/lib/youtube';

/**
 * The live-numbers strip on the home page.
 *
 * Server component: the API key never reaches the browser, and when nothing
 * is configured — or YouTube is down — the whole section simply does not
 * exist. No skeleton, no zeroes, no invented figures. A stats strip showing
 * "0 subscribers" would be worse than no strip at all.
 */
export async function YouTubeStats() {
  const yt = await getYouTubeStats();
  if (!yt || yt.views <= 0) return null;

  const stats: { n: string; exact: string; label: string }[] = [];
  if (!yt.subscribersHidden && yt.subscribers > 0) {
    stats.push({
      n: compact(yt.subscribers),
      exact: yt.subscribers.toLocaleString('en-US'),
      label: 'Subscribers',
    });
  }
  stats.push({
    n: compact(yt.views),
    exact: yt.views.toLocaleString('en-US'),
    label: 'Total views',
  });
  if (yt.videos > 0) {
    stats.push({
      n: compact(yt.videos),
      exact: yt.videos.toLocaleString('en-US'),
      label: 'Uploads',
    });
  }

  return (
    <section className="blk yt-blk" aria-label="SnareByt on YouTube">
      <div className="wrap">
        <div className="yt-strip rv">
          <div className="yt-id">
            <span className="yt-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
              </svg>
            </span>
            <div>
              <div className="eyebrow">On YouTube</div>
              <a className="yt-name" href={yt.url} target="_blank" rel="noopener noreferrer">
                {yt.title || 'SnareByt'} ↗
              </a>
            </div>
          </div>

          <div className="yt-nums">
            {stats.map((s) => (
              <div className="yt-stat" key={s.label} title={s.exact}>
                <span className="yt-n">{s.n}</span>
                <span className="yt-l">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
