import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { DeliveryPanel, type GrantView } from './DeliveryPanel';

export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toISOString().slice(0, 10);

const CHIP: Record<string, string> = {
  CART: 'off', PENDING_PAYMENT: 'warn', PAID: 'ok', FAILED: 'red',
  CANCELLED: 'off', REFUNDED: 'red', PARTIALLY_REFUNDED: 'warn',
};

/**
 * One order, and everything needed to deliver it.
 *
 * There is deliberately no "mark as paid" control anywhere on this page. If a
 * customer insists they have paid, the payment is re-validated with
 * SSLCOMMERZ — an admin can re-send what was bought, never decide that
 * something was bought.
 */
export default async function AdminOrderPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { beat: { select: { title: true } }, licenceTier: true, serviceTier: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      projects: true,
      licences: true,
    },
  });
  if (!order) notFound();

  const grants = await prisma.downloadGrant.findMany({
    where: { orderItemId: { in: order.items.map((i) => i.id) } },
    orderBy: { createdAt: 'desc' },
  });

  const byItem = new Map<string, GrantView[]>();
  for (const g of grants) {
    const list = byItem.get(g.orderItemId) ?? [];
    list.push({
      id: g.id,
      createdAt: day(g.createdAt),
      expiresAt: day(g.expiresAt),
      attempts: g.attempts,
      maxAttempts: g.maxAttempts,
      revoked: Boolean(g.revokedAt),
      expired: g.expiresAt.getTime() < Date.now(),
    });
    byItem.set(g.orderItemId, list);
  }

  const paid = order.status === 'PAID';
  const beatItems = order.items.filter((i) => i.beatId);
  const serviceItems = order.items.filter((i) => i.kind === 'SERVICE_PACKAGE');
  const wa = (order.billingPhone ?? '').replace(/[^0-9]/g, '');

  return (
    <>
      <header>
        <div>
          <div className="crumb"><Link href="/admin/orders">Orders</Link></div>
          <h1>{order.number}</h1>
        </div>
        <span className={`chip ${CHIP[order.status] ?? 'off'}`}>{order.status.replace(/_/g, ' ')}</span>
      </header>

      <div className="wrap">
        <div className="sec-hd"><h2>Customer</h2></div>
        <table>
          <tbody>
            <tr><td>Name</td><td>{order.billingName ?? order.guestName ?? '—'}</td></tr>
            <tr><td>Email</td><td>{order.billingEmail}</td></tr>
            <tr>
              <td>WhatsApp</td>
              <td>
                {order.billingPhone ?? '—'}
                {wa ? (
                  <>
                    {' '}
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">open chat ↗</a>
                  </>
                ) : null}
              </td>
            </tr>
            <tr><td>Country</td><td>{order.billingCountry ?? '—'}</td></tr>
            <tr><td>Total</td><td>{bdt(order.totalBdt)}</td></tr>
            <tr><td>Placed</td><td>{day(order.createdAt)}</td></tr>
            <tr><td>Paid</td><td>{order.paidAt ? day(order.paidAt) : '—'}</td></tr>
          </tbody>
        </table>

        <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Items</h2></div>
        <table>
          <thead><tr><th>Item</th><th>Kind</th><th>Price</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td><div className="ttl">{i.titleSnapshot}</div></td>
                <td className="sub">{i.kind.replace(/_/g, ' ').toLowerCase()}</td>
                <td>{bdt(i.priceBdt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sec-hd" style={{ marginTop: '2rem' }}>
          <h2>Beat delivery</h2>
          {paid ? null : <span className="chip warn">not paid yet</span>}
        </div>
        {beatItems.length ? (
          beatItems.map((i) => (
            <DeliveryPanel
              key={i.id}
              orderItemId={i.id}
              title={i.titleSnapshot}
              grants={byItem.get(i.id) ?? []}
              canDeliver={paid}
            />
          ))
        ) : (
          <p className="sub">No beat licences in this order.</p>
        )}

        {serviceItems.length ? (
          <>
            <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Service work</h2></div>
            {order.projects.length ? (
              <table>
                <thead><tr><th>Project</th><th>Status</th><th>Opened</th></tr></thead>
                <tbody>
                  {order.projects.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.number}</td>
                      <td className="sub">{p.status.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="sub">{day(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="sub">
                A project opens automatically when the payment is verified. Service files are sent
                directly, not through a download link.
              </p>
            )}
          </>
        ) : null}

        <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Payments</h2></div>
        {order.payments.length ? (
          <table>
            <thead><tr><th>Transaction</th><th>Environment</th><th>Amount</th><th>Status</th><th>Why</th><th>When</th></tr></thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono sub">{p.tranId}</td>
                  <td className="sub">{p.environment}</td>
                  <td>{bdt(p.amountBdt)}</td>
                  <td>
                    <span className={`chip ${p.status === 'VALIDATED' ? 'ok' : p.status === 'FAILED' ? 'red' : 'warn'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="sub">{p.failureReason ?? '—'}</td>
                  <td className="sub">{day(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sub">No payment has been started for this order.</p>
        )}

        <p className="sub" style={{ marginTop: '1.6rem' }}>
          There is no button here to mark an order paid. If a customer says they have paid,
          check the transaction above — a payment only counts once SSLCOMMERZ has confirmed it
          to our server directly.
        </p>
      </div>
    </>
  );
}
