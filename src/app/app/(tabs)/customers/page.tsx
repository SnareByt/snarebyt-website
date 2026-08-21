import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { ago } from '@/lib/app-format';

export const dynamic = 'force-dynamic';

/**
 * Who has bought something, and what they spent.
 *
 * Read-only, deliberately. There is nothing an admin needs to change about a
 * customer record from a phone: their details are edited on the order they
 * belong to, where the change is attached to the thing it affects and lands in
 * the audit log with that context. A general-purpose customer editor would be
 * a second way to rewrite the same fields with none of that.
 */
export default async function CustomersPage() {
  await requireAdmin();

  /**
   * Grouped by email rather than by User row.
   *
   * Most buyers check out as guests and never create an account, so counting
   * User rows would show a fraction of the people who have actually paid.
   * Email is what the licence, the receipt and the download link all key on,
   * so it is the identity that matters here.
   */
  const paidOrders = await prisma.order.findMany({
    where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      billingEmail: true, billingName: true, guestName: true, billingCountry: true,
      totalBdt: true, createdAt: true, artistName: true,
    },
  });

  const byEmail = new Map<string, {
    email: string; name: string; artistName: string | null; country: string | null;
    orders: number; spent: number; last: Date;
  }>();

  for (const o of paidOrders) {
    const key = o.billingEmail.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.orders += 1;
      existing.spent += o.totalBdt;
      // Orders arrive newest first, so the first one seen is the latest.
      existing.artistName ??= o.artistName;
    } else {
      byEmail.set(key, {
        email: o.billingEmail,
        name: o.billingName || o.guestName || o.billingEmail,
        artistName: o.artistName,
        country: o.billingCountry,
        orders: 1,
        spent: o.totalBdt,
        last: o.createdAt,
      });
    }
  }

  const customers = [...byEmail.values()].sort((a, b) => b.spent - a.spent);
  const total = customers.reduce((n, c) => n + c.spent, 0);

  return (
    <>
      <NavBar title="Customers" back="/app/more" />

      <div className="big-title">
        <h2>Customers</h2>
        <p>{customers.length} {customers.length === 1 ? 'person has' : 'people have'} bought something</p>
      </div>

      <div className="wrap stack-lg">
        <div className="tiles">
          <div className="tile" data-accent="1">
            <div className="tile-k">Customers</div>
            <div className="tile-v">{customers.length}</div>
          </div>
          <div className="tile">
            <div className="tile-k">Lifetime</div>
            <div className="tile-v">{bdt(total)}</div>
          </div>
        </div>

        <div className="list selectable">
          {customers.map((c) => (
            <a key={c.email} className="row" href={`mailto:${c.email}`}>
              <div className="row-main">
                <div className="row-t">{c.name}</div>
                {c.artistName && <div className="row-s redt">Records as {c.artistName}</div>}
                <div className="row-s">{c.email}</div>
                <div className="row-s dim">
                  {c.orders} order{c.orders === 1 ? '' : 's'} · last {ago(c.last)}
                  {c.country ? ` · ${c.country}` : ''}
                </div>
              </div>
              <span className="row-v">{bdt(c.spent)}</span>
            </a>
          ))}
          {customers.length === 0 && (
            <div className="empty">Nobody has bought anything yet.</div>
          )}
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Grouped by email, because most buyers check out as guests — email is what the
          licence, the receipt and the download link all key on. Tap a row to write to them.
          Their details are edited on the order they belong to.
        </p>
      </div>
    </>
  );
}
