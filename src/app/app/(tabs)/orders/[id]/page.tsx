import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { orderChip, humanStatus, shortDate, ago } from '@/lib/app-format';
import { nextStatuses } from '@/lib/order-rules';
import { OrderActions } from './OrderActions';

export const dynamic = 'force-dynamic';

/**
 * One order.
 *
 * There is deliberately no "mark as paid" control here, exactly as there is
 * none on the desktop. If a customer insists they have paid, the payment is
 * re-validated with SSLCOMMERZ. An admin may re-deliver what was bought; an
 * admin may never decide that something was bought.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          beat: { select: { title: true } },
          licenceTier: { select: { name: true } },
          serviceTier: { select: { name: true } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      projects: { select: { id: true, number: true, status: true, projectTitle: true } },
      licences: { select: { id: true, number: true, orderItemId: true, pdfObjectKey: true } },
    },
  });
  if (!order) notFound();

  const grants = await prisma.downloadGrant.findMany({
    where: { orderItemId: { in: order.items.map((i) => i.id) } },
    orderBy: { createdAt: 'desc' },
  });

  const refunded = order.refunds.reduce((n, r) => n + r.amountBdt, 0);
  const licenceByItem = new Map(order.licences.map((l) => [l.orderItemId, l]));

  const grantByItem = new Map<string, typeof grants>();
  for (const g of grants) {
    grantByItem.set(g.orderItemId, [...(grantByItem.get(g.orderItemId) ?? []), g]);
  }

  return (
    <>
      <NavBar title={order.number} back="/app/orders" />

      <div className="big-title">
        <h2>{bdt(order.totalBdt)}</h2>
        <p>
          <span className={`chip ${orderChip(order.status)}`}>{humanStatus(order.status)}</span>
          {' '}· placed {ago(order.createdAt)}
        </p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- Customer ---------- */}
        <div>
          <div className="sec"><h3>Customer</h3></div>
          <div className="list selectable">
            <Row k="Name" v={order.billingName || order.guestName || '—'} />
            <Row k="Email" v={order.billingEmail} href={`mailto:${order.billingEmail}`} />
            {order.billingPhone && (
              <Row k="Phone" v={order.billingPhone} href={`tel:${order.billingPhone}`} />
            )}
            {order.artistName && <Row k="Records as" v={order.artistName} />}
            {order.billingCountry && <Row k="Country" v={order.billingCountry} />}
          </div>
          {order.artistName && (
            <p className="hint" style={{ padding: '0 .3rem' }}>
              The artist name is what prints on the licence — a beat is usually released
              under one rather than a legal name.
            </p>
          )}
        </div>

        {/* ---------- What they said ---------- */}
        {order.customerNote && (
          <div>
            <div className="sec"><h3>Their brief</h3></div>
            <div className="card card-pad selectable" style={{ fontSize: '.88rem', lineHeight: 1.6 }}>
              {order.customerNote}
            </div>
          </div>
        )}

        {/* ---------- Items ---------- */}
        <div>
          <div className="sec"><h3>{order.items.length} item{order.items.length === 1 ? '' : 's'}</h3></div>
          <div className="list">
            {order.items.map((i) => {
              const licence = licenceByItem.get(i.id);
              const itemGrants = grantByItem.get(i.id) ?? [];
              const liveGrant = itemGrants.find(
                (g) => !g.revokedAt && g.expiresAt > new Date() && g.attempts < g.maxAttempts,
              );
              return (
                <div key={i.id} className="row">
                  <div className="row-main">
                    <div className="row-t">{i.titleSnapshot}</div>
                    <div className="row-s">
                      {i.licenceTier?.name ?? i.serviceTier?.name ?? humanStatus(i.kind)}
                      {i.quantity > 1 ? ` · ×${i.quantity}` : ''}
                    </div>
                    {licence && (
                      <div className="row-s mono" style={{ color: 'var(--dim)' }}>
                        {licence.number}
                        {licence.pdfObjectKey ? ' · PDF issued' : ' · PDF not generated'}
                      </div>
                    )}
                    {i.beatId && order.status === 'PAID' && (
                      <div className="row-s" style={{ color: liveGrant ? 'var(--ok)' : 'var(--warn)' }}>
                        {liveGrant
                          ? `Download live until ${shortDate(liveGrant.expiresAt)} · ${liveGrant.attempts}/${liveGrant.maxAttempts} used`
                          : itemGrants.length
                            ? 'Download link expired or used up'
                            : 'No download link issued'}
                      </div>
                    )}
                  </div>
                  <span className="row-v">{bdt(i.priceBdt * i.quantity)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------- Money ---------- */}
        <div>
          <div className="sec"><h3>Money</h3></div>
          <div className="list">
            <Row k="Subtotal" v={bdt(order.subtotalBdt)} />
            {order.discountBdt > 0 && <Row k="Discount" v={`−${bdt(order.discountBdt)}`} />}
            <Row k="Total" v={bdt(order.totalBdt)} />
            {refunded > 0 && <Row k="Refunded" v={`−${bdt(refunded)}`} />}
            {order.paidAt && <Row k="Paid" v={shortDate(order.paidAt)} />}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Charged in BDT. The buyer saw {order.displayCurrency}
            {order.usdRateAtSale ? ` at ৳${order.usdRateAtSale}/$ — frozen for the receipt` : ''}.
          </p>
        </div>

        {/* ---------- Payment attempts ---------- */}
        <div>
          <div className="sec"><h3>Payment attempts</h3></div>
          {order.payments.length ? (
            <div className="list">
              {order.payments.map((p) => (
                <div key={p.id} className="row">
                  <div className="row-main">
                    <div className="row-t">
                      {p.cardType || p.gateway}{' '}
                      <span className="dim" style={{ fontWeight: 400 }}>· {p.environment}</span>
                    </div>
                    <div className="row-s mono">{p.tranId}</div>
                    <div className="row-s">
                      {ago(p.createdAt)}
                      {p.validatedAt ? ` · validated ${shortDate(p.validatedAt)}` : ''}
                      {p.failureReason ? ` · ${p.failureReason}` : ''}
                    </div>
                  </div>
                  <span className={`chip ${p.status === 'VALIDATED' ? 'ok' : p.status === 'INITIATED' ? 'warn' : 'red'}`}>
                    {humanStatus(p.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="list"><div className="empty">No payment attempted yet.</div></div>
          )}
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Every attempt is kept and never overwritten. An order becomes paid only when
            SSLCOMMERZ confirms it to our server and the amount, currency and transaction id
            all match our own record.
          </p>
        </div>

        {/* ---------- Refunds ---------- */}
        {order.refunds.length > 0 && (
          <div>
            <div className="sec"><h3>Refunds</h3></div>
            <div className="list">
              {order.refunds.map((r) => (
                <div key={r.id} className="row">
                  <div className="row-main">
                    <div className="row-t">{bdt(r.amountBdt)}</div>
                    <div className="row-s">{r.reason}</div>
                    <div className="row-s dim">{shortDate(r.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <OrderActions
          order={{
            id: order.id,
            number: order.number,
            status: order.status,
            totalBdt: order.totalBdt,
            refundedBdt: refunded,
            billingName: order.billingName ?? '',
            billingEmail: order.billingEmail,
            billingPhone: order.billingPhone ?? '',
            billingCountry: order.billingCountry ?? '',
            adminNote: order.adminNote ?? '',
          }}
          items={order.items
            .filter((i) => i.beatId)
            .map((i) => ({ id: i.id, title: i.titleSnapshot }))}
          licences={order.licences.map((l) => ({ id: l.id, number: l.number, hasPdf: Boolean(l.pdfObjectKey) }))}
          grants={grants.map((g) => ({
            id: g.id,
            item: order.items.find((i) => i.id === g.orderItemId)?.titleSnapshot ?? 'Item',
            expiresAt: shortDate(g.expiresAt),
            attempts: g.attempts,
            maxAttempts: g.maxAttempts,
            dead: Boolean(g.revokedAt) || g.expiresAt < new Date(),
          }))}
          nextStatuses={nextStatuses(order.status)}
        />
      </div>
    </>
  );
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  const inner = (
    <>
      <div className="row-main">
        <div className="row-s" style={{ marginTop: 0 }}>{k}</div>
        <div className="row-t" style={{ whiteSpace: 'normal' }}>{v}</div>
      </div>
    </>
  );
  // A tappable email or phone number is worth the extra element: on a phone
  // this is how a stuck delivery actually gets chased.
  return href ? <a className="row" href={href}>{inner}</a> : <div className="row">{inner}</div>;
}
