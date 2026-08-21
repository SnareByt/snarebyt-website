'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV, TAB_HREFS, ALL_ITEMS, activeHref } from './nav-items';

/**
 * The sidebar list, with the current screen marked.
 *
 * The `.on` styling has existed in admin.css since the panel was built but
 * nothing ever applied it, so every screen looked identical in the sidebar.
 * Knowing where you are is not decoration — it is how you know the click
 * landed.
 */
export function SideNav({ badge }: { badge: Record<string, number> }) {
  const here = activeHref(usePathname());

  return (
    <nav className="side-nav">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="grp">{g.group}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={here === i.href ? 'on' : undefined}
              aria-current={here === i.href ? 'page' : undefined}>
              <span className="ic">{i.icon}</span>{i.label}
              {badge[i.href] ? <span className="ct">{badge[i.href]}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * The phone navigation: a frosted bar pinned to the bottom, and a sheet
 * holding everything that does not fit in it.
 *
 * Bottom rather than top because this is used one-handed on a phone, and the
 * bottom third of a 6" screen is the only part a thumb reaches without
 * shuffling the handset. It sits above the home indicator via safe-area
 * insets, so nothing lands under the gesture bar.
 *
 * Below 900px the sidebar is translated off-screen by CSS, which is where the
 * navigation went missing entirely — this is what replaces it.
 */
export function MobileNav({ badge, user }: { badge: Record<string, number>; user: string }) {
  const pathname = usePathname();
  const here = activeHref(pathname);
  const [open, setOpen] = useState(false);

  // Navigating closes the sheet. Without this it stays open over the screen it
  // just took you to, which reads as a tap that did nothing.
  useEffect(() => { setOpen(false); }, [pathname]);

  // A sheet that scrolls the page behind it is disorienting, and on iOS the
  // page keeps its scroll position when the sheet closes only if it never
  // moved. Restoring the exact previous value avoids fighting other code.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Escape closes it — the sheet is a dialog, and a dialog you can only leave
  // by finding the right button is a trap on a hardware keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const tabs = TAB_HREFS.map((h) => ALL_ITEMS.find((i) => i.href === h)!).filter(Boolean);
  // "More" counts as active whenever the current screen is not one of the
  // tabs, so there is never a moment with nothing lit.
  const moreActive = !tabs.some((t) => t.href === here);

  return (
    <>
      <nav className="tabbar" aria-label="Sections">
        {tabs.map((t) => {
          const on = here === t.href;
          const n = badge[t.href] ?? 0;
          return (
            <Link key={t.href} href={t.href} className={on ? 'tb on' : 'tb'}
              aria-current={on ? 'page' : undefined}>
              <span className="tb-ic">
                {t.icon}
                {n ? <span className="tb-ct">{n > 99 ? '99+' : n}</span> : null}
              </span>
              <span className="tb-l">{t.short ?? t.label}</span>
            </Link>
          );
        })}
        <button
          type="button" className={moreActive ? 'tb on' : 'tb'}
          onClick={() => setOpen(true)}
          aria-expanded={open} aria-haspopup="dialog"
        >
          <span className="tb-ic">☰</span>
          <span className="tb-l">More</span>
        </button>
      </nav>

      {open ? (
        <div className="sheet-scrim" onClick={() => setOpen(false)}>
          <div
            className="sheet" role="dialog" aria-modal="true" aria-label="All sections"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-grab" aria-hidden="true" />
            <div className="sheet-hd">
              <span className="sub">{user}</span>
              <span className="sp" />
              {/* The way back. Reached from the installed phone app, the full
                  dashboard is otherwise a one-way trip — there is no browser
                  chrome to go back with in standalone mode. */}
              <a className="btn b-gh b-sm" href="/app">Phone app</a>
              <button type="button" className="btn b-gh b-sm" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="sheet-body">
              {NAV.map((g) => (
                <div key={g.group}>
                  <div className="grp">{g.group}</div>
                  <div className="sheet-grid">
                    {g.items.map((i) => {
                      const on = here === i.href;
                      const n = badge[i.href] ?? 0;
                      return (
                        <Link key={i.href} href={i.href} className={on ? 'sh-i on' : 'sh-i'}
                          aria-current={on ? 'page' : undefined}>
                          <span className="ic">{i.icon}</span>
                          <span className="sh-l">{i.label}</span>
                          {n ? <span className="ct">{n}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
