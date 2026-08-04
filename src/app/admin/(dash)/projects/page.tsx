import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';

export const dynamic = 'force-dynamic';

const CHIP: Record<string, string> = {
  ORDER_RECEIVED: 'warn', PAYMENT_CONFIRMED: 'info', FILES_RECEIVED: 'info',
  IN_PROGRESS: 'info', FIRST_PREVIEW_READY: 'info', REVISION_REQUESTED: 'warn',
  FINALISING: 'info', COMPLETED: 'ok', DELIVERED: 'ok',
};

export default async function AdminProjectsPage() {
  await requireAdmin();
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: { service: { select: { title: true } }, serviceTier: { select: { name: true } } },
    take: 100,
  });

  const open = projects.filter((p) => p.status !== 'DELIVERED').length;

  return (
    <>
      <header><div><div className="crumb">Business</div><h1>Projects</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{projects.length} projects</h2>
          <span className={`chip ${open ? 'warn' : 'ok'}`}>{open} needing you</span>
        </div>

        {projects.length ? (
          <table>
            <thead>
              <tr><th>Ref</th><th>Client</th><th>Service</th><th>Brief</th><th>Budget</th>
                <th>Status</th><th>Received</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td><div className="ttl mono">{p.number}</div></td>
                  <td>
                    {p.contactName}
                    <div className="sub">{p.artistName ? `${p.artistName} · ` : ''}{p.email}</div>
                  </td>
                  <td>{p.service.title}<div className="sub">{p.serviceTier?.name ?? 'No package chosen'}</div></td>
                  <td className="sub">{p.description.slice(0, 70)}…</td>
                  <td>{p.budgetBdt ? bdt(p.budgetBdt) : '—'}</td>
                  <td><span className={`chip ${CHIP[p.status] ?? 'off'}`}>{p.status.replace(/_/g, ' ')}</span></td>
                  <td className="sub">{p.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note">
            <span>◈</span>
            <span>
              <b>No project briefs yet.</b> The contact form is live — anything submitted there
              lands here immediately, with its own reference number.
            </span>
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✎</span>
          <span>
            <b>Read-only for now.</b> Moving a project through its stages, messaging the client and
            delivering files are not built yet. Briefs arriving from the website are captured in
            full, so nothing is lost in the meantime.
          </span>
        </div>
      </div>
    </>
  );
}
