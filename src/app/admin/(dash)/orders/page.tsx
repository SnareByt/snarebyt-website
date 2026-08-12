import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';

export const dynamic = 'force-dynamic';

const CHIP: Record<string, string> = {
  CART: 'off', PENDING_PAYMENT: 'warn', PAID: 'ok', FAILED: 'red',
  CANCELLED: 'off', REFUNDED: 'red', PARTIALLY_REFUNDED: 'warn',
};

export default async function AdminOrdersPage() {
  await requireAdmin();
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CART' } },
    orderBy: { createdAt: 'desc' },
    include: { items: true, payments: true },
    take: 100,
  });

  return (
    <>
      <header><div><div className="crumb">Business</div><h1>Orders</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{orders.length} orders</h2>
          <span className="chip ok">{orders.filter((o) => o.status === 'PAID').length} paid</span>
          <span className="chip warn">
            {orders.filter((o) => o.status === 'PENDING_PAYMENT').length} awaiting payment
          </span>
        </div>

        {orders.length ? (
          <>
            {/* Said out loud. Every edit lives on the order's own page, and a
                table that only hints at it with a colour is a table nobody
                clicks. */}
            <div className="note" style={{ marginBottom: '1rem' }}>
              <span>✎</span>
              <span>
                <b>Open an order to change it.</b> Customer details, download links, cancelling,
                refunds and deletion are all on the order&rsquo;s own page.
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Order</th><th>Customer</th><th>Items</th><th>Total</th>
                  <th>Status</th><th>Placed</th><th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/admin/orders/${o.id}`} className="ttl mono">{o.number}</Link></td>
                    <td>{o.billingName ?? o.guestName ?? '—'}<div className="sub">{o.billingEmail}</div></td>
                    <td>{o.items.length}</td>
                    <td>{bdt(o.totalBdt)}</td>
                    <td><span className={`chip ${CHIP[o.status] ?? 'off'}`}>{o.status.replace(/_/g, ' ')}</span></td>
                    <td className="sub">{o.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="acts">
                      <Link href={`/admin/orders/${o.id}`} className="rowgo">Open &amp; edit →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="note">
            <span>₿</span>
            <span>
              <b>No orders yet.</b> Nothing has been bought so far — paid orders appear here
              automatically, ready to edit and deliver.
            </span>
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>🔒</span>
          <span>
            <b>There is no &ldquo;mark as paid&rdquo; button, on purpose.</b> An order becomes paid only when
            SnareByt&apos;s own server re-validates the transaction with SSLCOMMERZ and the amount,
            currency and transaction id all match our record. If a customer insists they paid, the
            answer is to re-validate — never to flip a switch.
          </span>
        </div>
      </div>
    </>
  );
}
