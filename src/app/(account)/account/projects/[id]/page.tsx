import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { getProject, getOverview } from '@/lib/account-data';
import { fileSize } from '@/lib/beat-files';
import { bdt } from '@/lib/money';
import { PortalNav } from '@/components/account/PortalNav';
import { ProjectPill, when, relative } from '@/components/account/bits';
import { markRead } from '../actions';
import { FileZone, MessageBox } from './Client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Project — SnareByt',
  robots: { index: false, follow: false },
};

/** The order a project moves through, so the timeline can show what is next. */
const FLOW = [
  'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'FILES_RECEIVED', 'IN_PROGRESS',
  'FIRST_PREVIEW_READY', 'REVISION_REQUESTED', 'FINALISING', 'COMPLETED', 'DELIVERED',
] as const;

const STEP_LABEL: Record<string, string> = {
  ORDER_RECEIVED: 'Order received',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  FILES_RECEIVED: 'Your files received',
  IN_PROGRESS: 'Work in progress',
  FIRST_PREVIEW_READY: 'First preview ready',
  REVISION_REQUESTED: 'Revision requested',
  FINALISING: 'Finalising',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
};

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentAccount();
  if (!me) redirect(`/account/login?next=/account/projects/${id}`);

  const project = await getProject(me.id, id);
  if (!project) notFound();

  // Opening the page is what counts as reading it.
  await markRead(id);

  const { unread } = await getOverview(me.id);

  const mine = project.files.filter((f) => f.uploadedBy === 'CUSTOMER');
  const theirs = project.files.filter((f) => f.uploadedBy === 'STUDIO');
  const revisionsLeft = Math.max(0, project.revisionsAllowed - project.revisionsUsed);

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">
            <Link href="/account/projects" style={{ color: 'inherit' }}>← Projects</Link>
          </div>
          <h1>{project.projectTitle || project.service.title}</h1>
          <p>
            {project.number} · {project.service.title}
            {project.serviceTier ? ` · ${project.serviceTier.name}` : ''}
          </p>
        </div>
        <ProjectPill status={project.status} />
      </div>

      <PortalNav unread={unread} />

      <div className="pt-split">
        <div>
          {/* What the studio has sent back. First, because on any visit after
              the first this is the thing being looked for. */}
          <div className="pt-panel">
            <h3>From the studio</h3>
            {theirs.length === 0 ? (
              <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                Nothing sent back yet. Previews and final masters appear here the moment they
                are ready, and you will get an email when they do.
              </p>
            ) : (
              <div className="pt-list">
                {theirs.map((f) => (
                  <div key={f.id} className="pt-row">
                    <div>
                      <div className="t">
                        {f.label || f.filename}
                        {f.isDeliverable && <span className="pill ok">Final</span>}
                      </div>
                      <div className="s">
                        {f.filename} · {fileSize(Number(f.bytes))} · {when(f.createdAt)}
                      </div>
                    </div>
                    <div className="r">
                      <a href={`/account/files/${f.id}`} className="btn btn-red btn-sm">Download</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-panel">
            <h3>Your files</h3>
            <FileZone projectId={project.id} files={mine.map((f) => ({
              id: f.id,
              filename: f.filename,
              label: f.label,
              bytes: Number(f.bytes),
              createdAt: f.createdAt.toISOString(),
            }))} />
          </div>

          <div className="pt-panel">
            <h3>Messages</h3>
            <MessageBox
              projectId={project.id}
              revisionsLeft={revisionsLeft}
              revisionsAllowed={project.revisionsAllowed}
              messages={project.messages.map((m) => ({
                id: m.id,
                fromStudio: m.fromStudio,
                body: m.body,
                createdAt: m.createdAt.toISOString(),
              }))}
            />
          </div>
        </div>

        <div>
          <div className="pt-panel">
            <h3>Progress</h3>
            <div className="tl">
              {FLOW.filter((s) => s !== 'REVISION_REQUESTED' || project.status === 'REVISION_REQUESTED').map((s) => {
                const reached = FLOW.indexOf(s) <= FLOW.indexOf(project.status as typeof FLOW[number]);
                const event = project.events.find((e) => e.status === s);
                return (
                  <div key={s} className={`tl-i${reached ? ' on' : ''}`}>
                    <div className="tl-t" style={{ color: reached ? 'var(--text)' : 'var(--dim)' }}>
                      {STEP_LABEL[s]}
                    </div>
                    {event && <div className="tl-d">{when(event.createdAt)} · {relative(event.createdAt)}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-panel">
            <h3>The brief</h3>
            <dl className="pt-kv">
              {project.genre && (<><dt>Genre</dt><dd>{project.genre}</dd></>)}
              {project.formatsWanted && (<><dt>Formats</dt><dd>{project.formatsWanted}</dd></>)}
              <dt>Deadline</dt>
              <dd>{project.deadline ? `${when(project.deadline)} (${relative(project.deadline)})` : 'Not set'}</dd>
              <dt>Revisions</dt>
              <dd>
                {project.revisionsUsed} of {project.revisionsAllowed} used
                {revisionsLeft > 0 && <span style={{ color: 'var(--dim)' }}> · {revisionsLeft} left</span>}
              </dd>
              {project.serviceTier && (<><dt>Package</dt><dd>{project.serviceTier.name} · {bdt(project.serviceTier.priceBdt)}</dd></>)}
              {project.order && (
                <>
                  <dt>Order</dt>
                  <dd><Link href={`/account/orders/${project.order.id}`} className="redt">{project.order.number}</Link></dd>
                </>
              )}
            </dl>

            {project.description && (
              <>
                <div style={{ fontFamily: 'var(--font-archivo),sans-serif', fontWeight: 700, fontSize: '.6rem',
                  letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1.2rem 0 .5rem' }}>
                  What you asked for
                </div>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {project.description}
                </p>
              </>
            )}

            {project.referenceLinks.length > 0 && (
              <>
                <div style={{ fontFamily: 'var(--font-archivo),sans-serif', fontWeight: 700, fontSize: '.6rem',
                  letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--dim)', margin: '1.2rem 0 .5rem' }}>
                  References
                </div>
                {project.referenceLinks.map((l) => (
                  <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow"
                    style={{ display: 'block', fontSize: '.8rem', color: 'var(--red-bright)',
                      overflowWrap: 'anywhere', padding: '.15rem 0' }}>
                    {l}
                  </a>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
