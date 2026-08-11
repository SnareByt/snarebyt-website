import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHead } from '@/components/site/PageHead';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Payment failed — SnareByt',
  robots: { index: false, follow: false },
};

/** The cart is deliberately left intact so the buyer can just try again. */
export default async function CheckoutFailedPage({
  searchParams,
}: { searchParams: Promise<{ tran_id?: string }> }) {
  const sp = await searchParams;
  const payment = sp.tran_id
    ? await prisma.payment.findUnique({ where: { tranId: sp.tran_id }, include: { order: true } })
    : null;

  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });
  const number = (wa?.value ?? '').replace(/[^0-9]/g, '');

  return (
    <>
      <PageHead
        eyebrow="Checkout"
        h1="Payment"
        h2="did not go through"
        lead="Nothing has been charged. Your cart is still here, so you can try again straight away."
      />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="card" style={{ padding: '2rem', maxWidth: 620 }}>
            {payment?.order ? (
              <>
                <div className="eyebrow">Order</div>
                <h2 className="display" style={{ margin: '.8rem 0' }}>{payment.order.number}</h2>
              </>
            ) : null}
            <p className="lead">
              A payment can fail for ordinary reasons — a declined card, a timeout, or not enough
              balance in a mobile wallet. None of them mean anything is wrong with your order.
            </p>
            <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
              <Link href="/cart" className="btn btn-red">Back to your cart →</Link>
              {number ? (
                <a className="btn btn-ghost" href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer">
                  Get help on WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
