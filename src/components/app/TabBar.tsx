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

  /**
   * Which tab owns the current screen.
   *
   * An index rather than a per-tab boolean, because the bar now slides one
   * lozenge between positions instead of lighting five independent tabs, and
   * a slide needs to know where to slide TO.
   *
   * "/app" is matched exactly — as a prefix it would claim every screen in the
   * app and leave Today lit everywhere. The other three own their subtrees, so
   * a beat's detail page keeps Beats selected, which is what a native tab bar
   * does when you drill into one.
   *
   * More is the fallback, and deliberately so. Settings, Security, Alerts,
   * Discount codes, Customers, Analytics and Services all live behind More and
   * none of their URLs begin with /app/more. Without this they would light
   * nothing at all, and the lozenge would sit under Today claiming to be
   * somewhere the screen is not.
   */
  const target = pending ?? path;
  const activeIndex = (() => {
    if (target === '/app') return 0;
    const owned = TABS.findIndex(
      (t) => t.href !== '/app' && t.href !== '/app/more' && target.startsWith(t.href),
    );
    if (owned !== -1) return owned;
    // Anything else under /app is part of the long tail.
    return TABS.length - 1;
  })();

  return (
    <nav
      className="tabbar"
      aria-label="Sections"
      /* The lozenge's position and width are pure CSS arithmetic over these
         two numbers, so adding or removing a tab needs no stylesheet change. */
      style={{ '--active': activeIndex, '--count': TABS.length } as React.CSSProperties}
    >
      {TABS.map(({ href, label, Icon, ...rest }, i) => {
        const on = i === activeIndex;
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
