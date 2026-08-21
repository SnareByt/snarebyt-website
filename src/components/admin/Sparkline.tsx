/**
 * Fourteen days of one number, drawn small.
 *
 * Server-rendered SVG with no library and no client JavaScript: it is a
 * polyline over a fill, and the shape is known at render time. A charting
 * dependency for this would ship more code than the whole dashboard.
 *
 * The y-scale starts at zero rather than at the minimum. A sparkline zoomed to
 * its own range turns ৳4,900 → ৳5,000 into a cliff, which is the classic way a
 * small chart lies about a flat week.
 */
export function Sparkline({
  points, label, tone = 'red',
}: {
  points: number[];
  label: string;
  tone?: 'red' | 'plain';
}) {
  const w = 300;
  const h = 64;
  const pad = 3;

  // One point cannot make a line, and an all-zero series has no height to
  // scale against — both render as a flat baseline rather than dividing by
  // zero or drawing nothing at all.
  const data = points.length >= 2 ? points : [0, ...points, 0].slice(0, 2);
  const max = Math.max(...data, 1);
  const step = (w - pad * 2) / (data.length - 1);

  const xy = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = `M${xy.join(' L')}`;
  const area = `${line} L${(pad + (data.length - 1) * step).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const last = xy[xy.length - 1].split(',');

  const stroke = tone === 'red' ? 'var(--red-b)' : 'var(--muted)';
  const id = `spark-${label.replace(/\W+/g, '')}-${tone}`;

  return (
    <svg
      className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      role="img" aria-label={`${label}: ${data.length} day trend`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* The most recent day, marked — it is the one being asked about. */}
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
