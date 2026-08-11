'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * The cart holds identifiers, never prices.
 *
 * What the browser stores is a beat id and a licence tier id, or a service tier
 * id. Every figure is recomputed on the server from the database when the order
 * is placed, so a tampered localStorage cannot buy a ৳12,000 exclusive for ৳50.
 *
 * It lives in localStorage because there are no customer accounts yet — a
 * visitor can build a cart without signing up for anything.
 */
export type CartLine =
  | { kind: 'beat'; beatId: string; tierId: string }
  | { kind: 'service'; serviceTierId: string };

/** Stable identity for a line, so removal never depends on array position. */
export const lineKey = (l: CartLine) =>
  l.kind === 'service' ? `service:${l.serviceTierId}` : `beat:${l.beatId}:${l.tierId}`;

export const beatLine = (beatId: string, tierId: string): CartLine =>
  ({ kind: 'beat', beatId, tierId });
export const serviceLine = (serviceTierId: string): CartLine =>
  ({ kind: 'service', serviceTierId });

type Ctx = {
  lines: CartLine[];
  add: (line: CartLine) => void;
  remove: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
  count: number;
  ready: boolean;
};

const CartCtx = createContext<Ctx>({
  lines: [], add: () => {}, remove: () => {}, clear: () => {},
  has: () => false, count: 0, ready: false,
});

export const useCart = () => useContext(CartCtx);

const KEY = 'sb_cart';

/**
 * Carts saved before services were sellable have no `kind`, so anything with a
 * beat and a tier is read as a beat licence. Dropping those silently would
 * empty a cart someone had already built.
 */
function normalise(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown>;
    if (o.kind === 'service' && typeof o.serviceTierId === 'string') {
      out.push({ kind: 'service', serviceTierId: o.serviceTierId });
    } else if (typeof o.beatId === 'string' && typeof o.tierId === 'string') {
      out.push({ kind: 'beat', beatId: o.beatId, tierId: o.tierId });
    }
  }
  return out;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  // Starts empty so the server render and the first client render agree;
  // reading localStorage during render is a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setLines(normalise(JSON.parse(raw)));
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
      // A service package is likewise added once; ordering two of the same
      // package is a conversation, not a checkbox.
      if (prev.some((l) => lineKey(l) === lineKey(line))) return prev;
      const next = [...prev, line];
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => lineKey(l) !== key);
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), [persist]);
  const has = useCallback((key: string) => lines.some((l) => lineKey(l) === key), [lines]);

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
