import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { LegalEditor, NewLegalPage, type LegalRow } from './LegalEditor';
import { saveLegalPage, createLegalPage } from './actions';

export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminLegalPage() {
  await requireAdmin();

  const pages = await prisma.legalPage.findMany({ orderBy: { slug: 'asc' } });
  const rows: LegalRow[] = pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    bodyMarkdown: p.bodyMarkdown,
    version: p.version,
    effectiveFrom: day(p.effectiveFrom),
    lawyerReviewNeeded: p.lawyerReviewNeeded,
    updatedAt: day(p.updatedAt),
  }));

  const unreviewed = rows.filter((r) => r.lawyerReviewNeeded).length;

  return (
    <>
      <header><div><div className="crumb">Content</div><h1>Legal pages</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{rows.length} {rows.length === 1 ? 'page' : 'pages'}</h2>
          {unreviewed
            ? <span className="chip warn">{unreviewed} awaiting lawyer review</span>
            : <span className="chip ok">All reviewed</span>}
          <span className="sp" />
          <NewLegalPage action={createLegalPage} />
        </div>

        {rows.length ? (
          rows.map((p) => <LegalEditor key={p.id} page={p} action={saveLegalPage} />)
        ) : (
          <div className="card pad">
            <p className="sub" style={{ marginBottom: '.8rem' }}>
              No legal pages yet. The cart asks buyers to accept licence terms, so at minimum
              there should be something for that checkbox to point at.
            </p>
            <NewLegalPage action={createLegalPage} />
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>⚖</span>
          <span>
            <b>These are not legal advice and nothing here writes them for you.</b> Whatever you
            type is what your customers are held to, so a real lawyer should read them before you
            take money. Pages can be added and edited but never deleted from here — a term
            somebody already accepted has to stay readable.
          </span>
        </div>
      </div>
    </>
  );
}
