import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';
import { ago } from '@/lib/app-format';
import { Filter } from '@/components/app/Filter';
import { foldGuests, guestMatches } from '@/lib/customer-list';

export const dynamic = 'force-dynamic';

/**
 * Everyone who has an account, and everyone who has paid without one.
 *
 * WHY THIS SCREEN WAS EMPTY
 *
 * It used to list buyers grouped by billing email, taken only from PAID
 * orders. The More tab counts artist ACCOUNTS. So the tab said "4 accounts",
 * the screen said "Nobody has bought anything yet", and both were telling the
 * truth about two different sets of people. Before the first sale that reads
 * as a broken screen, and it is: a registered artist is a customer whether or
 * not they have spent anything yet, and there was nowhere on the phone to see
 * one, let alone act on one.
 *
 * So the list is now people, from both directions:
 *
 *   - every artist account (a User row), whatever they have spent
 *   - plus anyone who paid as a guest and never registered
 *
 * A guest who later signs up with the same address is not shown twice: the
 * accounts are gathered first and their emails skipped when the guest orders
 * are folded in. Email is the join, because that is what the licence, the
 * receipt and the download link all key on.
 *
 * Accounts are tappable and editable. Guests are not — there is no User row to
 * suspend, note or sign out, and their billing details are edited on the order
 * they belong to, where the change lands in the audit log attached to the
 * thing it affects.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const filter = sp.filter ?? 'all';

  /* Searching and filtering in SQL, not in Node. This still works at ten
     thousand accounts, and `mode: 'insensitive'` matters more than it looks —
     people type their own email in whatever case their phone decided on. */
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

  const [accounts, allAccountEmails, guestOrders, totalAccounts] = await Promise.all([
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
    /* Every account email, not just the filtered page — otherwise a search
       would let an account holder reappear in the guest list below. */
    prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { email: true } }),
    prisma.order.findMany({
      where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, userId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        billingEmail: true, billingName: true, guestName: true, billingCountry: true,
        totalBdt: true, createdAt: true, artistName: true,
      },
    }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);

  /* The fold lives in src/lib/customer-list.ts as a pure function, because
     the failure it guards against is a person appearing twice or not at all —
     easy to prove in a test, hard to notice on a phone. */
  const guestBuyers = foldGuests(
    allAccountEmails.map((u) => u.email),
    guestOrders,
  );

  /* Guests are hidden whenever an account-shaped filter is on. "Unverified"
     and "Suspended" are properties of an account; showing people who have
     neither under those headings would make the filter mean nothing. */
  const showGuests = filter === 'all' || filter === 'guests';
  const guests = showGuests ? guestBuyers.filter((g) => guestMatches(g, q)) : [];

  const accountsShown = filter === 'guests' ? [] : accounts;
  const spentOf = (a: (typeof accounts)[number]) =>
    a.orders.reduce((n, o) => n + o.totalBdt, 0);
  const lifetime =
    accounts.reduce((n, a) => n + spentOf(a), 0) + guestBuyers.reduce((n, g) => n + g.spent, 0);

  return (
    <>
      <NavBar title="Customers" back="/app/more" />

      <div className="big-title">
        <h2>Customers</h2>
        <p>
          {totalAccounts} account{totalAccounts === 1 ? '' : 's'}
          {guestBuyers.length > 0 && ` · ${guestBuyers.length} guest buyer${guestBuyers.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="wrap stack-lg">
        <div className="tiles">
          <div className="tile" data-accent="1">
            <div className="tile-k">People</div>
            <div className="tile-v">{totalAccounts + guestBuyers.length}</div>
          </div>
          <div className="tile">
            <div className="tile-k">Lifetime</div>
            <div className="tile-v">{bdt(lifetime)}</div>
          </div>
        </div>

        <form action="/app/customers" className="field" style={{ margin: 0 }}>
          <input
            className="in" name="q" defaultValue={q} placeholder="Search name, email or phone"
            type="search" inputMode="search" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} aria-label="Search customers"
          />
          {/* Carries the filter through a search, so searching does not
              silently drop the tab you were on. */}
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        </form>

        {/* The strip keeps whatever else is in the URL, so a search survives
            switching tab and vice versa. */}
        <Filter
          basePath="/app/customers"
          active={filter}
          options={[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Verified' },
            { key: 'unverified', label: 'Unverified' },
            { key: 'suspended', label: 'Suspended' },
            { key: 'guests', label: 'Guests' },
          ]}
        />

        {accountsShown.length === 0 && guests.length === 0 ? (
          <div className="list">
            <div className="empty">
              {q || filter !== 'all'
                ? 'Nothing matches that.'
                : 'No accounts yet. Anyone who registers, or who buys and then signs up with the same email, appears here.'}
            </div>
          </div>
        ) : (
          <div className="list selectable">
            {accountsShown.map((a) => {
              const spent = spentOf(a);
              return (
                <Link key={a.id} href={`/app/customers/${a.id}`} className="row">
                  <div className="row-main">
                    <div className="row-t">{a.artistName || a.name || a.email}</div>
                    <div className="row-s">{a.email}</div>
                    <div className="row-s dim">
                      {a._count.orders} order{a._count.orders === 1 ? '' : 's'}
                      {a._count.projects > 0 && ` · ${a._count.projects} booking${a._count.projects === 1 ? '' : 's'}`}
                      {a.lastLoginAt ? ` · seen ${ago(a.lastLoginAt)}` : ' · never signed in'}
                    </div>
                  </div>
                  {spent > 0 && <span className="row-v">{bdt(spent)}</span>}
                  <span className={`chip ${a.suspendedAt ? 'warn' : a.emailVerified ? 'ok' : 'off'}`}>
                    {a.suspendedAt ? 'suspended' : a.emailVerified ? 'verified' : 'unverified'}
                  </span>
                  <span className="row-x"><IcNext /></span>
                </Link>
              );
            })}

            {guests.map((g) => (
              <a key={g.email} className="row" href={`mailto:${g.email}`}>
                <div className="row-main">
                  <div className="row-t">{g.name}</div>
                  {g.artistName && <div className="row-s redt">Records as {g.artistName}</div>}
                  <div className="row-s">{g.email}</div>
                  <div className="row-s dim">
                    {g.orders} order{g.orders === 1 ? '' : 's'} · last {ago(g.last)}
                    {g.country ? ` · ${g.country}` : ''}
                  </div>
                </div>
                <span className="row-v">{bdt(g.spent)}</span>
                <span className="chip">guest</span>
              </a>
            ))}
          </div>
        )}

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Accounts open for editing. Guests paid without registering, so there is no account
          to change — tap one to write to them. Their billing details are edited on the order
          they belong to.
          {admin.role !== 'ADMIN' && ' Suspending and deleting need the owner account.'}
        </p>
      </div>
    </>
  );
}
