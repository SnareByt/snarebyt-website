import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { IcNext, IcWarn } from '@/components/app/Icons';
import { InstallHint } from '@/components/app/InstallHint';
import { Pulse } from '@/components/app/Pulse';
import { getPulse } from '@/lib/analytics';
import { getSiteMode } from '@/lib/site-mode';
import { orderChip, humanStatus } from '@/lib/app-format';

export const dynamic = 'force-dynamic';

/**
 * Today — the morning glance.
 *
 * The desktop dashboard shows eight metrics and two tables. That is the right
 * density for a monitor and the wrong one for a phone held at a bus stop, so
 * this screen answers three questions in order and stops:
 *
 *   1. Is anything broken or waiting on me?  (the alerts, at the top)
 *   2. How much money came in?               (verified revenue only)
 *   3. What happened recently?               (the last few orders)
 *
 * The alerts come first rather than the revenue on purpose. Revenue is
 * pleasant and never urgent; a published beat with no untagged MP3 is a
 * customer paying and receiving nothing, and it should be impossible to open
 * this app and not see it.
 */
export default async function TodayPage() {
  const user = await requireAdmin();
  const rate = await getUsdRate();

  const [paid, monthPaid, pending, projectsNeedingWork, unpublishable, missingBangla, recent, pulse, siteMode] =
    await Promise.all([
      /* Revenue counts ONLY orders SSLCOMMERZ validated server-side. Anything
         looser would put money on this screen that never arrived — the exact
         reason there is no "mark as paid" button anywhere in this project. */
      prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { totalBdt: true }, _count: true }),
      prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: startOfMonth() } },
        _sum: { totalBdt: true },
        _count: true,
      }),
      prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
      prisma.project.count({
        where: { status: { in: ['FILES_RECEIVED', 'REVISION_REQUESTED', 'COMPLETED'] } },
      }),
      prisma.beat.findMany({
        where: { status: 'PUBLISHED', assets: { none: { kind: 'MP3_UNTAGGED' } } },
        select: { id: true, title: true },
      }),
      // Bangla is non-nullable in the schema, but a row can still hold an
      // empty string. A buyer in Dhaka reading an English-only description of
      // what they are paying for is the failure this catches.
      prisma.serviceTier.count({ where: { descriptionBn: '' } }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { items: { select: { titleSnapshot: true } } },
      }),
      /* Two grouped queries. A failure here costs the chart, not the screen —
         the same rule the More tab learned the hard way. */
      getPulse(14).catch(() => null),
      /* Falls back to 'live' on any failure, which is what getSiteMode already
         does — the banner can therefore only ever fail to appear, never appear
         wrongly and send him to un-close a site that was open all along. */
      getSiteMode().catch(() => 'live' as const),
    ]);

  const revenue = paid._sum.totalBdt ?? 0;
  const monthRevenue = monthPaid._sum.totalBdt ?? 0;
  const firstName = (user.name ?? 'SnareByt').split(' ')[0];

  return (
    <>
      <NavBar title="SnareByt" />

      <div className="big-title">
        <h2>{greeting()}, {firstName}</h2>
        <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- Anything wrong, first ---------- */}
        {/* Above even the broken-beat alert, because it is broader: a closed
            site means NOTHING can be bought, so every other warning below is
            moot while it is on. Coming soon and maintenance are both states
            somebody switched on deliberately and both easy to forget — a site
            quietly showing a holding panel for a week costs every visitor in
            it, and nothing else in the app would say so. */}
        {siteMode !== 'live' && (
          <Link href="/app/account/settings" className="note red" style={{ display: 'block' }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.2rem' }}>
              <IcWarn className="ic-sm" />
              The website is {siteMode === 'soon' ? 'not open yet' : 'under maintenance'}
            </b>
            Visitors cannot browse or order. You still see the real site while signed in.
            Tap to reopen it.
          </Link>
        )}

        {(unpublishable.length > 0 || pending > 0 || missingBangla > 0) && (
          <div className="stack">
            {unpublishable.length > 0 && (
              <Link href="/app/beats" className="note red" style={{ display: 'block' }}>
                <b style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.2rem' }}>
                  <IcWarn className="ic-sm" />
                  {unpublishable.length} published beat{unpublishable.length > 1 ? 's have' : ' has'} no untagged MP3
                </b>
                A buyer would pay and receive nothing. Tap to fix.
              </Link>
            )}
            {pending > 0 && (
              <Link href="/app/orders?filter=PENDING_PAYMENT" className="note warn" style={{ display: 'block' }}>
                <b>{pending} order{pending > 1 ? 's' : ''} awaiting payment</b>
                <br />
                If one is over an hour old, re-validate it with SSLCOMMERZ.
              </Link>
            )}
            {missingBangla > 0 && (
              <Link href="/app/services" className="note warn" style={{ display: 'block' }}>
                <b>{missingBangla} service package{missingBangla > 1 ? 's' : ''} missing Bangla</b>
                <br />
                Bangladeshi buyers would see an English-only description.
              </Link>
            )}
          </div>
        )}

        {/* ---------- The pulse ----------
            Replaces the two static revenue tiles. They answered "how much" and
            nothing else; this answers "how much, which way is it going, and
            was that one good day or a steady fortnight" in the same space.
            All-time stays below as a quiet line, because it is a fact worth
            having and never a fact worth a tile. */}
        {pulse ? (
          <Pulse
            points={pulse.points}
            money={pulse.money}
            visitors={pulse.visitors}
            usdRate={rate}
            days={pulse.days}
          />
        ) : (
          <div className="note warn">
            <b>The fourteen-day summary could not be loaded.</b>
            <br />
            Everything below is unaffected.
          </div>
        )}

        <div className="list">
          <div className="row">
            <div className="row-main">
              <div className="row-t">All time</div>
              <div className="row-s">
                {paid._count} paid order{paid._count === 1 ? '' : 's'} · {usd(revenue, rate)}
              </div>
            </div>
            <span className="row-v">{bdt(revenue)}</span>
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-t">This month</div>
              <div className="row-s">
                {monthPaid._count} paid order{monthPaid._count === 1 ? '' : 's'} · {usd(monthRevenue, rate)}
              </div>
            </div>
            <span className="row-v">{bdt(monthRevenue)}</span>
          </div>
        </div>

        {/* ---------- Work ---------- */}
        <div>
          <div className="sec"><h3>Needs you</h3></div>
          <div className="list">
            <Link href="/app/orders?filter=PENDING_PAYMENT" className="row">
              <div className="row-main">
                <div className="row-t">Awaiting payment</div>
                <div className="row-s">Orders placed but not confirmed</div>
              </div>
              <span className={`chip ${pending ? 'warn' : 'ok'}`}>{pending}</span>
              <span className="row-x"><IcNext /></span>
            </Link>
            <Link href="/app/projects" className="row">
              <div className="row-main">
                <div className="row-t">Projects to move</div>
                <div className="row-s">Files in, revision asked, or ready to deliver</div>
              </div>
              <span className={`chip ${projectsNeedingWork ? 'warn' : 'ok'}`}>{projectsNeedingWork}</span>
              <span className="row-x"><IcNext /></span>
            </Link>
          </div>
        </div>

        {/* ---------- Recent ---------- */}
        <div>
          <div className="sec">
            <h3>Recent orders</h3>
            <Link href="/app/orders">All</Link>
          </div>
          {recent.length ? (
            <div className="list">
              {recent.map((o) => (
                <Link key={o.id} href={`/app/orders/${o.id}`} className="row">
                  <div className="row-main">
                    <div className="row-t">{o.items.map((i) => i.titleSnapshot).join(', ') || 'Empty order'}</div>
                    <div className="row-s mono">{o.number}</div>
                  </div>
                  <span className="row-v">{bdt(o.totalBdt)}</span>
                  <span className={`chip ${orderChip(o.status)}`}>{humanStatus(o.status)}</span>
                  <span className="row-x"><IcNext /></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="list">
              <div className="empty">No orders yet.</div>
            </div>
          )}
        </div>

        <InstallHint />
      </div>
    </>
  );
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function greeting() {
  /* Dhaka time, not the server's. Vercel runs in UTC, so without the explicit
     zone this would say "Good evening" over breakfast in Bangladesh. */
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' })
      .format(new Date()),
  );
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
