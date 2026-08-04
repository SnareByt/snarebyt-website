'use client';

import { useState } from 'react';

export type FaqItem = { q: string; a: string };

/**
 * Accordion, matching the prototype's `.faq` / `.faq.open` markup.
 *
 * Rendered as real buttons rather than the prototype's bare <q> so it is
 * reachable by keyboard and announced correctly — the visual result is
 * identical, since `.faq q` styles the element either way.
 */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;

  return (
    <div>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div className={isOpen ? 'faq open' : 'faq'} key={item.q}>
            <q
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(isOpen ? null : i);
                }
              }}
            >
              {item.q}
              <i>+</i>
            </q>
            <div className="a">
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
