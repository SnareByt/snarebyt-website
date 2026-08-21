import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { paymentsConfigured } from '@/lib/sslcommerz';
import { codeState } from '@/lib/discount-rules';
import { CodeEditor, NewCode, type CodeRow } from './Editor';
import { createDiscount, updateDiscount, toggleDiscount, deleteDiscount } from './actions';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

export default async function AdminDiscountsPage() {
  await requireAdmin();

  const codes = await prisma.discountCode.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { orders: true } } },
  });

  const rows: CodeRow[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    percentOff: c.percentOff,
    amountOffBdt: c.amountOffBdt,
    minSpendBdt: c.minSpendBdt,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    startsAt: day(c.startsAt),
    endsAt: day(c.endsAt),
    active: c.active,
    orders: c._count.orders,
    state: codeState(c),
  }));

  const working = rows.filter((r) => r.state === 'live').length;

  // What the codes have actually cost, from the orders themselves rather than
  // from the codes — only a paid order really gave money away.
  const given = await prisma.order.aggregate({
    where: { status: 'PAID', discountBdt: { gt: 0 } },
    _sum: { discountBdt: true },
    _count: true,
  });

  return (
    <>
      <header><div><div className="crumb">Business</div><h1>Discount codes</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{rows.length} {rows.length === 1 ? 'code' : 'codes'}</h2>
          <span className={`chip ${working ? 'ok' : 'off'}`}>
            {working ? `${working} working now` : 'None working'}
          </span>
          {given._count ? (
            <span className="chip">
              ৳{(given._sum.discountBdt ?? 0).toLocaleString('en-US')} given away · {given._count} orders
            </span>
          ) : null}
          <span className="sp" />
          <NewCode action={createDiscount} />
        </div>

        {!paymentsConfigured() ? (
          <div className="note">
            <span>⚠</span>
            <span>
              <b>SSLCOMMERZ is not configured, so nothing can be paid online yet.</b> Codes still
              apply to the order total, but a code is only counted as used once a payment clears.
            </span>
          </div>
        ) : null}

        {rows.length ? (
          rows.map((r) => (
            <CodeEditor
              key={r.id} row={r}
              save={updateDiscount} toggle={toggleDiscount} remove={deleteDiscount}
            />
          ))
        ) : (
          <div className="card pad">
            <p className="sub" style={{ marginBottom: '.9rem' }}>
              No discount codes yet. Make one and customers can type it in the cart — the reduction
              is worked out on the server, so a code cannot be faked from a browser.
            </p>
            <NewCode action={createDiscount} />
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✓</span>
          <span>
            <b>A code counts as used when the payment clears, not when someone adds it to a cart.</b>{' '}
            That stops anyone burning a limited code by filling a cart and walking away, and it
            means &ldquo;used 12 of 50&rdquo; is 12 real sales. Orders already paid keep the
            discount they were given — switching a code off never changes a receipt.
          </span>
        </div>
      </div>
    </>
  );
}
