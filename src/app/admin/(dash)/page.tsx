import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { bdt, usd, getUsdRate } from '@/lib/money';
import { getPulse } from '@/lib/analytics';
import { getSiteMode } from '@/lib/site-mode';
import { paymentsConfigured } from '@/lib/sslcommerz';
import { Figure } from '@/components/admin/Figure';
import { Sparkline } from '@/components/admin/Sparkline';

export const dynamic = 'force-dynamic';

/**
 * The screen Samir opens first.
 *
 * Built around one question — "is there anything I need to do?" — rather than
 * around what is easy to count. A dashboard of totals that never change is
 * furniture; the part that earns its place is NEEDS YOU, which is empty on a
 * good day and specific on a bad one.
 *
 * Everything here is real. There is no placeholder figure and no invented
 * trend: a zero means zero, and a section with nothing in it says so plainly
 * rather than showing an empty table with headings.
 */
export default async function Dashboard() {
  const [rate, pulse, mode] = await Promise.all([getUsdRate(), getPulse(14), getSiteMode()]);

  const [
    paid, pending, stalePending, needAction, liveReleases, noSpotify,
    unpublishable, missingBangla, unreviewedLegal, publishedBeats, artists,
    draftBeats, recent, topBeats,
  ] = await Promise.all([
    // Revenue counts ONLY orders that SSLCOMMERZ validated server-side.
    prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { totalBdt: true }, _count: true }),
    prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    // Placed over an hour ago and still unpaid: old enough that the gateway
    // has finished with it either way, so it is worth re-validating.
    prisma.order.count({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(Date.now() - 3_600_000) } },
    }),
    prisma.project.count({
      where: { status: { in: ['FILES_RECEIVED', 'REVISION_REQUESTED', 'COMPLETED'] } },
    }),
    prisma.release.count({ where: { live: true } }),
    prisma.release.count({ where: { live: true, spotifyEmbedId: null } }),
    // Published beats missing a deliverable would sell a customer nothing.
    prisma.beat.findMany({
      where: { status: 'PUBLISHED', assets: { none: { kind: 'MP3_UNTAGGED' } } },
      select: { id: true, title: true },
    }),
    prisma.serviceTier.count({ where: { descriptionBn: '' } }),
    prisma.legalPage.count({ where: { lawyerReviewNeeded: true } }),
    prisma.beat.count({ where: { status: 'PUBLISHED' } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.beat.count({ where: { status: 'DRAFT' } }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { items: true } }),
    // Not filtered to published: before anything is on sale this is the only
    // place the catalogue is visible at a glance, and an empty panel where
    // there are five beats reads as a broken screen. Drafts are marked.
    prisma.beat.findMany({
      orderBy: [{ purchaseCount: 'desc' }, { playCount: 'desc' }],
      take: 5,
      select: { id: true, title: true, playCount: true, purchaseCount: true, status: true },
    }),
  ]);

  const revenue = paid._sum.totalBdt ?? 0;
  const legalPages = await prisma.legalPage.count();

  /** Everything genuinely wrong, most costly first. */
  const jobs: { tone: 'bad' | 'warn'; text: React.ReactNode; href: string; cta: string }[] = [];

  if (unpublishable.length) {
    jobs.push({
      tone: 'bad',
      text: <><b>{unpublishable.length} published beat{unpublishable.length > 1 ? 's have' : ' has'} no untagged MP3.</b> A buyer would pay and receive nothing.</>,
      href: '/admin/beats', cta: 'Upload the files',
    });
  }
  if (!legalPages) {
    jobs.push({
      tone: 'bad',
      text: <><b>There are no legal pages.</b> The cart asks buyers to accept licence terms that do not exist yet.</>,
      href: '/admin/legal', cta: 'Write them',
    });
  }
  if (missingBangla) {
    jobs.push({
      tone: 'bad',
      text: <><b>{missingBangla} service package{missingBangla > 1 ? 's are' : ' is'} missing Bangla.</b> A Bangladeshi buyer would see English only.</>,
      href: '/admin/services', cta: 'Add the Bangla',
    });
  }
  if (!paymentsConfigured()) {
    jobs.push({
      tone: 'warn',
      text: <><b>SSLCOMMERZ is not configured.</b> Orders can be placed but nothing can be paid online.</>,
      href: '/admin/settings', cta: 'See what is needed',
    });
  }
  if (stalePending) {
    jobs.push({
      tone: 'warn',
      text: <><b>{stalePending} order{stalePending > 1 ? 's have' : ' has'} been awaiting payment for over an hour.</b> Re-validate before chasing anyone.</>,
      href: '/admin/orders', cta: 'Open orders',
    });
  }
  if (needAction) {
    jobs.push({
      tone: 'warn',
      text: <><b>{needAction} project{needAction > 1 ? 's are' : ' is'} waiting on you.</b> Files received, a revision asked for, or ready to deliver.</>,
      href: '/admin/projects', cta: 'Open projects',
    });
  }
  if (legalPages && unreviewedLegal) {
    jobs.push({
      tone: 'warn',
      text: <><b>{unreviewedLegal} legal page{unreviewedLegal > 1 ? 's have' : ' has'} not been read by a lawyer.</b> They are live as written.</>,
      href: '/admin/legal', cta: 'Review',
    });
  }
  if (noSpotify) {
    jobs.push({
      tone: 'warn',
      text: <><b>{noSpotify} live release{noSpotify > 1 ? 's have' : ' has'} no Spotify link.</b> The card shows no player.</>,
      href: '/admin/releases', cta: 'Add the link',
    });
  }

  return (
    <>
      <header>
        <div><div className="crumb">Overview</div><h1>Dashboard</h1></div>
        <span className="hsp" />
        <SiteState mode={mode} />
      </header>

      <div className="wrap dash">
        {/* ---------- money and traffic ---------- */}
        <div className="dash-top">
          <div className="glass dash-hero">
            <div className="kpi-l">Revenue · verified by the gateway</div>
            <Figure className="hero-n" value={bdt(revenue)} />
            <div className="hero-sub">
              {usd(revenue, rate)} · {paid._count} paid {paid._count === 1 ? 'order' : 'orders'} all time
            </div>

            <div className="hero-chart">
              <Sparkline points={pulse.points.map((p) => p.money)} label="Revenue" />
            </div>
            <div className="hero-foot">
              <span className="kpi-l">Last 14 days</span>
              <b>{bdt(pulse.money.total)}</b>
              <Delta now={pulse.money.total} prev={pulse.money.prev} />
            </div>
          </div>

          <div className="glass dash-hero secondary">
            <div className="kpi-l">Visitors · last 14 days</div>
            <Figure className="hero-n" value={pulse.visitors.total} />
            <div className="hero-sub">
              Unique people, counted by a hash that rotates daily — never a name.
            </div>

            <div className="hero-chart">
              <Sparkline points={pulse.points.map((p) => p.visitors)} label="Visitors" tone="plain" />
            </div>
            <div className="hero-foot">
              <span className="kpi-l">Against the 14 before</span>
              <Delta now={pulse.visitors.total} prev={pulse.visitors.prev} />
              <span className="sp" />
              <Link className="btn b-gh b-sm" href="/admin/analytics">Full analytics</Link>
            </div>
          </div>
        </div>

        {/* ---------- the counts worth a glance ---------- */}
        <div className="kpis dash-kpis">
          <Kpi label="Awaiting payment" value={pending}
            sub={pending ? `${stalePending} over an hour old` : 'Nothing stuck'} href="/admin/orders" />
          <Kpi label="Projects open" value={needAction} sub={needAction ? 'Waiting on you' : 'All clear'}
            href="/admin/projects" />
          <Kpi label="Beats published" value={publishedBeats}
            sub={draftBeats ? `${draftBeats} still draft` : 'None in draft'} href="/admin/beats" />
          <Kpi label="Live releases" value={liveReleases}
            sub={noSpotify ? `${noSpotify} without Spotify` : 'All linked'} href="/admin/releases" />
          <Kpi label="Artist accounts" value={artists} sub="Registered customers" href="/admin/customers" />
        </div>

        {/* ---------- what actually needs doing ---------- */}
        <section className="sec">
          <div className="sec-hd">
            <h2>Needs you</h2>
            {jobs.length
              ? <span className="chip warn">{jobs.length}</span>
              : <span className="chip ok">Nothing outstanding</span>}
          </div>

          {jobs.length ? (
            <div className="jobs">
              {jobs.map((j) => (
                <div className={`job ${j.tone}`} key={j.href + j.cta}>
                  <span className="job-i" aria-hidden="true">{j.tone === 'bad' ? '!' : '•'}</span>
                  <span className="job-t">{j.text}</span>
                  <Link className="btn b-gh b-sm" href={j.href}>{j.cta}</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass all-clear">
              <div className="ac-t">Everything is in order.</div>
              <div className="sub">
                No missing files, no stalled payments, no projects waiting. This list fills itself
                in when something needs you — there is nothing to check when it is empty.
              </div>
            </div>
          )}
        </section>

        {/* ---------- shortcuts ---------- */}
        <section className="sec">
          <div className="sec-hd"><h2>Jump to</h2></div>
          <div className="quick">
            <QuickLink href="/admin/beats" icon="♫" label="Upload a beat" />
            <QuickLink href="/admin/releases" icon="◉" label="Add a release" />
            <QuickLink href="/admin/portfolio" icon="▣" label="Add a credit" />
            <QuickLink href="/admin/site" icon="✎" label="Edit the site" />
            <QuickLink href="/admin/services" icon="✦" label="Prices & packages" />
            <QuickLink href="/admin/settings" icon="⚙" label="Settings" />
          </div>
        </section>

        {/* ---------- orders and beats ---------- */}
        <div className="dash-cols">
          <section className="sec">
            <div className="sec-hd">
              <h2>Recent orders</h2><span className="sp" />
              <Link className="btn b-gh b-sm" href="/admin/orders">All orders</Link>
            </div>
            {recent.length ? (
              <table>
                <thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td className="mono"><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                      <td className="sub">{o.items.map((i) => i.titleSnapshot).join(', ')}</td>
                      <td>{bdt(o.totalBdt)}</td>
                      <td>
                        <span className={`chip ${o.status === 'PAID' ? 'ok' : o.status === 'PENDING_PAYMENT' ? 'warn' : 'off'}`}>
                          {o.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="glass empty-panel">
                <div className="ac-t">No orders yet.</div>
                <div className="sub">
                  The first one will appear here the moment it is placed, paid or not.
                </div>
              </div>
            )}
          </section>

          <section className="sec">
            <div className="sec-hd">
              <h2>Top beats</h2><span className="sp" />
              <Link className="btn b-gh b-sm" href="/admin/beats">All beats</Link>
            </div>
            {topBeats.length ? (
              <BeatBars beats={topBeats} />
            ) : (
              <div className="glass empty-panel">
                <div className="ac-t">No beats yet.</div>
                <div className="sub">Add one and its plays and sales show up here.</div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Delta({ now, prev }: { now: number; prev: number }) {
  // No previous period is not a 100% rise. Saying "new" is honest; saying
  // "+100%" against zero is the oldest lie in a dashboard.
  if (!prev) return <span className="delta new">{now ? 'new' : 'nothing yet'}</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className="delta flat">no change</span>;
  return (
    <span className={pct > 0 ? 'delta up' : 'delta down'}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function Kpi({ label, value, sub, href }: { label: string; value: number; sub?: string; href: string }) {
  return (
    <Link className="glass kpi dash-kpi" href={href}>
      <div className="kpi-l">{label}</div>
      <Figure className="kpi-n" value={value} />
      {sub ? <div className="kpi-s">{sub}</div> : null}
    </Link>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link className="quick-i" href={href}>
      <span className="q-ic" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

/**
 * Plays and sales as bars.
 *
 * Both are scaled against the busiest beat rather than each other: plays are
 * hundreds and sales are single figures, and one shared scale would render
 * every sales bar as an invisible sliver.
 */
function BeatBars({
  beats,
}: { beats: { id: string; title: string; playCount: number; purchaseCount: number; status: string }[] }) {
  const maxPlays = Math.max(...beats.map((b) => b.playCount), 1);
  const maxSales = Math.max(...beats.map((b) => b.purchaseCount), 1);

  return (
    <div className="hbars">
      {beats.map((b) => (
        <div className="beatbar" key={b.id}>
          <span className="hbar-l" title={b.title}>
            {b.title}
            {b.status !== 'PUBLISHED' ? <em className="bb-draft">{b.status.toLowerCase()}</em> : null}
          </span>
          <span className="bb-track" title={`${b.playCount} plays`}>
            <i style={{ width: `${(b.playCount / maxPlays) * 100}%` }} />
          </span>
          <span className="bb-n">{b.playCount}<em>plays</em></span>
          <span className="bb-track sales" title={`${b.purchaseCount} sales`}>
            <i style={{ width: `${(b.purchaseCount / maxSales) * 100}%` }} />
          </span>
          <span className="bb-n">{b.purchaseCount}<em>sold</em></span>
        </div>
      ))}
    </div>
  );
}

/** Whether the public site is open, said where it cannot be missed. */
function SiteState({ mode }: { mode: 'live' | 'soon' | 'maintenance' }) {
  if (mode === 'live') return <span className="chip ok">Site live</span>;
  return (
    <Link className={`chip ${mode === 'soon' ? 'warn' : 'off'}`} href="/admin/settings">
      {mode === 'soon' ? 'Coming soon — site closed' : 'Under maintenance — site closed'}
    </Link>
  );
}
