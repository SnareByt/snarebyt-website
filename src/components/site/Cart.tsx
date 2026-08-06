'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * The cart holds identifiers, never prices.
 *
 * What the browser stores is a beat id and a licence tier id. Every figure is
 * recomputed on the server from the database when the order is placed, so a
 * tampered localStorage cannot buy a ৳12,000 exclusive for ৳50.
 *
 * It lives in localStorage because there are no customer accounts yet — a
 * visitor can build a cart without signing up for anything.
 */
export type CartLine = { beatId: string; tierId: string };

type Ctx = {
  lines: CartLine[];
  add: (line: CartLine) => void;
  remove: (beatId: string, tierId: string) => void;
  clear: () => void;
  has: (beatId: string, tierId: string) => boolean;
  count: number;
  ready: boolean;
};

const CartCtx = createContext<Ctx>({
  lines: [], add: () => {}, remove: () => {}, clear: () => {},
  has: () => false, count: 0, ready: false,
});

export const useCart = () => useContext(CartCtx);

const KEY = 'sb_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  // Starts empty so the server render and the first client render agree;
  // reading localStorage during render is a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) {
          setLines(parsed.filter((l) => typeof l?.beatId === 'string' && typeof l?.tierId === 'string'));
        }
      }
    } catch {
      // A corrupt cart is not worth breaking the page over.
      window.localStorage.removeItem(KEY);
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }, []);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      // One licence tier per beat per order — the schema enforces this too.
      if (prev.some((l) => l.beatId === line.beatId && l.tierId === line.tierId)) return prev;
      const next = [...prev, line];
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const remove = useCallback((beatId: string, tierId: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => !(l.beatId === beatId && l.tierId === tierId));
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), [persist]);
  const has = useCallback(
    (beatId: string, tierId: string) => lines.some((l) => l.beatId === beatId && l.tierId === tierId),
    [lines],
  );

  return (
    <CartCtx.Provider value={{ lines, add, remove, clear, has, count: lines.length, ready }}>
      {children}
    </CartCtx.Provider>
  );
}

/** Cart icon for the nav. Renders no count until localStorage has been read. */
export function CartButton() {
  const { count, ready } = useCart();
  return (
    <Link href="/cart" className="icon-btn" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
        <path d="M2 3h2.2l2.6 12.2h11.4L21 7H6" />
      </svg>
      <span className={ready && count ? 'cart-count show' : 'cart-count'}>{count}</span>
    </Link>
  );
}
