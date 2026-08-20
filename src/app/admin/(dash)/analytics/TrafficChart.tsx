'use client';

import { useMemo, useState, useId } from 'react';
import type { Point } from '@/lib/analytics';
import { Figure } from '@/components/admin/Figure';

/**
 * The traffic chart.
 *
 * Flat SVG, not an isometric scene. The 3D version this replaces had two
 * problems that no amount of tuning fixes: rotating the stage puts every
 * column on a different visual baseline, so comparing a short bar behind a
 * tall one means comparing two different scales — and the tooltip, anchored
 * above a bar that had been transformed in 3D, left the card and got clipped.
 *
 * So the readout moved into the header. It cannot run off an edge, it reads
 * the same under a thumb as under a cursor, and the hovered figure sits
 * beside the words naming it instead of floating over the plot.
 *
 * SVG with a viewBox rather than divs: one element scales to any width
 * without a resize listener, and the bars stay crisp.
 */

const NUM = (n: number) => n.toLocaleString('en-US');

export function TrafficChart({
  points, bucket, totalViews, totalVisitors,
}: {
  points: Point[];
  bucket: 'hour' | 'day';
  totalViews: number;
  totalVisitors: number;
}) {
  const [metric, setMetric] = useState<'views' | 'visitors'>('visitors');
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');

  const values = useMemo(
    () => points.map((p) => (metric === 'views' ? p.views : p.visitors)),
    [points, metric],
  );
  const max = useMemo(() => Math.max(1, ...values), [values]);

  // A fixed coordinate system. The SVG scales to the card; these never change,
  // so gridlines and labels cannot drift apart at an awkward width.
  const W = 1000;
  const H = 300;
  const PAD_L = 46;
  const PAD_B = 26;
  const PAD_T = 8;
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;

  const slot = plotW / Math.max(1, points.length);
  // Bars keep a gap until they get too thin for one, at which point the gap
  // costs more legibility than it adds.
  const gap = slot > 8 ? Math.min(6, slot * 0.22) : 0;
  const barW = Math.max(1, slot - gap);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  const fmtFull = (iso: string) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${d.toISOString().slice(5, 10)} · ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
      : d.toISOString().slice(0, 10);
  };
  const fmtShort = (iso: string) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
      : d.toISOString().slice(5, 10);
  };

  // Roughly a label every 90px of real estate, never more than there are bars.
  const every = Math.max(1, Math.ceil(points.length / 11));

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="glass chart-card">
      <div className="chart-hd">
        <div style={{ minWidth: 0 }}>
          <div className="lb">Traffic</div>
          <div className="readout">
            {active ? (
              <>
                <Figure className="readout-n" value={metric === 'views' ? active.views : active.visitors} />
                <span className="readout-u">{metric}</span>
                <span className="readout-t">
                  {fmtFull(active.t)} · {NUM(active.views)} views · {NUM(active.visitors)} visitors
                </span>
              </>
            ) : (
              <>
                <Figure className="readout-n" value={metric === 'views' ? totalViews : totalVisitors} />
                <span className="readout-u">{metric}</span>
                <span className="readout-t">
                  across {points.length} {bucket === 'hour' ? 'hours' : 'days'} · peak {NUM(max)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="chart-ctl">
          <div className="seg">
            <button type="button" className={metric === 'visitors' ? 'on' : ''}
              onClick={() => setMetric('visitors')}>Visitors</button>
            <button type="button" className={metric === 'views' ? 'on' : ''}
              onClick={() => setMetric('views')}>Views</button>
          </div>
        </div>
      </div>

      <div
        className="chart-plot"
        data-hover={hover !== null ? '1' : undefined}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Traffic by ${bucket}. Peak ${max} ${metric}.`}>
          <defs>
            <linearGradient id={`barfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF3B57" />
              <stop offset="55%" stopColor="#E01B36" />
              <stop offset="100%" stopColor="#8A0F20" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => {
            const y = PAD_T + plotH - (i / (ticks.length - 1)) * plotH;
            return (
              <g key={t + '-' + i}>
                <line className="gridline" x1={PAD_L} y1={y} x2={W} y2={y} />
                <text className="axis-t" x={PAD_L - 10} y={y + 3} textAnchor="end">{NUM(t)}</text>
              </g>
            );
          })}

          {points.map((p, i) => {
            const v = values[i];
            // A non-zero value always draws something. A bar one pixel high is
            // still the difference between "one visitor" and "nobody".
            const h = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
            const x = PAD_L + i * slot + gap / 2;
            const y = PAD_T + plotH - h;
            const on = hover === i;
            return (
              <g key={p.t}>
                {v > 0 && (
                  <rect
                    className={`cbar${on ? ' on' : ''}`}
                    x={x} y={y} width={barW} height={h}
                    rx={Math.min(3, barW / 2)}
                    fill={`url(#barfill-${uid})`}
                  />
                )}
                {on && <line className="cmark" x1={x + barW / 2} y1={PAD_T} x2={x + barW / 2} y2={PAD_T + plotH} />}
              </g>
            );
          })}

          {points.map((p, i) =>
            i % every === 0 ? (
              <text key={p.t} className="axis-x" x={PAD_L + i * slot + slot / 2} y={H - 8}>
                {fmtShort(p.t)}
              </text>
            ) : null,
          )}
        </svg>

        {/* Hit targets are real HTML buttons laid over the plot rather than
            <rect tabIndex> inside it: a button is focusable and operable by
            default, gets the focus ring for free, and needs no ARIA role to
            say what it is.

            Each spans a full column, so a 3px bar on a 90-day range is still
            comfortably reachable with a mouse or a thumb. */}
        <div
          className="chit-row"
          style={{
            left: `${(PAD_L / W) * 100}%`,
            top: `${(PAD_T / H) * 100}%`,
            height: `${(plotH / H) * 100}%`,
          }}
        >
          {points.map((p, i) => (
            <button
              key={p.t}
              type="button"
              className="chit"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${fmtFull(p.t)}: ${NUM(p.views)} views, ${NUM(p.visitors)} visitors`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
