import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { checkDownload, REASON_TEXT } from '@/lib/download';
import { PageHead } from '@/components/site/PageHead';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your download — SnareByt',
  // A download link must never reach an index, and a crawler following one
  // would burn the buyer's attempts on their behalf.
  robots: { index: false, follow: false, nocache: true },
};

const size = (bytes: number) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/**
 * Where a paid buyer collects their files.
 *
 * Opening this page costs nothing — the attempt counter only moves when a file
 * is actually fetched, so someone who clicks the link twice to check it still
 * works has not quietly spent their downloads.
 */
export default async function DownloadPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await checkDownload(token);

  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });
  const number = (wa?.value ?? '').replace(/[^0-9]/g, '');

  if (!res.ok) {
    return (
      <>
        <PageHead
          eyebrow="Download"
          h1="Link"
          h2="not available"
          lead={REASON_TEXT[res.reason]}
        />
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="card" style={{ padding: '2rem', maxWidth: 620 }}>
              <p className="lead">
                Nothing is lost. A licence you have paid for does not expire just because a
                link did — ask and a new one will be issued.
              </p>
              <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.6rem' }}>
                {number ? (
                  <a className="btn btn-red" href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer">
                    Message SnareByt →
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

  return (
    <>
      <PageHead
        eyebrow="Download"
        h1={res.beatTitle}
        h2="is yours"
        lead={`${res.tierName} · order ${res.orderNumber}. Save these files somewhere safe — the link does not last forever, but your licence does.`}
      />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="card" style={{ padding: '1.8rem', maxWidth: 680 }}>
            <div className="rule-eyebrow">Your files</div>

            <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
              {res.files.map((f) => (
                <div className="cart-row" key={f.assetId} style={{ margin: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ttl">{f.label}</div>
                    <div className="sub">{size(f.bytes)}</div>
                  </div>
                  {/* A plain link, not a fetch: the route redirects to a signed
                      R2 URL and the browser downloads straight from R2. */}
                  <a className="btn btn-red btn-sm" href={`/download/${token}/file/${f.assetId}`}>
                    Download
                  </a>
                </div>
              ))}
            </div>

            <div className="hairline" style={{ margin: '1.6rem 0 1.1rem' }} />

            <dl className="spec" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <div>
                <dt>Link expires</dt>
                <dd>{res.expiresAt.toISOString().slice(0, 10)}</dd>
              </div>
              <div>
                <dt>Downloads left</dt>
                <dd>{res.remaining}</dd>
              </div>
            </dl>

            <p className="note" style={{ marginTop: '1.4rem' }}>
              Do not share this link — anyone who has it can take your files, and the
              downloads come out of your allowance. If you run out, ask for a new link.
            </p>

            {number ? (
              <a
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '1rem' }}
                href={`https://wa.me/${number}?text=${encodeURIComponent(`Hi SnareByt — about order ${res.orderNumber}.`)}`}
                target="_blank" rel="noopener noreferrer"
              >
                Something wrong? Message SnareByt
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
