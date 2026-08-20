import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { ArtistFilters } from './Filters';

export const dynamic = 'force-dynamic';

/**
 * Artist accounts.
 *
 * Search runs on the database rather than by loading everyone and filtering in
 * Node, so this still works at ten thousand customers. `mode: 'insensitive'`
 * matters more than it looks: people type their own email in whatever case
 * their phone decided on.
 */
export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const filter = sp.filter ?? 'all';

  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };

  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { artistName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ];
  }
  if (filter === 'suspended') where.suspendedAt = { not: null };
  if (filter === 'unverified') { where.emailVerified = null; where.suspendedAt = null; }
  if (filter === 'active') { where.emailVerified = { not: null }; where.suspendedAt = null; }

  const [artists, counts] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, email: true, name: true, artistName: true, country: true,
        emailVerified: true, suspendedAt: true, createdAt: true, lastLoginAt: true,
        _count: { select: { orders: true, projects: true } },
        orders: { where: { status: 'PAID' }, select: { totalBdt: true } },
      },
    }),
    prisma.user.groupBy({
      by: ['role'],
      where: { role: 'CUSTOMER' },
      _count: true,
    }),
  ]);

  const total = counts[0]?._count ?? 0;

  return (
    <>
      <header><div><div className="crumb">Business</div><h1>Artist accounts</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{artists.length === total ? `${total} artists` : `${artists.length} of ${total}`}</h2>
          <span className="sp" />
        </div>

        <ArtistFilters q={q} filter={filter} />

        {artists.length === 0 ? (
          <div className="note" style={{ marginTop: '1.2rem' }}>
            <span>☺</span>
            <span>
              {q || filter !== 'all'
                ? <><b>Nothing matches that.</b> Try a different search, or clear the filter.</>
                : <><b>No artist accounts yet.</b> Anyone who registers, or who buys and then creates
                    an account with the same email, appears here.</>}
            </span>
          </div>
        ) : (
          <div className="tbl-wrap" style={{ marginTop: '1.2rem' }}>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Artist</th><th>Status</th><th>Orders</th><th>Spent</th>
                    <th>Projects</th><th>Last seen</th><th />
                  </tr>
                </thead>
                <tbody>
                  {artists.map((a) => {
                    const spent = a.orders.reduce((n, o) => n + o.totalBdt, 0);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="ttl">{a.artistName || a.name || '—'}</div>
                          <div className="sub">{a.email}</div>
                        </td>
                        <td>
                          {a.suspendedAt ? <span className="chip warn">Suspended</span>
                            : a.emailVerified ? <span className="chip ok">Verified</span>
                            : <span className="chip off">Unverified</span>}
                        </td>
                        <td>{a._count.orders}</td>
                        <td>{spent > 0 ? bdt(spent) : <span className="sub">—</span>}</td>
                        <td>{a._count.projects}</td>
                        <td className="sub">
                          {a.lastLoginAt ? a.lastLoginAt.toISOString().slice(0, 10) : 'Never'}
                        </td>
                        <td className="acts">
                          <Link href={`/admin/customers/${a.id}`} className="rowgo">Open</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>⚖</span>
          <span>
            <b>Suspending is reversible; deleting is not offered.</b> An artist with paid orders
            cannot be removed — their licence has to stay provable, and deleting the buyer
            destroys the other half of that record. Suspending stops sign-in and downloads
            immediately while leaving everything intact.
          </span>
        </div>
      </div>
    </>
  );
}

