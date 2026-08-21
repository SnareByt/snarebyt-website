/**
 * The admin's map of itself.
 *
 * One list, used by three things: the desktop sidebar, the phone tab bar, and
 * the "More" sheet behind it. Kept in a plain module rather than inside the
 * layout so the client components can import it without the layout having to
 * serialise it down to them, and so adding a screen means editing one array
 * rather than three.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the tab bar, where a full one would wrap. */
  short?: string;
  icon: string;
};

export type NavGroup = { group: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { href: '/admin', label: 'Dashboard', short: 'Home', icon: '◧' },
    { href: '/admin/analytics', label: 'Analytics', icon: '◪' },
  ]},
  { group: 'Catalogue', items: [
    { href: '/admin/beats', label: 'Beats', icon: '♫' },
    { href: '/admin/releases', label: 'Releases', icon: '◉' },
    { href: '/admin/portfolio', label: 'Portfolio', icon: '▣' },
    { href: '/admin/services', label: 'Services', icon: '✦' },
  ]},
  { group: 'Content', items: [
    { href: '/admin/site', label: 'Site editor', short: 'Site', icon: '✎' },
    { href: '/admin/media', label: 'Media', icon: '🖼' },
    { href: '/admin/legal', label: 'Legal pages', short: 'Legal', icon: '§' },
  ]},
  { group: 'Business', items: [
    { href: '/admin/orders', label: 'Orders', icon: '₿' },
    { href: '/admin/projects', label: 'Projects', icon: '◈' },
    { href: '/admin/customers', label: 'Artist accounts', short: 'Artists', icon: '☺' },
  ]},
  { group: 'System', items: [
    { href: '/admin/settings', label: 'Settings', icon: '⚙' },
    { href: '/admin/account', label: 'Your account', short: 'Account', icon: '⚿' },
  ]},
];

/**
 * The five that go in the phone tab bar.
 *
 * Chosen by what gets opened on a phone: the things you check when a
 * notification arrives, not the things you sit down to edit. Everything else
 * is one tap away behind More, which is why this list can stay short — five
 * targets across a 360px screen is already 72px each, and smaller than that
 * is a mis-tap.
 */
export const TAB_HREFS = ['/admin', '/admin/orders', '/admin/projects', '/admin/beats'];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/**
 * Which nav entry a URL belongs to.
 *
 * Longest match wins, so /admin/orders/abc123 lights up Orders rather than
 * Dashboard — every path starts with /admin, and without this the Dashboard
 * tab would look active on every screen in the panel.
 */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of ALL_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}
