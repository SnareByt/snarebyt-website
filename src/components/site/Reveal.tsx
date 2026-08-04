'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Reveal-on-scroll.
 *
 * `.rv` and `.rv-l` are `opacity:0` in the stylesheet, and `.mask-line > span`
 * is translated fully out of its clipping box. They become visible only once
 * `.in` is added. In the prototype an IntersectionObserver did that; porting
 * the CSS without the observer left every headline, paragraph, button and
 * proof strip permanently invisible while still present in the DOM — which is
 * why text-based checks kept passing against a blank-looking page.
 *
 * Ported from reference/SnareByt.html: threshold .12, a slight negative bottom
 * margin so things reveal just before they are fully on screen, and a small
 * staggered delay so a row of cards arrives in sequence rather than at once.
 */
const SELECTOR = '.rv, .rv-l, .mask-line';

export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));

    // No observer support: show everything rather than hide it. Content that
    // cannot animate must still be readable.
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('in'));
      return;
    }

    // Reveal anything already on screen synchronously, before involving the
    // observer at all. IntersectionObserver callbacks are asynchronous and do
    // not fire while a document is hidden, so leaving the hero to the observer
    // risks the first screen rendering blank — which is exactly what happened.
    // Measuring rectangles cannot fail that way.
    const onScreen = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    };
    els.forEach((el) => { if (onScreen(el)) el.classList.add('in'); });

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

    els.forEach((el, i) => {
      if (el.classList.contains('in')) return;
      const delay = `${(i % 6) * 70}ms`;
      // On a mask-line it is the inner span that transitions, not the wrapper.
      if (el.classList.contains('mask-line')) {
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) inner.style.transitionDelay = delay;
      } else {
        el.style.transitionDelay = delay;
      }
      io.observe(el);
    });

    return () => io.disconnect();
    // Re-run per route: a client navigation swaps the DOM without remounting
    // the layout, so the new page's elements would otherwise never be observed.
  }, [pathname]);

  return null;
}
