'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon, ...rest }) => {
        /* "/app" would otherwise match every path in the app, lighting up
           Today on every screen. Every other tab owns its whole subtree. */
        const on = href === '/app' ? path === '/app' : path.startsWith(href);
        const count = 'badgeKey' in rest ? badges[rest.badgeKey as 'orders'] : 0;

        return (
          <Link
            key={href}
            href={href}
            className="tab"
            data-on={on ? '1' : '0'}
            aria-current={on ? 'page' : undefined}
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
