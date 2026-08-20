import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { listOrders, getOverview } from '@/lib/account-data';
import { bdt } from '@/lib/money';
import { PortalNav } from '@/components/account/PortalNav';
import { OrderPill, Empty, when } from '@/components/account/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your orders — SnareByt',
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const me = await currentAccount();
  if (!me) redirect('/account/login?next=/account/orders');

  const [orders, { unread }] = await Promise.all([listOrders(me.id), getOverview(me.id)]);

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">Artist account</div>
          <h1>Orders</h1>
          <p>Receipts, licences and download links for everything you have bought.</p>
        </div>
      </div>

      <PortalNav unread={unread} />

      {orders.length === 0 ? (
        <Empty title="No orders yet">
          Anything you buy with <b style={{ color: 'var(--text)' }}>{me.email}</b> shows up here —
          including orders you placed before creating this account.
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
                  {o.licenceCount > 0 && (
                    <span className="pill">
                      {o.licenceCount} {o.licenceCount === 1 ? 'licence' : 'licences'}
                    </span>
                  )}
                </div>
                <div className="s">{o.titles.join(' · ')}</div>
              </div>
              <div className="r">
                {bdt(o.totalBdt)}
                <small>{o.paidAt ? `Paid ${when(o.paidAt)}` : when(o.createdAt)}</small>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
