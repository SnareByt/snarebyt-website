import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, getUsdRate, usd } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { rangeFor, getReport } from '@/lib/analytics';
import { Filter } from '@/components/app/Filter';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
] as const;

/**
 * What is selling and what is being looked at.
 *
 * No chart. The desktop has one and it earns its space there; on a phone a
 * 340px-wide time series is a decorative squiggle that answers no question.
 * The numbers and the ranked lists are what actually get read, so those are
 * what this shows.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter = '7d' } = await searchParams;

  const range = rangeFor(filter);
  const [report, rate] = await Promise.all([getReport(range), getUsdRate()]);

  const paid = await prisma.order.aggregate({
    where: { status: 'PAID', paidAt: { gte: range.from, lte: range.to } },
    _sum: { totalBdt: true },
    _count: true,
  });
  const revenue = paid._sum.totalBdt ?? 0;

  const topBeats = await prisma.beat.findMany({
    where: { purchaseCount: { gt: 0 } },
    orderBy: { purchaseCount: 'desc' },
    take: 8,
    select: { id: true, title: true, purchaseCount: true, playCount: true },
  });

  const mostPlayed = await prisma.beat.findMany({
    where: { playCount: { gt: 0 } },
    orderBy: { playCount: 'desc' },
    take: 8,
    select: { id: true, title: true, playCount: true, purchaseCount: true },
  });

  return (
    <>
      <NavBar title="Analytics" back="/app/more" />

      <div className="big-title">
        <h2>Analytics</h2>
        <p>{range.label}</p>
      </div>

      <Filter options={FILTERS} active={filter} basePath="/app/analytics" />

      <div className="wrap stack-lg" style={{ marginTop: '.9rem' }}>
        <div className="tiles">
          <div className="tile" data-accent="1">
            <div className="tile-k">Revenue</div>
            <div className="tile-v">{bdt(revenue)}</div>
            <div className="tile-s">{usd(revenue, rate)} · {paid._count} order{paid._count === 1 ? '' : 's'}</div>
          </div>
          <div className="tile">
            <div className="tile-k">Visitors</div>
            <div className="tile-v">{report.visitors.toLocaleString('en-US')}</div>
            <div className="tile-s">{report.views.toLocaleString('en-US')} page views</div>
          </div>
        </div>

        <Ranked
          title="Most viewed pages"
          rows={report.pages.slice(0, 8).map((p) => ({ label: p.label, value: p.views.toLocaleString('en-US') }))}
          empty="No traffic recorded in this window."
        />

        <Ranked
          title="Where they come from"
          rows={report.referrers.slice(0, 8).map((r) => ({ label: r.label, value: r.views.toLocaleString('en-US') }))}
          empty="No referrers recorded."
        />

        <Ranked
          title="Countries"
          rows={report.countries.slice(0, 8).map((c) => ({ label: c.label, value: c.views.toLocaleString('en-US') }))}
          empty="No countries recorded."
        />

        {/* Beat totals are lifetime, not windowed — playCount and purchaseCount
            are running counters on the Beat row, not time-series events. Saying
            so matters: a "top beats this week" that is silently all-time is the
            kind of number that gets acted on wrongly. */}
        <div>
          <div className="sec"><h3>Best sellers · all time</h3></div>
          <div className="list">
            {topBeats.map((b) => (
              <Link key={b.id} href={`/app/beats/${b.id}`} className="row">
                <div className="row-main">
                  <div className="row-t">{b.title}</div>
                  <div className="row-s">{b.playCount.toLocaleString('en-US')} plays</div>
                </div>
                <span className="row-v">{b.purchaseCount} sold</span>
              </Link>
            ))}
            {topBeats.length === 0 && <div className="empty">No beats sold yet.</div>}
          </div>
        </div>

        <div>
          <div className="sec"><h3>Most played · all time</h3></div>
          <div className="list">
            {mostPlayed.map((b) => (
              <Link key={b.id} href={`/app/beats/${b.id}`} className="row">
                <div className="row-main">
                  <div className="row-t">{b.title}</div>
                  <div className="row-s">
                    {b.purchaseCount
                      ? `${b.purchaseCount} sold`
                      : 'played but never bought'}
                  </div>
                </div>
                <span className="row-v">{b.playCount.toLocaleString('en-US')}</span>
              </Link>
            ))}
            {mostPlayed.length === 0 && <div className="empty">No plays recorded yet.</div>}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            A beat with plays and no sales is usually a price or a licence question, not a
            beat question.
          </p>
        </div>
      </div>
    </>
  );
}

function Ranked({
  title, rows, empty,
}: {
  title: string;
  rows: { label: string; value: string }[];
  empty: string;
}) {
  return (
    <div>
      <div className="sec"><h3>{title}</h3></div>
      <div className="list">
        {rows.map((r) => (
          <div key={r.label} className="row">
            <div className="row-main">
              <div className="row-t">{r.label}</div>
            </div>
            <span className="row-v">{r.value}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">{empty}</div>}
      </div>
    </div>
  );
}
