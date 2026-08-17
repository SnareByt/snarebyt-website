import { Suspense } from 'react';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { getReport, rangeFor } from '@/lib/analytics';
import { getPulse } from './actions';
import { Chart3D } from './Chart3D';
import { LivePulse } from './LivePulse';
import { RangePicker } from './RangePicker';

export const dynamic = 'force-dynamic';

const pct = (now: number, before: number) => {
  if (before === 0) return now > 0 ? null : 0;
  return Math.round(((now - before) / before) * 100);
};

function Delta({ now, before }: { now: number; before: number }) {
  const d = pct(now, before);
  if (d === null) return <span className="delta new">new</span>;
  if (d === 0) return <span className="delta flat">no change</span>;
  return (
    <span className={d > 0 ? 'delta up' : 'delta down'}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)}%
    </span>
  );
}

function Bars({ rows, empty }: { rows: { label: string; views: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  if (!rows.length) return <div className="feed-empty">{empty}</div>;
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span className="hbar-l" title={r.label}>{r.label}</span>
          <span className="hbar-t"><i style={{ width: `${(r.views / max) * 100}%` }} /></span>
          <span className="hbar-n">{r.views.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Analytics.
 *
 * Self-hosted on purpose. The numbers come from this site's own database, so
 * there is no third party holding the traffic data, nothing to pay for, no
 * script from another origin to allow through the CSP, and no cookie banner —
 * the collector sets no cookie and stores no IP address.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = rangeFor(sp.range ?? '7d', sp.from, sp.to);

  const [report, pulse] = await Promise.all([getReport(range), getPulse()]);

  const perVisitor = report.visitors ? (report.views / report.visitors).toFixed(1) : '0.0';

  return (
    <>
      <header>
        <div>
          <div className="crumb">Overview</div>
          <h1>Analytics</h1>
        </div>
      </header>

      <div className="wrap analytics">
        <Suspense fallback={null}><RangePicker /></Suspense>
        <div className="range-label">{range.label}</div>

        <div className="an-top">
          <div className="kpis">
            <div className="glass kpi">
              <div className="kpi-l">Visitors</div>
              <div className="kpi-n">{report.visitors.toLocaleString('en-US')}</div>
              <Delta now={report.visitors} before={report.prevVisitors} />
            </div>
            <div className="glass kpi">
              <div className="kpi-l">Page views</div>
              <div className="kpi-n">{report.views.toLocaleString('en-US')}</div>
              <Delta now={report.views} before={report.prevViews} />
            </div>
            <div className="glass kpi">
              <div className="kpi-l">Pages per visitor</div>
              <div className="kpi-n">{perVisitor}</div>
              <span className="delta flat">this period</span>
            </div>
          </div>

          <LivePulse initial={pulse} />
        </div>

        <Chart3D points={report.series} bucket={report.bucket} />

        <div className="an-grid">
          <div className="glass panel">
            <div className="lb">Most visited pages</div>
            <Bars rows={report.pages} empty="No page views in this range yet." />
          </div>
          <div className="glass panel">
            <div className="lb">Where they came from</div>
            <Bars rows={report.referrers} empty="No referrers recorded yet." />
          </div>
          <div className="glass panel">
            <div className="lb">Countries</div>
            <Bars rows={report.countries} empty="No country data yet." />
          </div>
          <div className="glass panel">
            <div className="lb">Devices</div>
            <Bars rows={report.devices} empty="No device data yet." />
          </div>
        </div>

        {/* Said plainly, because a number nobody can interpret is worse than no
            number. Both of these change how the figures should be read. */}
        <div className="note" style={{ marginTop: '1.6rem' }}>
          <span>ℹ</span>
          <span>
            <b>No cookies, no IP addresses stored.</b> A visitor is identified by a hash that is
            rebuilt from scratch each day, so someone who returns on three days counts as three
            visitors across a week — accurate for a single day, deliberately conservative over
            longer ranges. Known bots are excluded, and anyone browsing with &ldquo;do not
            track&rdquo; is not counted at all.
          </span>
        </div>
      </div>
    </>
  );
}
