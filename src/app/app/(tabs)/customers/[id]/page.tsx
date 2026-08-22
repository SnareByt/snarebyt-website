import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';
import { ago, shortDate, orderChip, humanStatus } from '@/lib/app-format';
import { ArtistActions } from './ArtistActions';

export const dynamic = 'force-dynamic';

/**
 * One artist account.
 *
 * The desktop screen also carries their whole project history with file
 * uploads and a message thread. That is not repeated here: bookings already
 * have their own tab with the same actions, and duplicating them would mean
 * two places to change a project status and one of them eventually going
 * stale. This screen answers who they are, what they have spent, and gives the
 * account controls — the things that were not reachable from a phone at all.
 */
export default async function AppArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const artist = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    select: {
      id: true, email: true, name: true, artistName: true, phone: true, country: true,
      emailVerified: true, suspendedAt: true, suspendedReason: true, adminNote: true,
      createdAt: true, lastLoginAt: true, twoFactorEnabled: true,
    },
  });
  // Guarded to CUSTOMER above, so an admin id in the URL is a 404 rather than
  // a screen offering to suspend the account you are signed in with.
  if (!artist) notFound();

  const [orders, projects, sessions] = await Promise.all([
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, number: true, status: true, totalBdt: true, createdAt: true,
        items: { select: { titleSnapshot: true } },
      },
    }),
    prisma.project.count({ where: { userId: id } }),
    prisma.session.count({
      where: { userId: id, kind: 'ACCOUNT', revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  const spent = orders
    .filter((o) => o.status === 'PAID')
    .reduce((n, o) => n + o.totalBdt, 0);

  return (
    <>
      <NavBar title={artist.artistName || artist.name || 'Artist'} back="/app/customers" />

      <div className="big-title">
        <h2>{artist.artistName || artist.name || artist.email}</h2>
        <p className="selectable">{artist.email}</p>
      </div>

      <div className="wrap stack-lg">
        {artist.suspendedAt && (
          <div className="note red">
            <b>Suspended {ago(artist.suspendedAt)}</b>
            <br />
            {artist.suspendedReason || 'No reason was recorded.'}
            <br />
            They cannot sign in or download. Their orders, licences and files are untouched.
          </div>
        )}

        {!artist.emailVerified && !artist.suspendedAt && (
          <div className="note warn">
            <b>Email not verified.</b>
            <br />
            Until they verify, any guest orders they placed with this address stay unattached.
          </div>
        )}

        <div className="list selectable">
          <Row k="Status" v={artist.suspendedAt ? 'Suspended' : artist.emailVerified ? 'Verified' : 'Unverified'} />
          {artist.name && <Row k="Name" v={artist.name} />}
          {artist.artistName && <Row k="Records as" v={artist.artistName} />}
          {artist.phone && <Row k="Phone" v={artist.phone} />}
          {artist.country && <Row k="Country" v={artist.country} />}
          <Row k="Joined" v={shortDate(artist.createdAt)} />
          <Row k="Last signed in" v={artist.lastLoginAt ? ago(artist.lastLoginAt) : 'Never'} />
          <Row k="Signed-in devices" v={String(sessions)} />
          <Row k="Two-factor" v={artist.twoFactorEnabled ? 'On' : 'Off'} />
          <Row k="Paid" v={spent > 0 ? bdt(spent) : '—'} />
          <Row k="Bookings" v={String(projects)} />
        </div>

        <ArtistActions
          artist={{
            id: artist.id,
            email: artist.email,
            suspended: Boolean(artist.suspendedAt),
            verified: Boolean(artist.emailVerified),
            adminNote: artist.adminNote ?? '',
            sessions,
          }}
          /* Suspending and deleting call requireOwner() on the server. A
             STAFF admin would get a refusal toast; the button is hidden
             instead, because an action that can only fail is worse than one
             that is not offered. The server check is what enforces it — this
             only decides what is worth showing. */
          isOwner={admin.role === 'ADMIN'}
        />

        <div>
          <div className="sec">
            <h3>Orders</h3>
            <Link href="/app/orders">All</Link>
          </div>
          {orders.length ? (
            <div className="list">
              {orders.map((o) => (
                <Link key={o.id} href={`/app/orders/${o.id}`} className="row">
                  <div className="row-main">
                    <div className="row-t">
                      {o.items.map((i) => i.titleSnapshot).join(', ') || 'Empty order'}
                    </div>
                    <div className="row-s mono">{o.number} · {shortDate(o.createdAt)}</div>
                  </div>
                  <span className="row-v">{bdt(o.totalBdt)}</span>
                  <span className={`chip ${orderChip(o.status)}`}>{humanStatus(o.status)}</span>
                  <span className="row-x"><IcNext /></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="list"><div className="empty">No orders on this account.</div></div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row">
      <div className="row-main"><div className="row-t">{k}</div></div>
      <span className="row-v">{v}</span>
    </div>
  );
}
