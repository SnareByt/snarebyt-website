import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage() {
  await requireAdmin();
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { orders: true, projects: true } } },
    take: 100,
  });

  return (
    <>
      <header><div><div className="crumb">Business</div><h1>Customers</h1></div></header>
      <div className="wrap">
        <div className="sec-hd"><h2>{customers.length} customers</h2></div>

        {customers.length ? (
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Orders</th><th>Projects</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ttl">{c.name ?? '—'}</div>
                    {c.artistName ? <div className="sub">{c.artistName}</div> : null}
                  </td>
                  <td className="sub">{c.email}</td>
                  <td>{c._count.orders}</td>
                  <td>{c._count.projects}</td>
                  <td className="sub">{c.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note">
            <span>☺</span>
            <span>
              <b>No customer accounts yet.</b> Accounts are created at checkout, which is not built.
              Project briefs from the contact form do not create accounts — they appear under
              Projects.
            </span>
          </div>
        )}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>⚖</span>
          <span>
            <b>Never delete a customer with completed orders.</b> Their licence has to stay
            provable. When account management is built it will deactivate or anonymise instead —
            which also covers a data-deletion request without destroying the trading record.
          </span>
        </div>
      </div>
    </>
  );
}
