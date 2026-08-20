'use client';

import { useEffect } from 'react';

/**
 * Makes cards aware of where the pointer is.
 *
 * Deliberately NOT a glowing object that trails the cursor. This site already
 * carries a lot of light, and a floating orb is the fastest way to make a
 * considered design look like a template. What this does instead is let the
 * highlight that already exists on a card follow the pointer across it, so
 * the surface reads as lit rather than as switched on — the difference
 * between a material and an effect.
 *
 * Rules it holds to:
 *
 *  · Fine pointers only. A touch screen has no cursor to follow, and firing
 *    this on every tap would cost battery for nothing — which matters when
 *    most of the audience is on a phone.
 *  · One document listener, not one per card, and the work is one
 *    closest() call plus two custom properties.
 *  · rAF-throttled, so it runs at most once per frame however fast the mouse
 *    moves, and only writes transform-safe properties — never anything that
 *    forces layout.
 *  · Silent under prefers-reduced-motion.
 */
export function PointerSheen() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || still.matches) return;

    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;
    let active: HTMLElement | null = null;

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      pending = null;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    };

    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.('.card') as HTMLElement | null;

      if (card !== active) {
        // Leaving a card parks its highlight in the middle so the fade-out
        // does not slide across the surface on the way to nothing.
        if (active) active.removeAttribute('data-sheen');
        active = card;
        if (card) card.setAttribute('data-sheen', 'on');
      }
      if (!card) return;

      const r = card.getBoundingClientRect();
      pending = {
        card,
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      if (active) active.removeAttribute('data-sheen');
      active = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
      if (active) active.removeAttribute('data-sheen');
    };
  }, []);

  return null;
}
