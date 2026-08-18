import Link from 'next/link';

/**
 * The beat store, closed.
 *
 * Shown instead of the store while the catalogue is being prepared. No cards,
 * no empty grid, no skeletons pretending something is loading — a single
 * statement, centred, with somewhere to go next so a visitor who arrived
 * wanting to buy is not simply dead-ended.
 *
 * The light sweep across the wordmark is the site's existing motion language,
 * so the same idea carries the headline here: one slow pass, nothing blinking.
 */
export function ComingSoon({ whatsapp }: { whatsapp?: string }) {
  return (
    <section className="blk cs-blk" aria-label="Beat store — coming soon">
      <div className="wrap">
        <div className="cs-panel">
          <span className="cs-aura" aria-hidden="true" />

          <div className="cs-in">
            <div className="cs-eyebrow">
              <span className="cs-dot" aria-hidden="true" />
              The beat store
            </div>

            <h2 className="cs-title">
              <span className="cs-text">Coming soon</span>
            </h2>

            <p className="cs-lead">
              The catalogue is being finished — every beat mastered, tagged and licensed properly
              before a single one goes on sale.
            </p>
            <p className="cs-bn bn">
              বিট স্টোর শীঘ্রই আসছে। প্রতিটি বিট সঠিকভাবে প্রস্তুত করে তবেই বিক্রির জন্য রাখা হবে।
            </p>

            <div className="cs-cta">
              <Link href="/services" className="btn btn-red">See what I offer →</Link>
              {whatsapp ? (
                <a
                  className="btn btn-ghost"
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                    'Hi SnareByt — let me know when the beat store opens.')}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  Tell me when it opens
                </a>
              ) : (
                <Link href="/contact" className="btn btn-ghost">Get in touch</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
