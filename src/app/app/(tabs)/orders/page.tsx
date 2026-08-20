import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';
import { Filter } from '@/components/app/Filter';
import { orderChip, humanStatus, ago } from '@/lib/app-format';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { key: 'PAID', label: 'Paid' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'dead', label: 'Failed' },
] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter = 'all' } = await searchParams;

  const where: Prisma.OrderWhereInput =
    filter === 'PENDING_PAYMENT' ? { status: 'PENDING_PAYMENT' }
    : filter === 'PAID' ? { status: 'PAID' }
    : filter === 'refunded' ? { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } }
    : filter === 'dead' ? { status: { in: ['FAILED', 'CANCELLED'] } }
    // The default view hides CART rows. An abandoned basket is not an order
    // and putting them in this list would bury the ones that need a decision.
    : { status: { not: 'CART' } };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      items: { select: { titleSnapshot: true } },
      refunds: { select: { amountBdt: true } },
    },
  });

  const pending = orders.filter((o) => o.status === 'PENDING_PAYMENT');

  return (
    <>
      <NavBar title="Orders" />

      <div className="big-title">
        <h2>Orders</h2>
        <p>{orders.length} shown · newest first</p>
      </div>

      <Filter options={FILTERS} active={filter} basePath="/app/orders" />

      <div className="wrap stack" style={{ marginTop: '.9rem' }}>
        {filter === 'PENDING_PAYMENT' && pending.length > 0 && (
          <div className="note warn">
            <b>Nothing here is paid yet.</b>
            <br />
            There is no &ldquo;mark as paid&rdquo; button on purpose. If a customer says they
            paid, the payment is re-validated with SSLCOMMERZ rather than taken on trust.
          </div>
        )}

        {orders.length ? (
          <div className="list">
            {orders.map((o) => {
              const refunded = o.refunds.reduce((n, r) => n + r.amountBdt, 0);
              return (
                <Link key={o.id} href={`/app/orders/${o.id}`} className="row">
                  <div className="row-main">
                    <div className="row-t">
                      {o.billingName || o.guestName || o.billingEmail}
                    </div>
                    <div className="row-s">
                      {o.items.map((i) => i.titleSnapshot).join(', ') || 'No items'}
                    </div>
                    <div className="row-s mono" style={{ color: 'var(--dim)' }}>
                      {o.number} · {ago(o.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="row-v">{bdt(o.totalBdt)}</div>
                    {refunded > 0 && (
                      <div className="row-s" style={{ color: '#ff9aa8' }}>
                        −{bdt(refunded)}
                      </div>
                    )}
                    <div style={{ marginTop: '.2rem' }}>
                      <span className={`chip ${orderChip(o.status)}`}>{humanStatus(o.status)}</span>
                    </div>
                  </div>
                  <span className="row-x"><IcNext /></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="list">
            <div className="empty">Nothing matches this filter.</div>
          </div>
        )}
      </div>
    </>
  );
}
