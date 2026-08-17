'use client';

import { useMemo, useState } from 'react';
import type { Point } from '@/lib/analytics';

/**
 * The traffic chart, drawn as real 3D geometry.
 *
 * Each column is a box built from three faces — front, top and side — placed
 * in a perspective scene with CSS transforms. No chart library: the CSP blocks
 * external scripts by design, and a bar chart does not justify a dependency.
 *
 * The tilt is adjustable and stored in component state rather than baked in,
 * because a fixed isometric angle makes short bars unreadable — being able to
 * flatten it to near-2D is what keeps it useful as well as good-looking.
 */
export function Chart3D({ points, bucket }: { points: Point[]; bucket: 'hour' | 'day' }) {
  const [metric, setMetric] = useState<'views' | 'visitors'>('visitors');
  const [tilt, setTilt] = useState(24);
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => (metric === 'views' ? p.views : p.visitors))),
    [points, metric],
  );

  // Depth shrinks as the columns get thinner, or a dense range turns into mush.
  const depth = points.length > 48 ? 6 : points.length > 24 ? 10 : 16;

  const label = (iso: string) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
      : d.toISOString().slice(5, 10);
  };

  const full = (iso: string) => {
    const d = new Date(iso);
    return bucket === 'hour'
      ? `${d.toISOString().slice(5, 10)} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
      : d.toISOString().slice(0, 10);
  };

  // Enough ticks to read the scale, never so many they crowd the axis.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const every = Math.max(1, Math.ceil(points.length / 12));

  return (
    <div className="glass chart-card">
      <div className="chart-hd">
        <div>
          <div className="lb">Traffic</div>
          <div className="chart-sub">
            {points.length} {bucket === 'hour' ? 'hours' : 'days'} · peak {max.toLocaleString('en-US')}{' '}
            {metric}
          </div>
        </div>
        <div className="chart-ctl">
          <div className="seg">
            <button type="button" className={metric === 'visitors' ? 'on' : ''}
              onClick={() => setMetric('visitors')}>Visitors</button>
            <button type="button" className={metric === 'views' ? 'on' : ''}
              onClick={() => setMetric('views')}>Views</button>
          </div>
          <label className="tilt" title="Tilt the chart">
            <span>3D</span>
            <input type="range" min={0} max={52} value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))} />
          </label>
        </div>
      </div>

      <div className="chart-body">
        <div className="chart-axis">
          {[...ticks].reverse().map((t, i) => <span key={i}>{t.toLocaleString('en-US')}</span>)}
        </div>

        <div className="scene" style={{ perspective: tilt > 2 ? '1100px' : 'none' }}>
          <div className="stage" style={{ transform: `rotateX(${tilt}deg)` }}>
            <div className="floor" aria-hidden="true" />
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <div key={f} className="gridline" style={{ bottom: `${f * 100}%` }} aria-hidden="true" />
            ))}

            <div className="bars">
              {points.map((p, i) => {
                const v = metric === 'views' ? p.views : p.visitors;
                const h = (v / max) * 100;
                const on = hover === i;
                return (
                  <div
                    key={p.t}
                    className={on ? 'col on' : 'col'}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className="bar" style={{ height: `${Math.max(v > 0 ? 1.5 : 0, h)}%` }}>
                      <span className="face front" />
                      <span className="face top" style={{ transform: `rotateX(90deg) translateZ(${depth}px)` }} />
                      <span className="face side" style={{ transform: `rotateY(90deg) translateZ(${depth}px)`, width: depth * 2 }} />
                    </div>
                    {on ? (
                      <div className="tip">
                        <b>{v.toLocaleString('en-US')}</b> {metric}
                        <span>{full(p.t)}</span>
                        <span className="tip-sub">
                          {p.views.toLocaleString('en-US')} views · {p.visitors.toLocaleString('en-US')} visitors
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="chart-x">
        {points.map((p, i) => (
          <span key={p.t}>{i % every === 0 ? label(p.t) : ''}</span>
        ))}
      </div>
    </div>
  );
}
