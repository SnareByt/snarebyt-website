'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Reveal-on-scroll.
 *
 * `.rv` and `.rv-l` are opacity 0 and `.mask-line > span` sits translated
 * outside its clipping box until `.in` is added. In the prototype an
 * IntersectionObserver did that; the CSS was ported without it, which left
 * every headline, paragraph, button and proof strip invisible.
 *
 * Being invisible is the failure that matters, so this errs heavily towards
 * revealing:
 *
 *   - Anything already on screen is revealed immediately from its measured
 *     rectangle. Observer callbacks are asynchronous and do not fire at all
 *     while a document is hidden, so the first screen must not depend on one.
 *   - That measurement is repeated on load, on fonts settling, on resize and
 *     when the tab becomes visible. A single reading at mount is taken before
 *     web fonts arrive, and the layout it describes is not the layout the
 *     visitor ends up looking at — that alone left production blank.
 *   - No observer support at all means reveal everything and skip the
 *     animation entirely.
 */
const SELECTOR = '.rv, .rv-l, .mask-line';

export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    if (!els.length) return;

    const onScreen = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    };

    const revealVisible = () => {
      for (const el of els) {
        if (!el.classList.contains('in') && onScreen(el)) el.classList.add('in');
      }
    };

    // Stagger a row of cards rather than snapping them in together.
    els.forEach((el, i) => {
      const delay = `${(i % 6) * 70}ms`;
      const target = el.classList.contains('mask-line')
        ? (el.firstElementChild as HTMLElement | null)
        : el;
      if (target) target.style.transitionDelay = delay;
    });

    revealVisible();

    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });

    window.addEventListener('load', revealVisible);
    window.addEventListener('resize', revealVisible);
    document.addEventListener('visibilitychange', revealVisible);
    // Web fonts change line heights, which moves everything below them.
    document.fonts?.ready.then(revealVisible).catch(() => {});

    return () => {
      io.disconnect();
      window.removeEventListener('load', revealVisible);
      window.removeEventListener('resize', revealVisible);
      document.removeEventListener('visibilitychange', revealVisible);
    };
    // Re-arm per route: a client navigation swaps the DOM without remounting
    // the layout, so the new page's elements would never be observed.
  }, [pathname]);

  return null;
}
