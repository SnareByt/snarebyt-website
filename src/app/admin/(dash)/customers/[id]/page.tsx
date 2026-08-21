import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { describeAgent } from '@/lib/account';
import { fileSize } from '@/lib/beat-files';
import { AccountActions, NoteForm, ProjectPanel } from './Client';

export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—';

/**
 * One artist, everything about them.
 *
 * Assembled from several queries rather than one giant include, because the
 * shapes are genuinely different — a session list and an order list have
 * nothing to do with each other, and joining them produces a cartesian
 * product Prisma then has to unpick.
 */
export default async function ArtistDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const artist = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    select: {
      id: true, email: true, name: true, artistName: true, phone: true, country: true,
      emailVerified: true, suspendedAt: true, suspendedReason: true, adminNote: true,
      createdAt: true, lastLoginAt: true, lastLoginIp: true, failedLogins: true, lockedUntil: true,
    },
  });
  if (!artist) notFound();

  const [orders, projects, sessions, downloads, activity] = await Promise.all([
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, number: true, status: true, totalBdt: true, createdAt: true, paidAt: true,
        items: { select: { titleSnapshot: true } },
        payments: { where: { status: 'VALIDATED' }, select: { tranId: true, cardType: true } },
      },
    }),
    prisma.project.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, number: true, status: true, projectTitle: true, deadline: true,
        revisionsUsed: true, revisionsAllowed: true,
        service: { select: { title: true } },
        files: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, filename: true, label: true, bytes: true, uploadedBy: true, isDeliverable: true, createdAt: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, fromStudio: true, body: true, createdAt: true },
        },
      },
    }),
    prisma.session.findMany({
      where: { userId: id, kind: 'ACCOUNT' },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, ip: true, userAgent: true, lastSeenAt: true, createdAt: true, revokedAt: true, expiresAt: true },
    }),
    prisma.downloadLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, objectKey: true, success: true, reason: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'User', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, createdAt: true },
    }),
  ]);

  const spent = orders.filter((o) => o.status === 'PAID').reduce((n, o) => n + o.totalBdt, 0);
  const liveSessions = sessions.filter((s) => !s.revokedAt && s.expiresAt > new Date());

  return (
    <>
      <header>
        <div>
          <div className="crumb"><Link href="/admin/customers">Artist accounts</Link></div>
          <h1>{artist.artistName || artist.name || artist.email}</h1>
        </div>
        <span className="hsp" />
        {artist.suspendedAt
          ? <span className="chip warn">Suspended</span>
          : artist.emailVerified
            ? <span className="chip ok">Verified</span>
            : <span className="chip off">Unverified</span>}
      </header>

      <div className="wrap">
        {artist.suspendedAt && (
          <div className="note" style={{ marginBottom: '1.4rem' }}>
            <span>⛔</span>
            <span>
              <b>Suspended {day(artist.suspendedAt)}.</b> They cannot sign in or download.
              {artist.suspendedReason ? <> Reason: {artist.suspendedReason}</> : null}
            </span>
          </div>
        )}

        <div className="grid2">
          <div className="card pad">
            <div className="sec-hd"><h2>Details</h2></div>
            <table>
              <tbody>
                <tr><td className="sub">Name</td><td>{artist.name ?? '—'}</td></tr>
                <tr><td className="sub">Artist name</td><td>{artist.artistName ?? '—'}</td></tr>
                <tr><td className="sub">Email</td><td>{artist.email}</td></tr>
                <tr><td className="sub">Phone</td><td>{artist.phone ?? '—'}</td></tr>
                <tr><td className="sub">Country</td><td>{artist.country ?? '—'}</td></tr>
                <tr><td className="sub">Registered</td><td>{day(artist.createdAt)}</td></tr>
                <tr><td className="sub">Email verified</td><td>{artist.emailVerified ? day(artist.emailVerified) : 'Not yet'}</td></tr>
                <tr><td className="sub">Last sign-in</td><td>{day(artist.lastLoginAt)}{artist.lastLoginIp ? ` · ${artist.lastLoginIp}` : ''}</td></tr>
                <tr>
                  <td className="sub">Lifetime spend</td>
                  <td><b>{spent > 0 ? bdt(spent) : '—'}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card pad">
            <div className="sec-hd"><h2>Account actions</h2></div>
            <AccountActions
              userId={artist.id}
              email={artist.email}
              suspended={Boolean(artist.suspendedAt)}
              verified={Boolean(artist.emailVerified)}
              liveSessions={liveSessions.length}
            />
          </div>
        </div>

        <section className="sec" style={{ marginTop: '1.6rem' }}>
          <div className="sec-hd"><h2>Private note</h2><span className="chip">never shown to them</span></div>
          <NoteForm userId={artist.id} note={artist.adminNote ?? ''} />
        </section>

        <section className="sec">
          <div className="sec-hd">
            <h2>Orders</h2>
            <span className="chip">{orders.length}</span>
          </div>
          {orders.length === 0 ? (
            <div className="empty">No orders on this account.</div>
          ) : (
            <div className="tbl-wrap"><div className="tbl-scroll">
              <table>
                <thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Status</th><th>Paid</th><th /></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><div className="ttl">{o.number}</div>
                        <div className="sub">{day(o.createdAt)}</div></td>
                      <td className="sub">{o.items.map((i) => i.titleSnapshot).join(', ')}</td>
                      <td>{bdt(o.totalBdt)}</td>
                      <td><span className={`chip ${o.status === 'PAID' ? 'ok' : o.status === 'PENDING_PAYMENT' ? 'warn' : 'off'}`}>
                        {o.status.replace(/_/g, ' ').toLowerCase()}</span></td>
                      <td className="sub">
                        {o.paidAt ? day(o.paidAt) : '—'}
                        {o.payments[0] ? <div>{o.payments[0].cardType ?? ''} {o.payments[0].tranId}</div> : null}
                      </td>
                      <td className="acts"><Link href={`/admin/orders/${o.id}`} className="rowgo">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          )}
        </section>

        <section className="sec">
          <div className="sec-hd">
            <h2>Projects</h2>
            <span className="chip">{projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <div className="empty">No projects on this account.</div>
          ) : (
            projects.map((p) => (
              <ProjectPanel
                key={p.id}
                project={{
                  id: p.id,
                  number: p.number,
                  status: p.status,
                  title: p.projectTitle || p.service.title,
                  service: p.service.title,
                  deadline: p.deadline ? p.deadline.toISOString() : null,
                  revisionsUsed: p.revisionsUsed,
                  revisionsAllowed: p.revisionsAllowed,
                  files: p.files.map((f) => ({
                    id: f.id, filename: f.filename, label: f.label,
                    size: fileSize(Number(f.bytes)),
                    uploadedBy: f.uploadedBy, isDeliverable: f.isDeliverable,
                    createdAt: f.createdAt.toISOString(),
                  })),
                  messages: p.messages.map((m) => ({
                    id: m.id, fromStudio: m.fromStudio, body: m.body,
                    createdAt: m.createdAt.toISOString(),
                  })),
                }}
              />
            ))
          )}
        </section>

        <div className="grid2">
          <section className="sec">
            <div className="sec-hd"><h2>Sign-in history</h2></div>
            <div className="tbl-wrap"><div className="tbl-scroll">
              <table>
                <thead><tr><th>Device</th><th>IP</th><th>Last used</th><th>State</th></tr></thead>
                <tbody>
                  {sessions.length === 0 && (
                    <tr><td colSpan={4}><div className="empty">Never signed in.</div></td></tr>
                  )}
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="sub">{describeAgent(s.userAgent)}</td>
                      <td className="sub mono">{s.ip ?? '—'}</td>
                      <td className="sub">{day(s.lastSeenAt ?? s.createdAt)}</td>
                      <td>
                        {s.revokedAt ? <span className="chip off">Signed out</span>
                          : s.expiresAt < new Date() ? <span className="chip off">Expired</span>
                          : <span className="chip ok">Active</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Downloads</h2></div>
            <div className="tbl-wrap"><div className="tbl-scroll">
              <table>
                <thead><tr><th>File</th><th>When</th><th>Result</th></tr></thead>
                <tbody>
                  {downloads.length === 0 && (
                    <tr><td colSpan={3}><div className="empty">Nothing downloaded yet.</div></td></tr>
                  )}
                  {downloads.map((d) => (
                    <tr key={d.id}>
                      <td className="sub mono" style={{ overflowWrap: 'anywhere' }}>
                        {d.objectKey.split('/').pop()}
                      </td>
                      <td className="sub">{day(d.createdAt)}</td>
                      <td>
                        {d.success
                          ? <span className="chip ok">Served</span>
                          : <span className="chip warn">{d.reason ?? 'Refused'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          </section>
        </div>

        {activity.length > 0 && (
          <section className="sec">
            <div className="sec-hd"><h2>Admin actions on this account</h2></div>
            <div className="tbl-wrap"><div className="tbl-scroll">
              <table>
                <thead><tr><th>Action</th><th>When</th></tr></thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td>{a.action.replace(/[._]/g, ' ')}</td>
                      <td className="sub">{day(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          </section>
        )}
      </div>
    </>
  );
}
