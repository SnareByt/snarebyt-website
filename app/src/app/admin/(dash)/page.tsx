import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { bdt, usd, getUsdRate } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const rate = await getUsdRate();

  const [paid, pending, needAction, liveReleases, noSpotify, unpublishable, recent, topBeats] =
    await Promise.all([
      // Revenue counts ONLY orders that SSLCOMMERZ validated server-side.
      prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { totalBdt: true }, _count: true }),
      prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
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
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { items: true } }),
      prisma.beat.findMany({ orderBy: { purchaseCount: 'desc' }, take: 5 }),
    ]);

  const revenue = paid._sum.totalBdt ?? 0;

  return (
    <>
      <header><div><div className="crumb">Overview</div><h1>Dashboard</h1></div></header>
      <div className="wrap">
        <div className="kpis">
          <Kpi label="Revenue · verified" value={bdt(revenue)} sub={`${usd(revenue, rate)} · ${paid._count} paid orders`} />
          <Kpi label="Awaiting payment" value={String(pending)} sub={pending ? 'Re-validate if over an hour old' : 'Nothing stuck'} />
          <Kpi label="Projects needing you" value={String(needAction)} />
          <Kpi label="Live releases" value={String(liveReleases)} sub={`${noSpotify} without a Spotify link`} />
        </div>

        {unpublishable.length > 0 && (
          <div className="note">
            <span>⚠</span>
            <span>
              <b>{unpublishable.length} published beat{unpublishable.length > 1 ? 's' : ''} have no untagged MP3.</b>{' '}
              A buyer would pay and receive nothing. <Link href="/admin/beats">Fix now</Link>.
            </span>
          </div>
        )}

        <section className="sec">
          <div className="sec-hd"><h2>Recent orders</h2><span className="sp" />
            <Link className="btn b-gh b-sm" href="/admin/orders">All orders</Link></div>
          <table>
            <thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.number}</td>
                  <td>{o.items.map((i) => i.titleSnapshot).join(', ')}</td>
                  <td>{bdt(o.totalBdt)}</td>
                  <td><span className={`chip ${o.status === 'PAID' ? 'ok' : o.status === 'PENDING_PAYMENT' ? 'warn' : 'off'}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sec">
          <div className="sec-hd"><h2>Top beats</h2></div>
          <table>
            <thead><tr><th>Beat</th><th>Plays</th><th>Sales</th></tr></thead>
            <tbody>{topBeats.map((b) => (
              <tr key={b.id}><td>{b.title}</td><td>{b.playCount}</td><td>{b.purchaseCount}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="l">{label}</div><div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}
