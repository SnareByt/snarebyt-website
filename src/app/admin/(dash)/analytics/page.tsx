import { Suspense } from 'react';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { getReport, rangeFor, getLiveVisitors, type LiveVisitor } from '@/lib/analytics';
import { getPulse } from './actions';
import { TrafficChart } from './TrafficChart';
import { LivePulse } from './LivePulse';
import { RangePicker } from './RangePicker';
import { Figure } from '@/components/admin/Figure';
import { countryName, placeLine, localTime } from '@/lib/place';

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

  const [report, pulse, liveVisitors] = await Promise.all([
    getReport(range), getPulse(), getLiveVisitors(),
  ]);

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
              <Figure className="kpi-n" value={report.visitors} />
              <Delta now={report.visitors} before={report.prevVisitors} />
            </div>
            <div className="glass kpi">
              <div className="kpi-l">Page views</div>
              <Figure className="kpi-n" value={report.views} />
              <Delta now={report.views} before={report.prevViews} />
            </div>
            <div className="glass kpi">
              <div className="kpi-l">Pages per visitor</div>
              <Figure className="kpi-n" value={perVisitor} />
              <span className="delta flat">this period</span>
            </div>
          </div>

          <LivePulse initial={pulse} />
        </div>

        <LiveNow visitors={liveVisitors} />

        <TrafficChart
          points={report.series} bucket={report.bucket}
          totalViews={report.views} totalVisitors={report.visitors}
        />

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
            {/* Full names, not codes. 'BD' is not something to have to decode
                at a glance on your own dashboard. */}
            <Bars
              rows={report.countries.map((r) => ({ ...r, label: countryName(r.label) }))}
              empty="No country data yet."
            />
          </div>
          <div className="glass panel">
            <div className="lb">Cities</div>
            <Bars
              rows={report.cities}
              empty="No city could be resolved for any visit yet."
            />
            {/* Said on the screen, not just in the code: a city that is
                confidently wrong is worse than no city, and this one is often
                wrong. It is where the connection appears to be, not where a
                person is. */}
            <div className="hint" style={{ marginTop: '.7rem' }}>
              Worked out from the network the visit came through, so a VPN or a mobile carrier
              can place someone in the wrong city. Treat it as roughly where interest is coming
              from, never as anybody&rsquo;s location.
            </div>
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

/**
 * Who is on the site right now, one row each.
 *
 * The closest thing to the "area name per visitor" that IP data can honestly
 * give: a city where one resolved, the division, the country in full, their
 * local time, and the page they are on. Nothing finer exists — see
 * src/lib/place.ts for why a neighbourhood cannot be derived from an IP.
 */
function LiveNow({ visitors }: { visitors: LiveVisitor[] }) {
  const ago = (s: number) =>
    s < 10 ? 'now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;

  return (
    <div className="glass panel" style={{ marginTop: '1rem' }}>
      <div className="lb">
        On the site now
        <span className={visitors.length ? 'chip ok' : 'chip off'} style={{ marginLeft: '.6rem' }}>
          {visitors.length}
        </span>
      </div>

      {visitors.length ? (
        <div className="livelist">
          {visitors.map((v) => {
            const clock = localTime(v.timezone);
            return (
              <div className="liverow" key={v.ref}>
                <span className="live-dot" aria-hidden="true" />
                <span className="live-where" title={v.timezone ?? undefined}>
                  {placeLine(v)}
                </span>
                <span className="live-path mono" title={v.path}>{v.path}</span>
                <span className="live-meta">
                  {v.device ?? 'unknown'}
                  {clock ? ` · ${clock} local` : ''}
                  {v.views > 1 ? ` · ${v.views} pages` : ''}
                </span>
                <span className="live-ago">{ago(v.agoSeconds)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="feed-empty">Nobody on the site in the last five minutes.</div>
      )}

      <div className="hint" style={{ marginTop: '.8rem' }}>
        <b>City is the finest detail an IP can give — there is no way to see a neighbourhood.</b>{' '}
        Mirpur, Banani, Uttara and Rampura all resolve to &ldquo;Dhaka&rdquo;, and on Grameenphone
        or Robi a visitor can appear in a different district entirely, because the address belongs
        to the carrier&rsquo;s gateway rather than to them. Each visitor is a daily rotating hash,
        not a person, and no IP address is stored.
      </div>
    </div>
  );
}
