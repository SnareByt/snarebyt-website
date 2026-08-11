'use client';

import { useEffect } from 'react';
import { useCart } from './Cart';

/**
 * Empties the cart once a payment has come back successfully.
 *
 * Only on the success page — a failed or cancelled payment must leave the cart
 * intact so the buyer can simply try again rather than rebuild it.
 */
export function ClearCartOnMount() {
  const { clear, ready, count } = useCart();
  useEffect(() => {
    if (ready && count) clear();
  }, [ready, count, clear]);
  return null;
}
