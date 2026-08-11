import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHead } from '@/components/site/PageHead';

export const metadata: Metadata = {
  title: 'Payment cancelled — SnareByt',
  robots: { index: false, follow: false },
};

/** Cancelling is a normal choice, not an error. The cart is left untouched. */
export default function CheckoutCancelledPage() {
  return (
    <>
      <PageHead
        eyebrow="Checkout"
        h1="Payment"
        h2="cancelled"
        lead="You stopped before paying, so nothing has been charged and your cart is exactly as you left it."
      />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="card" style={{ padding: '2rem', maxWidth: 620 }}>
            <p className="lead">
              Your order is saved either way — if you would rather arrange payment directly, the
              contact page reaches SnareByt.
            </p>
            <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
              <Link href="/cart" className="btn btn-red">Back to your cart →</Link>
              <Link href="/beats" className="btn btn-ghost">Keep browsing</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
