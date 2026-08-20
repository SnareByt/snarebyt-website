import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { getOverview } from '@/lib/account-data';
import { bdt } from '@/lib/money';
import { PortalNav } from '@/components/account/PortalNav';
import { OrderPill, ProjectPill, Stat, Empty, when, relative } from '@/components/account/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your account — SnareByt',
  robots: { index: false, follow: false },
};

export default async function AccountHome() {
  const me = await currentAccount();
  if (!me) redirect('/account/login?next=/account');

  const { orders, projects, licences, unread, paidCount } = await getOverview(me.id);

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">Artist account</div>
          <h1>{me.artistName || me.name || 'Your account'}</h1>
          <p>{me.email}</p>
        </div>
      </div>

      <PortalNav unread={unread} />

      <div className="pt-stats">
        <Stat label="Orders" value={orders.length ? paidCount || orders.length : 0} />
        <Stat label="Licences" value={licences} />
        <Stat label="Active projects" value={projects.length} />
        <Stat label="Unread updates" value={unread} />
      </div>

      {unread > 0 && (
        <div className="banner good" style={{ marginBottom: '1.6rem' }}>
          <i aria-hidden="true">✓</i>
          <span>
            You have <b>{unread}</b> {unread === 1 ? 'update' : 'updates'} from the studio waiting
            on your {projects.length === 1 ? 'project' : 'projects'}.
          </span>
        </div>
      )}

      <section className="pt-sec">
        <div className="pt-sec-hd">
          <h2>Recent orders</h2>
          <span className="sp" />
          {orders.length > 0 && <Link href="/account/orders">See all</Link>}
        </div>

        {orders.length === 0 ? (
          <Empty title="Nothing ordered yet">
            When you licence a beat or book a service, it appears here with your receipt,
            licence PDF and download links.
            <div style={{ marginTop: '1.2rem' }}>
              <Link href="/beats" className="btn btn-red btn-sm">Browse beats</Link>
            </div>
          </Empty>
        ) : (
          <div className="pt-list">
            {orders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="pt-row">
                <div>
                  <div className="t">
                    {o.number}
                    <OrderPill status={o.status} />
                  </div>
                  <div className="s">
                    {o.items.map((i) => i.titleSnapshot).join(' · ') || 'No items'}
                  </div>
                </div>
                <div className="r">
                  {bdt(o.totalBdt)}
                  <small>{when(o.createdAt)}</small>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="pt-sec">
        <div className="pt-sec-hd">
          <h2>Projects in progress</h2>
          <span className="sp" />
          <Link href="/account/projects">See all</Link>
        </div>

        {projects.length === 0 ? (
          <Empty title="No projects running">
            Mixing, mastering and cover art bookings show up here with their status,
            deadline and every file exchanged.
            <div style={{ marginTop: '1.2rem' }}>
              <Link href="/services" className="btn btn-ghost btn-sm">See what SnareByt offers</Link>
            </div>
          </Empty>
        ) : (
          <div className="pt-list">
            {projects.map((p) => (
              <Link key={p.id} href={`/account/projects/${p.id}`} className="pt-row">
                <div>
                  <div className="t">
                    {p.projectTitle || p.service.title}
                    <ProjectPill status={p.status} />
                  </div>
                  <div className="s">
                    {p.number} · {p.service.title}
                    {p.deadline ? ` · due ${when(p.deadline)} (${relative(p.deadline)})` : ''}
                  </div>
                </div>
                <div className="r" style={{ fontSize: '.8rem', fontWeight: 400, color: 'var(--dim)' }}>
                  Open →
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
