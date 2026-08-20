'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Portal navigation.
 *
 * `startsWith` for the active state rather than an exact match, so an order
 * detail page still highlights Orders — a nav that goes blank as soon as you
 * drill into something loses you exactly when you most need to know where you
 * are.
 */
const TABS = [
  { href: '/account', label: 'Overview', exact: true },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/projects', label: 'Projects' },
  { href: '/account/settings', label: 'Settings' },
];

export function PortalNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname();

  return (
    <nav className="pt-nav" aria-label="Account sections">
      {TABS.map((t) => {
        const on = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
            {t.label}
            {t.href === '/account/projects' && unread > 0 && (
              <span className="n" aria-label={`${unread} unread`}>{unread}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
