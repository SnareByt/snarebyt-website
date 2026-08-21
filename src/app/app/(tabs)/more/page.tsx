import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import {
  IcNext, IcProject, IcCustomer, IcService, IcAnalytics, IcLock, IcBell, IcSettings,
  IcMoney,
} from '@/components/app/Icons';
import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

/**
 * More — the long tail.
 *
 * Everything that does not earn a tab of its own, in one list. The counts
 * matter as much as the labels: they let the screen answer "is anything
 * waiting?" without opening anything.
 */
export default async function MorePage() {
  const user = await requireAdmin();

  /**
   * Every number on this screen is a subtitle under a link that works without
   * it. They are decoration, and decoration must never be why a screen fails
   * to load — but that is exactly what happened: the whole tab returned a 500
   * because `WebAuthnCredential` and `PushDevice` did not exist yet, while
   * `/app/login` stayed up purely because its identical count was wrapped.
   *
   * `Promise.all` made it worse by design: one rejection discards five
   * successful queries. `allSettled` keeps what worked and shows a dash for
   * what did not, so a missing table costs one subtitle rather than the only
   * route to Settings, Security and Alerts.
   */
  const results = await Promise.allSettled([
    prisma.project.count({ where: { status: { not: 'DELIVERED' } } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.service.count({ where: { active: true } }),
    prisma.pushDevice.count({ where: { userId: user.id, disabledReason: null } }),
    prisma.webAuthnCredential.count({ where: { userId: user.id } }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.discountCode.count({ where: { active: true } }),
  ]);

  /* null, not 0. "0 passkeys" is a claim; a dash admits the number could not
     be fetched, which is the truth and points at the real problem. */
  const [openProjects, customers, services, devices, passkeys, sessions, activeCodes] =
    results.map((r) => (r.status === 'fulfilled' ? r.value : null));

  const n = (v: number | null) => (v === null ? '—' : String(v));

  return (
    <>
      <NavBar title="More" />

      <div className="big-title">
        <h2>More</h2>
        <p>{user.email}</p>
      </div>

      <div className="wrap stack-lg">
        <div>
          <div className="sec"><h3>Work</h3></div>
          <div className="list">
            <Row href="/app/projects" Icon={IcProject} title="Bookings"
                 sub={`${n(openProjects)} open`} />
            <Row href="/app/customers" Icon={IcCustomer} title="Customers"
                 sub={`${n(customers)} account${customers === 1 ? '' : 's'}`} />
            <Row href="/app/services" Icon={IcService} title="Services and pricing"
                 sub={`${n(services)} on the site`} />
            <Row href="/app/discounts" Icon={IcMoney} title="Discount codes"
                 sub={activeCodes === null ? 'Could not check'
                   : activeCodes ? `${activeCodes} switched on`
                   : 'None switched on'} />
            <Row href="/app/analytics" Icon={IcAnalytics} title="Analytics"
                 sub="Traffic, plays and what sells" />
          </div>
        </div>

        <div>
          <div className="sec"><h3>This app</h3></div>
          <div className="list">
            {/* A count that could not be fetched is not "off" — saying so
                would send him to fix alerts that may be working fine. The
                chip only appears when the number is known to be zero. */}
            <Row href="/app/account/alerts" Icon={IcBell} title="Alerts"
                 sub={devices === null ? 'Could not check'
                   : devices ? `${devices} device${devices === 1 ? '' : 's'} receiving`
                   : 'Off on this device'}
                 chip={devices === 0 ? { text: 'off', tone: 'warn' } : undefined} />
            <Row href="/app/account/security" Icon={IcLock} title="Security"
                 sub={`${n(passkeys)} passkey${passkeys === 1 ? '' : 's'} · ${n(sessions)} signed-in device${sessions === 1 ? '' : 's'}`} />
            <Row href="/app/account/settings" Icon={IcSettings} title="Settings"
                 sub="Website access, checkout, currency and alerts" />
          </div>
        </div>

        <div>
          <div className="sec"><h3>The full dashboard</h3></div>
          <div className="list">
            {/* NOT target="_blank". Installed on the home screen, iOS opens a
                new tab in an in-app browser view with its OWN cookie store, so
                the session does not travel with it — and since signed-out
                admin URLs now answer 404 rather than redirecting to a login
                page, that looked exactly like being locked out. Navigating in
                place keeps the session and stays inside the app. */}
            <Link className="row" href="/admin">
              <div className="row-main">
                <div className="row-t">Open the full dashboard</div>
                <div className="row-s">
                  Portfolio, site editor, media, legal pages, discount codes
                </div>
              </div>
              <span className="row-x"><IcNext /></span>
            </Link>
            <a className="row" href="/" target="_blank" rel="noreferrer">
              <div className="row-main">
                <div className="row-t">View the public site</div>
                <div className="row-s">See what a visitor sees</div>
              </div>
              <span className="row-x"><IcNext /></span>
            </a>
          </div>
        </div>

        <SignOutButton />

        <p className="hint" style={{ textAlign: 'center' }}>
          Signed in as {user.name ?? user.email} · {user.role.toLowerCase()}
        </p>
      </div>
    </>
  );
}

function Row({
  href, Icon, title, sub, chip,
}: {
  href: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  title: string;
  sub: string;
  chip?: { text: string; tone: string };
}) {
  return (
    <Link href={href} className="row">
      <span className="thumb" style={{ width: 38, height: 38, color: 'var(--muted)' }} aria-hidden="true">
        <Icon className="ic-sm" />
      </span>
      <div className="row-main">
        <div className="row-t">{title}</div>
        <div className="row-s">{sub}</div>
      </div>
      {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
      <span className="row-x"><IcNext /></span>
    </Link>
  );
}
