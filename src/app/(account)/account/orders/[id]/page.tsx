import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { getOrder, listGrants, getOverview } from '@/lib/account-data';
import { bdt, usd } from '@/lib/money';
import { PortalNav } from '@/components/account/PortalNav';
import { OrderPill, ProjectPill, when, relative } from '@/components/account/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order — SnareByt',
  robots: { index: false, follow: false },
};

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentAccount();
  if (!me) redirect(`/account/login?next=/account/orders/${id}`);

  // getOrder scopes by userId, so somebody else's order id is indistinguishable
  // from one that does not exist. That is the intended answer — confirming a
  // real order exists but belongs to someone else is itself a disclosure.
  const order = await getOrder(me.id, id);
  if (!order) notFound();

  const [grants, { unread }] = await Promise.all([listGrants(me.id, id), getOverview(me.id)]);
  const rate = order.usdRateAtSale ?? 0;

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">
            <Link href="/account/orders" style={{ color: 'inherit' }}>← Orders</Link>
          </div>
          <h1>{order.number}</h1>
          <p>
            Placed {when(order.createdAt)}
            {order.paidAt ? ` · paid ${when(order.paidAt)}` : ''}
          </p>
        </div>
        <OrderPill status={order.status} />
      </div>

      <PortalNav unread={unread} />

      <div className="pt-split">
        <div>
          <div className="pt-panel">
            <h3>What you bought</h3>
            <div className="pt-list">
              {order.items.map((i) => (
                <div key={i.id} className="pt-row">
                  <div>
                    <div className="t">{i.titleSnapshot}</div>
                    <div className="s">
                      {i.licenceTier ? i.licenceTier.filesLabel : i.serviceTier?.service.title}
                      {i.licence ? (
                        <> · Licence <span className="mono">{i.licence.number}</span></>
                      ) : null}
                    </div>
                  </div>
                  <div className="r">{bdt(i.priceBdt)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Downloads only exist once money has actually arrived, so this
              block is absent rather than disabled on an unpaid order. */}
          {order.status === 'PAID' && (
            <div className="pt-panel">
              <h3>Your files</h3>
              {grants.length === 0 ? (
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.65 }}>
                  Your download link was emailed when the payment cleared. If it has expired or
                  been used up, message SnareByt and a fresh one is issued straight away — your
                  purchase still stands.
                </p>
              ) : (
                <div className="pt-list">
                  {grants.map((g) => (
                    <div key={g.id} className="pt-row">
                      <div>
                        <div className="t">{g.title}</div>
                        <div className="s">
                          Expires {when(g.expiresAt)} ({relative(g.expiresAt)}) ·{' '}
                          {g.remaining} {g.remaining === 1 ? 'download' : 'downloads'} left
                        </div>
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: '.76rem', color: 'var(--dim)', lineHeight: 1.6, marginTop: '.3rem' }}>
                    Download links are sent by email and are deliberately not shown in full here —
                    a link that opens a purchase should not be sitting on a screen anyone could
                    photograph.
                  </p>
                </div>
              )}
            </div>
          )}

          {order.projects.length > 0 && (
            <div className="pt-panel">
              <h3>Projects from this order</h3>
              <div className="pt-list">
                {order.projects.map((p) => (
                  <Link key={p.id} href={`/account/projects/${p.id}`} className="pt-row">
                    <div>
                      <div className="t">{p.number} <ProjectPill status={p.status} /></div>
                    </div>
                    <div className="r" style={{ fontSize: '.8rem', fontWeight: 400, color: 'var(--dim)' }}>Open →</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="pt-panel">
            <h3>Total</h3>
            <dl className="pt-kv">
              <dt>Subtotal</dt><dd>{bdt(order.subtotalBdt)}</dd>
              {order.discountBdt > 0 && (<><dt>Discount</dt><dd>−{bdt(order.discountBdt)}</dd></>)}
              <dt>Paid</dt>
              <dd>
                <b>{bdt(order.totalBdt)}</b>
                {/* The rate is the one frozen at the sale, not today's — a
                    receipt that changes value over time is not a receipt. */}
                {rate > 0 && (
                  <span style={{ color: 'var(--dim)' }}> · {usd(order.totalBdt, rate)} at the time</span>
                )}
              </dd>
            </dl>
          </div>

          {order.payments.length > 0 && (
            <div className="pt-panel">
              <h3>Payment</h3>
              <dl className="pt-kv">
                {order.payments.map((p) => (
                  <div key={p.id} style={{ display: 'contents' }}>
                    <dt>{p.cardType || 'Paid'}</dt>
                    <dd>
                      {bdt(p.amountBdt)}
                      <div style={{ fontSize: '.7rem', color: 'var(--dim)' }}>
                        {when(p.createdAt)} · <span className="mono">{p.tranId}</span>
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="pt-panel">
            <h3>Billed to</h3>
            <dl className="pt-kv">
              <dt>Name</dt><dd>{order.billingName ?? '—'}</dd>
              {order.artistName && (<><dt>Artist</dt><dd>{order.artistName}</dd></>)}
              <dt>Email</dt><dd>{order.billingEmail}</dd>
              {order.billingPhone && (<><dt>Phone</dt><dd>{order.billingPhone}</dd></>)}
              {order.billingCountry && (<><dt>Country</dt><dd>{order.billingCountry}</dd></>)}
            </dl>
          </div>

          {order.customerNote && (
            <div className="pt-panel">
              <h3>Your note</h3>
              <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {order.customerNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
