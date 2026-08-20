'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wordmark } from './Wordmark';
import { CurrencySwitch } from './Currency';
import { CartButton } from './Cart';

export type NavLink = { label: string; href: string };

/**
 * Fixed top nav. Client-side because of three things the prototype does:
 * the bar turns solid once you scroll, the burger toggles a drawer, and the
 * drawer must close on navigation. Everything else is data from NavItem rows.
 */
/**
 * `account` is a slot rather than an import because this is a client
 * component and the account button needs the session, which only the server
 * can read. Passing the rendered element down keeps the header client-side
 * for the scroll and drawer behaviour without dragging auth into the bundle.
 */
export function SiteHeader({ links, account }: { links: NavLink[]; account?: React.ReactNode }) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the drawer whenever the route changes, otherwise it stays open
  // over the page you just navigated to.
  useEffect(() => setOpen(false), [pathname]);

  // A drawer that scrolls the page behind it feels broken on a phone.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <header id="nav" className={solid ? 'solid' : undefined}>
        <div className="nav-in">
          <Link href="/" className="brand" aria-label="SnareByt — home">
            <Wordmark idPrefix="wmNav" />
          </Link>

          <nav className="links">
            {links.map((l) => (
              <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="nav-act">
            <CurrencySwitch />
            <CartButton />
            {account}
            <button
              type="button"
              className={open ? 'burger x' : 'burger'}
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <i /><i /><i />
            </button>
          </div>
        </div>
      </header>

      <div id="drawer" className={open ? 'open' : undefined}>
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        {/* The bar has no room for these on a phone, so rather than dropping
            them they move in here — the account link because it is the point
            of the portal, and the currency switch because losing it would be
            a regression. */}
        <div className="drawer-foot">
          <Link href="/account" className="drawer-acct">Your account</Link>
          <CurrencySwitch />
        </div>
      </div>
    </>
  );
}
