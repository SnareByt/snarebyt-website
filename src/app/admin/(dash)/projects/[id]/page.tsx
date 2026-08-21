import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { fileSize } from '@/lib/beat-files';
import { ProjectPanel } from './Client';

export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—';

/**
 * One project, everything about it.
 *
 * The desktop Projects screen has been a read-only list since it was built:
 * an enquiry could be looked at and nothing else. The actions all existed —
 * the phone dashboard has been driving them — so this screen runs exactly the
 * same ones rather than a second implementation that could drift from it.
 */
export default async function AdminProjectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      service: { select: { title: true } },
      serviceTier: { select: { name: true, priceBdt: true } },
      order: { select: { id: true, number: true, status: true, totalBdt: true } },
      user: { select: { id: true, email: true, name: true, artistName: true } },
      files: { orderBy: { createdAt: 'desc' } },
      messages: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!p) notFound();

  return (
    <>
      <header>
        <div>
          <div className="crumb"><Link href="/admin/projects">Projects</Link></div>
          <h1>{p.projectTitle || p.service.title}</h1>
        </div>
        <span className="hsp" />
        <span className="chip mono">{p.number}</span>
      </header>

      <div className="wrap">
        <ProjectPanel
          project={{
            id: p.id,
            number: p.number,
            status: p.status,
            notes: p.notes ?? '',
            deadline: p.deadline ? p.deadline.toISOString().slice(0, 10) : '',
            revisionsUsed: p.revisionsUsed,
            revisionsAllowed: p.revisionsAllowed,
            hasPaidOrder: p.order?.status === 'PAID',
            fileCount: p.files.length,
            files: p.files.map((f) => ({
              id: f.id,
              filename: f.filename,
              label: f.label,
              size: fileSize(Number(f.bytes)),
              uploadedBy: f.uploadedBy,
              isDeliverable: f.isDeliverable,
              createdAt: f.createdAt.toISOString().slice(0, 10),
            })),
            messages: p.messages.map((m) => ({
              id: m.id,
              fromStudio: m.fromStudio,
              body: m.body,
              createdAt: m.createdAt.toISOString().slice(0, 10),
            })),
          }}
        />

        <div className="grid2" style={{ marginTop: '1.6rem' }}>
          <div className="card pad">
            <div className="sec-hd"><h2>Who sent it</h2></div>
            <table>
              <tbody>
                <tr><td className="sub">Name</td><td>{p.contactName}</td></tr>
                {p.artistName ? <tr><td className="sub">Artist</td><td>{p.artistName}</td></tr> : null}
                <tr><td className="sub">Email</td><td>{p.email}</td></tr>
                {p.phone ? <tr><td className="sub">Phone</td><td>{p.phone}</td></tr> : null}
                {p.country ? <tr><td className="sub">Country</td><td>{p.country}</td></tr> : null}
                <tr><td className="sub">Received</td><td>{day(p.createdAt)}</td></tr>
                <tr>
                  <td className="sub">Account</td>
                  <td>
                    {p.user
                      ? <Link href={`/admin/customers/${p.user.id}`} className="rowgo">
                          {p.user.artistName || p.user.name || p.user.email}
                        </Link>
                      : <span className="sub">Guest — no account</span>}
                  </td>
                </tr>
                {p.order ? (
                  <tr>
                    <td className="sub">Order</td>
                    <td>
                      <Link href={`/admin/orders/${p.order.id}`} className="rowgo">{p.order.number}</Link>
                      {' '}<span className={`chip ${p.order.status === 'PAID' ? 'ok' : 'warn'}`}>
                        {p.order.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      {' '}{bdt(p.order.totalBdt)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card pad">
            <div className="sec-hd"><h2>The brief</h2></div>
            <table>
              <tbody>
                <tr><td className="sub">Service</td><td>{p.service.title}</td></tr>
                <tr>
                  <td className="sub">Package</td>
                  <td>{p.serviceTier ? `${p.serviceTier.name} · ${bdt(p.serviceTier.priceBdt)}` : 'Not chosen'}</td>
                </tr>
                {p.genre ? <tr><td className="sub">Genre</td><td>{p.genre}</td></tr> : null}
                {p.budgetBdt ? <tr><td className="sub">Budget</td><td>{bdt(p.budgetBdt)}</td></tr> : null}
                {p.formatsWanted ? <tr><td className="sub">Formats</td><td>{p.formatsWanted}</td></tr> : null}
              </tbody>
            </table>

            <div className="fl" style={{ marginTop: '1.2rem' }}>What they asked for</div>
            <p style={{ fontSize: '.86rem', color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {p.description}
            </p>

            {p.referenceLinks.length > 0 && (
              <>
                <div className="fl" style={{ marginTop: '1.2rem' }}>References</div>
                {p.referenceLinks.map((l) => (
                  <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow"
                    style={{ display: 'block', fontSize: '.8rem', color: 'var(--red-b)', overflowWrap: 'anywhere', padding: '.15rem 0' }}>
                    {l}
                  </a>
                ))}
              </>
            )}
          </div>
        </div>

        {p.events.length > 0 && (
          <section className="sec" style={{ marginTop: '1.6rem' }}>
            <div className="sec-hd"><h2>History</h2></div>
            <div className="tbl-wrap"><div className="tbl-scroll">
              <table>
                <thead><tr><th>Status</th><th>Note</th><th>When</th></tr></thead>
                <tbody>
                  {p.events.map((e) => (
                    <tr key={e.id}>
                      <td><span className="chip">{e.status.replace(/_/g, ' ').toLowerCase()}</span></td>
                      <td className="sub">{e.note ?? '—'}</td>
                      <td className="sub">{day(e.createdAt)}</td>
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
