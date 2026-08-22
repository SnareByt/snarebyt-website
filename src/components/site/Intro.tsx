'use client';

import { useEffect, useState } from 'react';
import { Wordmark } from './Wordmark';

/**
 * The entrance.
 *
 * A black curtain with the wordmark, which lifts to reveal the site. It is the
 * first impression of a studio that sells premium work, and it is worth the
 * two seconds — but only if it obeys some rules, because an intro that ignores
 * them is the thing people install ad-blockers over.
 *
 * ONCE PER SESSION, not per page. Held in sessionStorage rather than
 * localStorage: a returning visitor next week should see it again, someone
 * clicking through five pages in one visit should not.
 *
 * NEVER BLOCKS THE PAGE. The site is fully rendered underneath from the first
 * byte — this is an overlay, not a gate. A crawler, a screen reader following
 * the landmark order, and anyone with JavaScript off all get the site itself.
 *
 * ALWAYS SKIPPABLE, by click, key or scroll, and it never lasts longer than
 * 2.2 seconds on its own.
 *
 * OFF ENTIRELY for `prefers-reduced-motion`, and for the site's own motion
 * toggle in the Design screen. Someone who has asked their operating system to
 * stop animating things has asked for exactly this.
 *
 * THE FLASH PROBLEM, and why the markup is inverted: whether to play can only
 * be known in the browser, but deciding it in an effect means either the
 * curtain flashing for people who have seen it, or the site flashing before
 * the curtain for people who have not. So the overlay is rendered hidden and
 * an inline script — running before first paint, in the layout — adds a class
 * to <html> when it should play. CSS does the rest, and neither flash happens.
 */
export function Intro() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // The class is put there by the pre-paint script. Without it this visit is
    // not one that plays, and there is nothing to do.
    const root = document.documentElement;
    if (!root.classList.contains('intro-play')) { setGone(true); return; }

    // Remembered as soon as it starts, not when it finishes — someone who
    // navigates away mid-animation has still seen it.
    try { sessionStorage.setItem('sb_intro', '1'); } catch { /* private mode */ }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      /* `intro-lift` rather than removing `intro-play`.
         Removing it here would drop the curtain back to `display:none` and the
         lift would never be seen — the class is what makes the overlay visible
         at all. This second class releases the scroll lock immediately while
         leaving the curtain on screen to rise. */
      root.classList.add('intro-lift');
      // Unmounted only after the lift has played out, so the curtain is not
      // yanked off screen mid-transition.
      window.setTimeout(() => {
        root.classList.remove('intro-play', 'intro-lift');
        setGone(true);
      }, 900);
    };

    const timer = window.setTimeout(finish, 2200);

    window.addEventListener('pointerdown', finish, { once: true });
    window.addEventListener('keydown', finish, { once: true });
    window.addEventListener('wheel', finish, { once: true, passive: true });
    window.addEventListener('touchstart', finish, { once: true, passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', finish);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('wheel', finish);
      window.removeEventListener('touchstart', finish);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={leaving ? 'intro intro-out' : 'intro'}
      /* Hidden from assistive technology entirely. It carries no information
         the site does not already carry, and a screen reader announcing a
         decorative curtain before the page is a worse start than no curtain. */
      aria-hidden="true"
    >
      <div className="intro-mark">
        <Wordmark idPrefix="wmIntro" large />
      </div>
      <div className="intro-line" />
      <div className="intro-skip">Tap to enter</div>
    </div>
  );
}
