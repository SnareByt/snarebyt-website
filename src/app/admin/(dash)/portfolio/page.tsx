import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  PRODUCED_BY_SNAREBYT: 'Produced by SnareByt',
  MIXED_AND_MASTERED_BY_SNAREBYT: 'Mixed & Mastered by SnareByt',
  SNAREBYT_RELEASES: 'SnareByt Releases',
  SELECTED_VISUAL_WORK: 'Selected Visual Work',
};

export default async function AdminPortfolioPage() {
  await requireAdmin();
  const items = await prisma.portfolioItem.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  return (
    <>
      <header><div><div className="crumb">Catalogue</div><h1>Portfolio</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{items.length} credits</h2>
          <span className="chip ok">{items.filter((i) => i.published).length} published</span>
          <span className="chip red">{items.filter((i) => i.majorCredit).length} major</span>
        </div>

        {items.length ? (
          <table>
            <thead>
              <tr><th>Title</th><th>Role</th><th>Category</th><th>Client</th><th>Link</th><th>Status</th></tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="ttl">{p.title}</div>
                    {p.majorCredit ? <span className="chip red">Major credit</span> : null}
                  </td>
                  {/* Role is a required column. A credit that does not say what
                      SnareByt did is the one thing this screen must never show. */}
                  <td><span className="chip">{p.role}</span></td>
                  <td className="sub">{LABEL[p.category] ?? p.category}</td>
                  <td className="sub">{p.clientName ?? '—'}</td>
                  <td>
                    {p.externalUrl
                      ? <span className="chip ok">{p.ctaLabel ?? 'Open'}</span>
                      : <span className="chip warn">No link yet</span>}
                  </td>
                  <td>
                    <span className={`chip ${p.published ? 'ok' : 'off'}`}>
                      {p.published ? 'Published' : 'Hidden'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note"><span>▣</span><span>No portfolio credits yet.</span></div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✎</span>
          <span>
            <b>This screen is read-only for now.</b> Adding and editing credits from here is not
            built yet — the public page renders correctly from these rows in the meantime. Every
            credit states its exact role, which is what stops a mix ever reading as a production
            credit.
          </span>
        </div>
      </div>
    </>
  );
}
