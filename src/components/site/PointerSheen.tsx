'use client';

import { useEffect, useRef } from 'react';

/**
 * The cursor light.
 *
 * A large, soft crimson glow that follows the pointer around the page, plus
 * the card highlight that tracks under it.
 *
 * What separates this from the cheap version of the same idea is the easing.
 * A glow pinned exactly to the cursor reads as a sticker dragged across the
 * screen; one that eases toward it — catching up over a few frames — reads as
 * light with weight behind it. The lerp factor is the whole effect.
 *
 * It lights rather than covers: `screen` blending means it can only ever add
 * light, so it glows against the near-black page and does almost nothing to
 * white text passing underneath it.
 *
 * Never on a phone (no cursor to follow, and the audience is mostly mobile),
 * never under prefers-reduced-motion, and the loop stops itself once the glow
 * has settled so an idle tab does no work at all.
 */
export function PointerSheen() {
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || still.matches) return;

    const glow = glowRef.current;
    if (!glow) return;

    // Target is where the pointer is; current is where the light has got to.
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let raf = 0;
    let visible = false;

    // Card highlight state, kept here so one listener serves both.
    let activeCard: HTMLElement | null = null;
    let cardPending: { card: HTMLElement; x: number; y: number } | null = null;

    const tick = () => {
      // Ease toward the pointer. 0.14 is slow enough to read as inertia and
      // fast enough not to feel laggy.
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      glow.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;

      if (cardPending) {
        const { card, x, y } = cardPending;
        cardPending = null;
        card.style.setProperty('--mx', `${x}%`);
        card.style.setProperty('--my', `${y}%`);
      }

      // Stop the loop once it has caught up — an idle tab should burn nothing.
      if (Math.abs(tx - cx) < 0.4 && Math.abs(ty - cy) < 0.4) {
        cx = tx; cy = ty;
        glow.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;

      if (!visible) {
        visible = true;
        // Placed before it is shown, so it fades in where the cursor already
        // is instead of flying in from the middle of the screen.
        cx = tx; cy = ty;
        glow.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
        glow.dataset.on = '1';
      }

      const card = (e.target as Element | null)?.closest?.('.card') as HTMLElement | null;
      if (card !== activeCard) {
        if (activeCard) activeCard.removeAttribute('data-sheen');
        activeCard = card;
        if (card) card.setAttribute('data-sheen', 'on');
      }
      if (card) {
        const r = card.getBoundingClientRect();
        cardPending = {
          card,
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        };
      }

      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      visible = false;
      glow.removeAttribute('data-on');
      if (activeCard) activeCard.removeAttribute('data-sheen');
      activeCard = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    // A pointer that leaves through the window edge never fires pointerleave
    // on the document in every browser, so this covers the gap.
    window.addEventListener('blur', onLeave);

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (raf) cancelAnimationFrame(raf);
      if (activeCard) activeCard.removeAttribute('data-sheen');
    };
  }, []);

  return <div ref={glowRef} className="cursor-glow" aria-hidden="true" />;
}
