import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { listProjects, getOverview } from '@/lib/account-data';
import { PortalNav } from '@/components/account/PortalNav';
import { ProjectPill, Empty, when, relative } from '@/components/account/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your projects — SnareByt',
  robots: { index: false, follow: false },
};

export default async function ProjectsPage() {
  const me = await currentAccount();
  if (!me) redirect('/account/login?next=/account/projects');

  const [projects, { unread }] = await Promise.all([listProjects(me.id), getOverview(me.id)]);

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">Artist account</div>
          <h1>Projects</h1>
          <p>Status, deadlines, files and everything said about the work.</p>
        </div>
      </div>

      <PortalNav unread={unread} />

      {projects.length === 0 ? (
        <Empty title="No projects yet">
          Book mixing, mastering or cover art and the project appears here — with its status,
          your reference files and every version SnareByt sends back.
          <div style={{ marginTop: '1.2rem' }}>
            <Link href="/services" className="btn btn-red btn-sm">See the services</Link>
          </div>
        </Empty>
      ) : (
        <div className="pt-list">
          {projects.map((p) => (
            <Link key={p.id} href={`/account/projects/${p.id}`} className="pt-row">
              <div>
                <div className="t">
                  {p.title}
                  <ProjectPill status={p.status} />
                  {p.unreadFromStudio > 0 && (
                    <span className="pill red">{p.unreadFromStudio} new</span>
                  )}
                </div>
                <div className="s">
                  {p.number} · {p.serviceTitle} · {p.fileCount} {p.fileCount === 1 ? 'file' : 'files'}
                  {p.deliverableCount > 0 && ` (${p.deliverableCount} from the studio)`}
                  {p.deadline ? ` · due ${when(p.deadline)}` : ''}
                </div>
              </div>
              <div className="r" style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--dim)' }}>
                {p.deadline ? relative(p.deadline) : `updated ${relative(p.updatedAt)}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
