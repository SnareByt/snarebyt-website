import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { parseYouTubeId } from '@/lib/spotify';
import PortfolioForm from './PortfolioForm';
import { PublishToggle } from './PublishToggle';

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
          <span className="sp" />
          <PortfolioForm mode="create" />
        </div>

        {items.length ? (
          <table>
            <thead>
              <tr><th>Title</th><th>Role</th><th>Category</th><th>Client</th><th>Link</th><th>Video</th><th>Status</th><th /></tr>
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
                    {/* A credit with a YouTube link needs no artwork upload —
                        the still, the view count and the player all come from
                        the id. This column says whether that has happened. */}
                    {(parseYouTubeId(p.videoUrl) ?? parseYouTubeId(p.externalUrl))
                      ? <span className="chip ok">Auto artwork</span>
                      : <span className="sub">—</span>}
                  </td>
                  <td>
                    <span className={`chip ${p.published ? 'ok' : 'off'}`}>
                      {p.published ? 'Published' : 'Hidden'}
                    </span>
                  </td>
                  <td className="acts">
                    <div style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
                      <PortfolioForm
                        mode="edit"
                        item={{
                          id: p.id,
                          title: p.title,
                          clientName: p.clientName ?? '',
                          category: p.category,
                          role: p.role,
                          externalUrl: p.externalUrl ?? '',
                          videoUrl: p.videoUrl ?? '',
                          ctaLabel: p.ctaLabel ?? 'Listen',
                          majorCredit: p.majorCredit,
                          summary: p.summary,
                          published: p.published,
                        }}
                      />
                      <PublishToggle id={p.id} published={p.published} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note"><span>▣</span><span>No portfolio credits yet.</span></div>
        )}

      </div>
    </>
  );
}
