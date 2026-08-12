import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { DeliveryPanel, type GrantView } from './DeliveryPanel';
import { ContactForm, DangerZone, RemoveItemButton, type OrderShape } from './OrderControls';

export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toISOString().slice(0, 10);

const CHIP: Record<string, string> = {
  CART: 'off', PENDING_PAYMENT: 'warn', PAID: 'ok', FAILED: 'red',
  CANCELLED: 'off', REFUNDED: 'red', PARTIALLY_REFUNDED: 'warn',
};

/** Kept in step with TRANSITIONS in actions.ts — the server is the authority,
 *  this only decides which buttons are worth showing. */
const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  CANCELLED: ['PENDING_PAYMENT'],
  FAILED: ['PENDING_PAYMENT', 'CANCELLED'],
};

/**
 * One order, and everything needed to run it.
 *
 * There is deliberately no "mark as paid" control. If a customer insists they
 * have paid, the payment is re-validated with SSLCOMMERZ — an admin may
 * re-deliver what was bought, never decide that something was bought.
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
      refunds: { orderBy: { createdAt: 'desc' } },
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
  const settled = ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.status);
  const beatItems = order.items.filter((i) => i.beatId);
  const serviceItems = order.items.filter((i) => i.kind === 'SERVICE_PACKAGE');
  const wa = (order.billingPhone ?? '').replace(/[^0-9]/g, '');
  const refunded = order.refunds.reduce((n, r) => n + r.amountBdt, 0);

  const shape: OrderShape = {
    id: order.id,
    number: order.number,
    status: order.status,
    totalBdt: order.totalBdt,
    refundedBdt: refunded,
    billingName: order.billingName ?? order.guestName ?? '',
    billingEmail: order.billingEmail,
    billingPhone: order.billingPhone ?? '',
    billingCountry: order.billingCountry ?? '',
    adminNote: order.adminNote ?? '',
    canDelete: !settled && !order.licences.length
      && !order.payments.some((p) => p.status === 'VALIDATED'),
    nextStatuses: NEXT[order.status] ?? [],
  };

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
        <div className="sec-hd"><h2>Summary</h2></div>
        <table>
          <tbody>
            <tr><td>Total</td><td>{bdt(order.totalBdt)}</td></tr>
            {refunded ? <tr><td>Refunded</td><td>{bdt(refunded)}</td></tr> : null}
            <tr><td>Placed</td><td>{day(order.createdAt)}</td></tr>
            <tr><td>Paid</td><td>{order.paidAt ? day(order.paidAt) : '—'}</td></tr>
            <tr>
              <td>WhatsApp</td>
              <td>
                {order.billingPhone ?? '—'}
                {wa ? <> <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">open chat ↗</a></> : null}
              </td>
            </tr>
          </tbody>
        </table>

        {order.customerNote ? (
          <>
            <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>What the customer wrote</h2></div>
            <div className="card" style={{ padding: '1.1rem', whiteSpace: 'pre-wrap' }}>{order.customerNote}</div>
          </>
        ) : null}

        <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Customer details</h2></div>
        <div className="card" style={{ padding: '1.2rem' }}>
          <ContactForm order={shape} />
        </div>

        <div className="sec-hd" style={{ marginTop: '2rem' }}>
          <h2>Items</h2>
          {paid ? <span className="chip ok">frozen — order is paid</span> : null}
        </div>
        <table>
          <thead><tr><th>Item</th><th>Kind</th><th>Price</th><th /></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td><div className="ttl">{i.titleSnapshot}</div></td>
                <td className="sub">{i.kind.replace(/_/g, ' ').toLowerCase()}</td>
                <td>{bdt(i.priceBdt)}</td>
                <td>
                  <RemoveItemButton itemId={i.id} disabled={settled || order.items.length <= 1} />
                </td>
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
            <thead><tr><th>Transaction</th><th>Where</th><th>Amount</th><th>Status</th><th>Why</th><th>When</th></tr></thead>
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

        {order.refunds.length ? (
          <>
            <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Refunds</h2></div>
            <table>
              <thead><tr><th>Amount</th><th>Reason</th><th>When</th></tr></thead>
              <tbody>
                {order.refunds.map((r) => (
                  <tr key={r.id}>
                    <td>{bdt(r.amountBdt)}</td>
                    <td className="sub">{r.reason}</td>
                    <td className="sub">{day(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <div className="sec-hd" style={{ marginTop: '2rem' }}><h2>Status, refunds and deletion</h2></div>
        <DangerZone order={shape} />

        <p className="sub" style={{ margin: '1.6rem 0 3rem' }}>
          There is no button here to mark an order paid. If a customer says they have paid, check
          the transaction above — a payment only counts once SSLCOMMERZ has confirmed it to our
          server directly.
        </p>
      </div>
    </>
  );
}
