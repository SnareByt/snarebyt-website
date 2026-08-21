'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IcHome, IcBeats, IcOrders, IcSite, IcMore } from './Icons';

/**
 * The five tabs.
 *
 * Five is not an arbitrary count — it is what fits across a phone with labels
 * that are readable rather than truncated, and it is the ceiling iOS itself
 * uses before collapsing into "More". The desktop admin's thirteen sidebar
 * links are grouped into these five by how often Samir actually needs them,
 * not by which database table they belong to:
 *
 *   Today   the morning glance: money in, what needs doing
 *   Beats   the catalogue he changes most — prices, files, publishing
 *   Orders  everything with money attached, plus the bookings behind it
 *   Site    what the public sees: releases, portfolio, page content, media
 *   More    the long tail — customers, analytics, settings, account
 */
const TABS = [
  { href: '/app', label: 'Today', Icon: IcHome },
  { href: '/app/beats', label: 'Beats', Icon: IcBeats },
  { href: '/app/orders', label: 'Orders', Icon: IcOrders, badgeKey: 'orders' },
  { href: '/app/site', label: 'Site', Icon: IcSite },
  { href: '/app/more', label: 'More', Icon: IcMore },
] as const;

export function TabBar({ badges }: { badges: { orders: number } }) {
  const path = usePathname();

  /**
   * The tab lights up on touch, not on arrival.
   *
   * Every screen here is `force-dynamic` and queries Postgres, so a tap is
   * followed by a round trip before `usePathname()` changes. Driving the
   * highlight from the pathname alone means the tab you just pressed stays
   * dim for a few hundred milliseconds — the single clearest tell that this
   * is a web app rather than a native one. Native tab bars commit to the
   * press immediately and let the content catch up.
   *
   * So the pressed tab is recorded locally and wins until the real pathname
   * agrees with it.
   */
  const [pending, setPending] = useState<string | null>(null);

  /* Reconcile once the navigation lands. This also covers the cases the tap
     handler cannot see: a back gesture, a redirect, or a navigation that
     failed and never moved — all of which end with the pathname settling and
     the optimistic guess having to give way to it. */
  useEffect(() => setPending(null), [path]);

  const isActive = (href: string) => {
    // "/app" would otherwise match every path in the app, lighting up Today
    // on every screen. Every other tab owns its whole subtree.
    const target = pending ?? path;
    return href === '/app' ? target === '/app' : target.startsWith(href);
  };

  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon, ...rest }) => {
        const on = isActive(href);
        const count = 'badgeKey' in rest ? badges[rest.badgeKey as 'orders'] : 0;

        return (
          <Link
            key={href}
            href={href}
            className="tab"
            data-on={on ? '1' : '0'}
            aria-current={on ? 'page' : undefined}
            /* Fires before navigation begins, so the highlight moves within
               the same frame as the touch. */
            onClick={() => setPending(href)}
          >
            <Icon />
            {count > 0 && (
              <span className="tab-badge" aria-label={`${count} awaiting payment`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
