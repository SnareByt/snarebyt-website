import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';
import { Filter } from '@/components/app/Filter';
import { projectChip, ago, shortDate } from '@/lib/app-format';
import { PROJECT_LABEL } from '@/lib/project-rules';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Needs me' },
  { key: 'all', label: 'All' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter = 'open' } = await searchParams;

  const where: Prisma.ProjectWhereInput =
    filter === 'all' ? {}
    : filter === 'DELIVERED' ? { status: 'DELIVERED' }
    // "Needs me" is the working queue: the client has done their part and the
    // ball is here. Everything else is either waiting on them or already out.
    : filter === 'mine' ? { status: { in: ['FILES_RECEIVED', 'REVISION_REQUESTED', 'COMPLETED'] } }
    : { status: { not: 'DELIVERED' } };

  const projects = await prisma.project.findMany({
    where,
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 100,
    include: {
      service: { select: { title: true } },
      serviceTier: { select: { name: true } },
      files: { select: { isDeliverable: true } },
    },
  });

  const now = Date.now();

  return (
    <>
      <NavBar title="Bookings" back="/app/more" />

      <div className="big-title">
        <h2>Bookings</h2>
        <p>{projects.length} shown · soonest deadline first</p>
      </div>

      <Filter options={FILTERS} active={filter} basePath="/app/projects" />

      <div className="wrap stack" style={{ marginTop: '.9rem' }}>
        {projects.length ? (
          <div className="list">
            {projects.map((p) => {
              /* Overdue is worth its own colour. A deadline that has passed on
                 a project that is not delivered is the one thing on this
                 screen that costs a reputation rather than a day. */
              const overdue =
                p.deadline && p.status !== 'DELIVERED' && p.deadline.getTime() < now;

              return (
                <Link key={p.id} href={`/app/projects/${p.id}`} className="row">
                  <div className="row-main">
                    <div className="row-t">{p.projectTitle || p.contactName}</div>
                    <div className="row-s">
                      {p.service.title}
                      {p.serviceTier ? ` · ${p.serviceTier.name}` : ''}
                    </div>
                    <div className="row-s mono" style={{ color: 'var(--dim)' }}>
                      {p.number} · {ago(p.createdAt)}
                    </div>
                    {p.deadline && (
                      <div className="row-s" style={{ color: overdue ? '#ff9aa8' : 'var(--muted)' }}>
                        {overdue ? 'Overdue — ' : 'Due '}{shortDate(p.deadline)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <span className={`chip ${projectChip(p.status)}`}>
                      {PROJECT_LABEL[p.status]}
                    </span>
                    {p.files.some((f) => f.isDeliverable) && (
                      <div className="row-s" style={{ color: 'var(--ok)', marginTop: '.25rem' }}>
                        files ready
                      </div>
                    )}
                  </div>
                  <span className="row-x"><IcNext /></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="list">
            <div className="empty">
              {filter === 'mine'
                ? 'Nothing is waiting on you.'
                : 'No bookings match this filter.'}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
