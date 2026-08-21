'use client';

import { useMemo, useState } from 'react';
import { bdt } from '@/lib/money-client';

/**
 * Fourteen days of the business, on the home screen.
 *
 * WHY A TOGGLE AND NOT ONE CHART WITH TWO LINES
 *
 * Revenue runs to thousands of taka; visitors to tens of people. Drawing both
 * on one plot needs two y-axes, and where two y-scales get pinned relative to
 * each other is arbitrary — the chart then invents a correlation that is not in
 * the data. "Traffic spikes when sales do" would be a property of the axis
 * alignment, not of the business. One series at a time is the honest form, and
 * the control is what makes that possible rather than a limitation.
 *
 * The chart is hand-built SVG. A charting library would be 40–120 kB of
 * JavaScript on the first screen of a phone dashboard, to draw one line.
 *
 * Restraint is the brief: black carries it, red only punctuates. So there is
 * one accent stroke, one gradient that fades to nothing, a hairline baseline,
 * and no gridlines, no axis furniture, no value on every point.
 */

type Point = { day: string; money: number; visitors: number };

type Props = {
  points: Point[];
  money: { total: number; prev: number };
  visitors: { total: number; prev: number };
  usdRate: number;
  days: number;
};

type Metric = 'money' | 'visitors';

/* The plot's own coordinate space. The SVG scales to its container, so these
   are ratios rather than pixels — 100 wide keeps the path data readable. */
const W = 100;
const H = 34;

export function Pulse({ points, money, visitors, usdRate, days }: Props) {
  const [metric, setMetric] = useState<Metric>('money');
  /* The point under the finger while scrubbing. null means "not scrubbing",
     which is what shows the period total rather than a single day. */
  const [at, setAt] = useState<number | null>(null);

  const series = useMemo(
    () => points.map((p) => (metric === 'money' ? p.money : p.visitors)),
    [points, metric],
  );

  const { total, prev } = metric === 'money' ? money : visitors;

  /**
   * The geometry.
   *
   * The baseline sits at zero, not at the minimum. Starting the y-axis at the
   * smallest value is the classic way to make a flat fortnight look like a
   * rally — the shape has to be true to the numbers.
   */
  const { line, area, peak } = useMemo(() => {
    const max = Math.max(...series, 1);
    const step = series.length > 1 ? W / (series.length - 1) : W;
    const xy = series.map((v, i) => {
      const x = i * step;
      // 1.5 of headroom so a peak at max is not clipped by the stroke width.
      const y = H - (v / max) * (H - 1.5) - 0.75;
      return [x, y] as const;
    });

    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    return {
      line: d,
      area: `${d} L${W} ${H} L0 ${H} Z`,
      peak: series.indexOf(max),
    };
  }, [series]);

  const fmt = (v: number) =>
    metric === 'money' ? bdt(v) : v.toLocaleString('en-US');

  /**
   * Change against the previous fourteen days.
   *
   * Growth from zero is reported as "no comparison" rather than as an infinite
   * or 100% rise. A first sale after a blank fortnight is genuinely good news
   * and genuinely not a percentage.
   */
  const delta = prev > 0 ? Math.round(((total - prev) / prev) * 100) : null;

  const shown = at === null ? total : series[at];
  const shownLabel =
    at === null
      ? `Last ${days} days`
      : new Date(points[at].day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  /** Map a touch or pointer x to the nearest index. */
  function scrub(clientX: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setAt(Math.round(ratio * (series.length - 1)));
  }

  return (
    <section className="pulse" aria-label="Fourteen day summary">
      <header className="pulse-hd">
        <div>
          <div className="tile-k">{shownLabel}</div>
          <div className="pulse-figure">
            {fmt(shown)}
            {/* The dollar equivalent is derived at render time from the stored
                taka, never stored — the money rule, restated on screen. */}
            {metric === 'money' && (
              <span className="pulse-sub">${(shown / usdRate).toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Segmented control. Two options, so a segmented control rather than a
            dropdown: both choices are visible and switching is one tap. */}
        <div className="seg pulse-seg" role="tablist" aria-label="Measure">
          {(['money', 'visitors'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              data-on={metric === m ? '1' : '0'}
              onClick={() => { setMetric(m); setAt(null); }}
            >
              {m === 'money' ? 'Money' : 'Visitors'}
            </button>
          ))}
        </div>
      </header>

      {at === null && delta !== null && (
        <div className={`pulse-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          <span className="dim"> vs previous {days} days</span>
        </div>
      )}
      {at === null && delta === null && (
        <div className="pulse-delta"><span className="dim">No comparison — nothing in the previous {days} days</span></div>
      )}

      <div
        className="pulse-plot"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e.clientX, e.currentTarget); }}
        onPointerMove={(e) => { if (at !== null) scrub(e.clientX, e.currentTarget); }}
        onPointerUp={() => setAt(null)}
        onPointerCancel={() => setAt(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="pulse-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E01B36" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#E01B36" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#pulse-fill)" />
          {/* vectorEffect keeps the stroke 1.6px however the SVG is stretched;
              without it, preserveAspectRatio="none" would squash it. */}
          <path
            d={line}
            fill="none"
            stroke="#FF2D4A"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {at !== null && (
            <line
              x1={(at / Math.max(1, series.length - 1)) * W}
              y1="0"
              x2={(at / Math.max(1, series.length - 1)) * W}
              y2={H}
              stroke="rgba(255,255,255,.35)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* The peak marker is a DOM element rather than an SVG circle, so the
            non-uniform scale cannot turn it into an ellipse. */}
        {at === null && series[peak] > 0 && (
          <span
            className="pulse-peak"
            style={{ left: `${(peak / Math.max(1, series.length - 1)) * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="pulse-axis" aria-hidden="true">
        <span>{new Date(points[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span>today</span>
      </div>

      {/**
        * The table twin.
        *
        * A chart that can only be read by looking at it is unreadable to a
        * screen reader and unverifiable by anyone. Every value is here in text,
        * visually hidden but fully in the accessibility tree.
        */}
      <table className="sr-only">
        <caption>{metric === 'money' ? 'Revenue' : 'Visitors'} by day, last {days} days</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{fmt(series[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pulse-foot">
        {metric === 'money'
          ? 'Only payments SSLCOMMERZ confirmed server-side. Counted on the day the money arrived.'
          : 'A visitor id rotates daily, so someone returning on three days counts three times.'}
      </p>
    </section>
  );
}
