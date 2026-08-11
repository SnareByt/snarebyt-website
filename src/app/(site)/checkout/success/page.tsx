import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHead } from '@/components/site/PageHead';
import { ClearCartOnMount } from '@/components/site/ClearCartOnMount';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Payment received — SnareByt',
  robots: { index: false, follow: false },
};

/**
 * Where SSLCOMMERZ returns the buyer after a successful payment.
 *
 * This page reports; it never decides. Landing here proves only that a browser
 * followed a redirect — the order is marked paid by the IPN, server to server,
 * after the transaction has been re-validated with SSLCOMMERZ. So the status
 * shown is read from our own record, and if the IPN has not landed yet the
 * page says "confirming" rather than claiming success.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: { searchParams: Promise<{ tran_id?: string }> }) {
  const sp = await searchParams;
  const tranId = sp.tran_id;

  const payment = tranId
    ? await prisma.payment.findUnique({ where: { tranId }, include: { order: true } })
    : null;

  const paid = payment?.order.status === 'PAID';
  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });
  const number = (wa?.value ?? '').replace(/[^0-9]/g, '');

  return (
    <>
      <ClearCartOnMount />
      <PageHead
        eyebrow="Checkout"
        h1={paid ? 'Payment' : 'Almost'}
        h2={paid ? 'received' : 'there'}
        lead={paid
          ? 'Your payment has been verified with SSLCOMMERZ.'
          : 'Your payment went through at the gateway. We are waiting for its confirmation to reach us — this usually takes a few seconds.'}
      />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="card" style={{ padding: '2rem', maxWidth: 620 }}>
            {payment?.order ? (
              <>
                <div className="eyebrow">Order</div>
                <h2 className="display" style={{ margin: '.8rem 0' }}>{payment.order.number}</h2>
                <div className="kv">
                  <dt>Amount</dt><dd>৳{payment.amountBdt.toLocaleString('en-US')}</dd>
                  <dt>Status</dt><dd>{paid ? 'Paid' : 'Confirming'}</dd>
                </div>
              </>
            ) : (
              <p className="lead">
                We could not match this to an order. If you were charged, message on WhatsApp with
                your transaction id and it will be sorted immediately.
              </p>
            )}

            <p className="lead" style={{ marginTop: '1.4rem' }}>
              {paid
                ? 'SnareByt will send your files shortly. Keep your order number.'
                : 'You do not need to pay again. Refresh in a moment, or message on WhatsApp if it stays like this.'}
            </p>

            <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
              {number ? (
                <a
                  className="btn btn-red"
                  href={`https://wa.me/${number}?text=${encodeURIComponent(
                    `Hi SnareByt — order ${payment?.order.number ?? ''} just paid.`)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  Message on WhatsApp →
                </a>
              ) : null}
              <Link href="/beats" className="btn btn-ghost">Back to the store</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
