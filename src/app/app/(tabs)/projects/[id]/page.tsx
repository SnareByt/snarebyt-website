import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { projectChip, shortDate, ago, fileSize } from '@/lib/app-format';
import { PROJECT_LABEL, nextProjectStatuses, revisionNote } from '@/lib/project-rules';
import { ProjectActions } from './ProjectActions';

export const dynamic = 'force-dynamic';

/**
 * One booked job.
 *
 * The brief the client wrote comes before anything Samir can change. On a
 * phone, the reason to open this screen is nearly always "what did they
 * actually ask for?" — burying that under a row of buttons would mean
 * scrolling past the controls every single time.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      service: { select: { title: true } },
      serviceTier: { select: { name: true, priceBdt: true } },
      order: { select: { id: true, number: true, status: true, totalBdt: true } },
      files: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!project) notFound();

  const facts = {
    status: project.status,
    deliverableCount: project.files.filter((f) => f.isDeliverable).length,
    revisionsUsed: project.revisionsUsed,
    revisionsAllowed: project.revisionsAllowed,
  };

  const fromStudio = project.files.filter((f) => f.uploadedBy === 'STUDIO');
  const fromCustomer = project.files.filter((f) => f.uploadedBy === 'CUSTOMER');

  return (
    <>
      <NavBar title={project.number} back="/app/projects" />

      <div className="big-title">
        <h2>{project.projectTitle || project.contactName}</h2>
        <p>
          <span className={`chip ${projectChip(project.status)}`}>
            {PROJECT_LABEL[project.status]}
          </span>
          {' '}· {project.service.title}
          {project.serviceTier ? ` · ${project.serviceTier.name}` : ''}
        </p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- The brief ---------- */}
        <div>
          <div className="sec"><h3>What they asked for</h3></div>
          <div className="card card-pad selectable"
               style={{ fontSize: '.9rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {project.description}
          </div>
          {project.desiredStyle && (
            <p className="hint" style={{ padding: '.5rem .3rem 0' }}>
              <b>Style wanted:</b> {project.desiredStyle}
            </p>
          )}
        </div>

        {/* ---------- References ---------- */}
        {project.referenceLinks.length > 0 && (
          <div>
            <div className="sec"><h3>Reference tracks</h3></div>
            <div className="list">
              {project.referenceLinks.map((url) => (
                <a
                  key={url}
                  className="row"
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <div className="row-main">
                    <div className="row-t" style={{ color: 'var(--red-b)' }}>
                      {hostOf(url)}
                    </div>
                    <div className="row-s">{url}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Client ---------- */}
        <div>
          <div className="sec"><h3>Client</h3></div>
          <div className="list selectable">
            <Row k="Name" v={project.contactName} />
            {project.artistName && <Row k="Records as" v={project.artistName} />}
            <Row k="Email" v={project.email} href={`mailto:${project.email}`} />
            {project.phone && <Row k="Phone" v={project.phone} href={`tel:${project.phone}`} />}
            {project.country && <Row k="Country" v={project.country} />}
            {project.genre && <Row k="Genre" v={project.genre} />}
            {project.formatsWanted && <Row k="Formats wanted" v={project.formatsWanted} />}
          </div>
        </div>

        {/* ---------- Commercials ---------- */}
        <div>
          <div className="sec"><h3>The job</h3></div>
          <div className="list">
            {project.order ? (
              <Row
                k="Order"
                v={`${project.order.number} · ${bdt(project.order.totalBdt)} · ${project.order.status.replace(/_/g, ' ').toLowerCase()}`}
                href={`/app/orders/${project.order.id}`}
              />
            ) : (
              <Row k="Order" v="Not linked to an order" />
            )}
            {project.serviceTier && <Row k="Package" v={`${project.serviceTier.name} · ${bdt(project.serviceTier.priceBdt)}`} />}
            {project.budgetBdt != null && <Row k="Their budget" v={bdt(project.budgetBdt)} />}
            <Row k="Deadline" v={project.deadline ? shortDate(project.deadline) : 'None agreed'} />
            <Row k="Revisions" v={revisionNote(facts) ?? '—'} />
            <Row k="Booked" v={`${shortDate(project.createdAt)} · ${ago(project.createdAt)}`} />
          </div>
        </div>

        {/* ---------- Their uploads ---------- */}
        {fromCustomer.length > 0 && (
          <div>
            <div className="sec"><h3>Files they sent</h3></div>
            <div className="list">
              {fromCustomer.map((f) => (
                <div key={f.id} className="row">
                  <div className="row-main">
                    <div className="row-t">{f.filename}</div>
                    <div className="row-s">
                      {fileSize(f.bytes)} · {ago(f.createdAt)}
                      {f.scanned ? ` · ${f.scanResult}` : ' · not scanned'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ProjectActions
          project={{
            id: project.id,
            number: project.number,
            status: project.status,
            notes: project.notes ?? '',
            deadline: project.deadline ? project.deadline.toISOString().slice(0, 10) : '',
            contactName: project.contactName,
            email: project.email,
          }}
          files={fromStudio.map((f) => ({
            id: f.id,
            filename: f.filename,
            label: f.label,
            bytes: fileSize(f.bytes),
            isDeliverable: f.isDeliverable,
            createdAt: ago(f.createdAt),
          }))}
          nextStatuses={nextProjectStatuses(facts).map((s) => ({ key: s, label: PROJECT_LABEL[s] }))}
          canDeliver={facts.deliverableCount > 0}
        />

        {/* ---------- History ---------- */}
        {project.events.length > 0 && (
          <div>
            <div className="sec"><h3>History</h3></div>
            <div className="list">
              {project.events.map((e) => (
                <div key={e.id} className="row">
                  <div className="row-main">
                    <div className="row-t">{PROJECT_LABEL[e.status]}</div>
                    {e.note && <div className="row-s" style={{ whiteSpace: 'normal' }}>{e.note}</div>}
                    <div className="row-s dim">{shortDate(e.createdAt)} · {ago(e.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="hint" style={{ padding: '0 .3rem' }}>
              Every status change is kept. This is the answer to &ldquo;when did I send the
              first preview?&rdquo; when a client says they have been waiting.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function hostOf(url: string) {
  // A malformed reference link is the client's typo, not a reason to crash the
  // whole screen — fall back to showing the raw string.
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  const inner = (
    <div className="row-main">
      <div className="row-s" style={{ marginTop: 0 }}>{k}</div>
      <div className="row-t" style={{ whiteSpace: 'normal' }}>{v}</div>
    </div>
  );
  return href ? <a className="row" href={href}>{inner}</a> : <div className="row">{inner}</div>;
}
