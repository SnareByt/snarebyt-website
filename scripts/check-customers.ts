/**
 * The Customers screen, against a real Postgres.
 *
 * The bug was that this screen showed nothing while the More tab said there
 * were accounts, so the thing to prove is that both datasets reach the list
 * and that nobody is counted twice.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { foldGuests, guestMatches } from '../src/lib/customer-list';

const prisma = new PrismaClient();
let bad = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
  if (!ok) bad += 1;
};

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();

  const mk = (email: string, o: Partial<Prisma.UserCreateInput> = {}) =>
    prisma.user.create({
      data: { email, role: 'CUSTOMER', name: email.split('@')[0], ...o },
    });

  // Three accounts: verified, unverified, suspended.
  const rafi = await mk('rafi@example.com', { emailVerified: new Date(), artistName: 'RAFI' });
  await mk('nabil@example.com');
  await mk('tanvir@example.com', { emailVerified: new Date(), suspendedAt: new Date(), suspendedReason: 'chargeback' });
  // And the admin, who must never show up in a CUSTOMER list.
  await prisma.user.create({ data: { email: 'samir@snarebyt.com', role: 'ADMIN', name: 'Samir' } });

  let n = 0;
  const order = (opts: {
    email: string; total: number; userId?: string; status?: 'PAID' | 'PENDING_PAYMENT';
    artistName?: string; when?: Date;
  }) =>
    prisma.order.create({
      data: {
        number: `SB-${String(++n).padStart(4, '0')}`,
        status: opts.status ?? 'PAID',
        billingEmail: opts.email,
        billingName: opts.email.split('@')[0],
        billingCountry: 'BD',
        artistName: opts.artistName ?? null,
        subtotalBdt: opts.total,
        totalBdt: opts.total,
        paidAt: (opts.status ?? 'PAID') === 'PAID' ? (opts.when ?? new Date()) : null,
        createdAt: opts.when ?? new Date(),
        ...(opts.userId ? { user: { connect: { id: opts.userId } } } : {}),
      },
    });

  // An account holder who has paid.
  await order({ email: 'rafi@example.com', total: 5000, userId: rafi.id });
  /* A true guest, two orders, the email cased differently each time.
     Explicit timestamps rather than `new Date()`: two orders created in the
     same millisecond sort arbitrarily, and a test that depends on which way
     the tie broke fails once a week for no reason. */
  const OLDER = new Date('2026-08-01T10:00:00Z');
  const NEWER = new Date('2026-08-14T10:00:00Z');
  await order({ email: 'guest@example.com', total: 3000, when: OLDER });
  await order({ email: 'GUEST@example.com', total: 2000, artistName: 'Shadow', when: NEWER });
  // The trap: a guest order for an address that ALSO has an account. Newest of
  // all of them, so it would be guestOrders[0] if it were not skipped.
  await order({ email: 'Nabil@example.com', total: 1500, when: new Date('2026-08-20T10:00:00Z') });
  // Unpaid: must not create a customer at all.
  await order({ email: 'window@example.com', total: 9999, status: 'PENDING_PAYMENT' });

  /* ---- the screen's own queries, run verbatim ---- */
  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };
  const [accounts, allAccountEmails, guestOrders, totalAccounts] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 200,
      select: {
        id: true, email: true, name: true, artistName: true, country: true,
        emailVerified: true, suspendedAt: true, createdAt: true, lastLoginAt: true,
        _count: { select: { orders: true, projects: true } },
        orders: { where: { status: 'PAID' }, select: { totalBdt: true } },
      },
    }),
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

  const guests = foldGuests(allAccountEmails.map((u) => u.email), guestOrders);

  console.log('\nThe screen is not empty\n');
  is('  three accounts are listed', accounts.length, 3);
  is('  the admin is not one of them', accounts.some((a) => a.email === 'samir@snarebyt.com'), false);
  is('  an account with no orders still appears',
    accounts.some((a) => a.email === 'tanvir@example.com'), true);

  console.log('\n  Guests');
  is('  exactly one guest', guests.length, 1);
  is('  it is the one with no account', guests[0]?.email.toLowerCase(), 'guest@example.com');
  is('  their two orders are folded into one row', guests[0]?.orders, 2);
  is('  differing email case did not split them', guests[0]?.spent, 5000);
  /* Their OWN newest order, not the newest order in the table — the newest
     of all belongs to Nabil, who is skipped for having an account. */
  is('  their own newest order set the date',
    guests[0]?.last.toISOString(), NEWER.toISOString());
  is('  not their oldest',
    guests[0]?.last.getTime() > OLDER.getTime(), true);
  is('  an artist name from the newest order is kept', guests[0]?.artistName, 'Shadow');

  console.log('\n  Nobody is counted twice');
  const nabilGuest = guests.some((g) => g.email.toLowerCase() === 'nabil@example.com');
  is('  an account holder who also paid as a guest is not duplicated', nabilGuest, false);
  is('  and their account is still listed',
    accounts.some((a) => a.email === 'nabil@example.com'), true);

  console.log('\n  Only money that arrived');
  is('  an unpaid order creates no customer',
    guests.some((g) => g.email.includes('window')), false);
  const lifetime =
    accounts.reduce((t, a) => t + a.orders.reduce((m, o) => m + o.totalBdt, 0), 0)
    + guests.reduce((t, g) => t + g.spent, 0);
  is('  lifetime counts paid only (5000 + 5000)', lifetime, 10000);

  console.log('\n  Filters');
  const suspended = await prisma.user.count({ where: { role: 'CUSTOMER', suspendedAt: { not: null } } });
  const unverified = await prisma.user.count({ where: { role: 'CUSTOMER', emailVerified: null, suspendedAt: null } });
  const active = await prisma.user.count({ where: { role: 'CUSTOMER', emailVerified: { not: null }, suspendedAt: null } });
  is('  suspended', suspended, 1);
  is('  unverified', unverified, 1);
  is('  verified and active', active, 1);
  is('  the three add up to every account', suspended + unverified + active, totalAccounts);

  console.log('\n  Search');
  is('  a guest matches on name', guestMatches(guests[0], 'guest'), true);
  is('  a guest matches on artist name', guestMatches(guests[0], 'shadow'), true);
  is('  case does not matter', guestMatches(guests[0], 'SHADOW'), true);
  is('  a non-match is excluded', guestMatches(guests[0], 'rafi'), false);

  /* ============================================================
     The exact state that reported the bug
     ============================================================
     Accounts registered, nothing sold yet. The old screen listed buyers
     taken from PAID orders only, so it rendered "Nobody has bought anything
     yet" while the More tab counted the accounts and said there were four.
     Both were true about different people, and the screen looked broken.
     ============================================================ */
  console.log('\n  Before the first sale');
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  const [freshAccounts, freshEmails, freshGuestOrders, freshTotal] = await Promise.all([
    prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, email: true } }),
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
  const freshGuests = foldGuests(freshEmails.map((u) => u.email), freshGuestOrders);

  // What the old screen had to work with: paid orders, and nothing else.
  is('  the old screen had nothing to show', freshGuestOrders.length, 0);
  // What this one shows.
  is('  the new one lists every account', freshAccounts.length, 3);
  is('  no guests, correctly', freshGuests.length, 0);
  is('  and the More tab count now agrees with it', freshTotal, freshAccounts.length);

  console.log(bad === 0 ? '\nAll passed.\n' : `\n${bad} FAILED.\n`);
  await prisma.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}
main();
