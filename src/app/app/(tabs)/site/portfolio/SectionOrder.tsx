'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPortfolioOrder } from '@/app/admin/(dash)/portfolio/actions';
import { CATEGORY_LABEL, move, type PortfolioCategory } from '@/lib/portfolio-order';
import { useToast } from '@/components/app/Ui';

/**
 * Which section goes where on the public portfolio page.
 *
 * Up and down buttons, the same choice the desktop made and for the same
 * reasons — except more so here. Drag-and-drop reordering inside a page that
 * itself scrolls is the single worst interaction on a touchscreen: the gesture
 * that picks an item up is the gesture that scrolls, so the list either fights
 * the drag or the drag fights the list. Two buttons cannot be ambiguous.
 *
 * The move is applied locally and saved after, so it feels instant. A refused
 * save puts the list back rather than leaving the screen showing an order the
 * site does not actually have.
 */
export function SectionOrder({
  initial, counts,
}: {
  initial: PortfolioCategory[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState<PortfolioCategory[]>(initial);
  const [saved, setSaved] = useState<PortfolioCategory[]>(initial);
  const [busy, start] = useTransition();

  const dirty = order.join(',') !== saved.join(',');

  function save() {
    const next = order;
    start(async () => {
      try {
        const res = await setPortfolioOrder(next);
        if (res.ok) {
          setSaved(next);
          toast(res.message);
          router.refresh();
        } else {
          setOrder(saved);
          toast(res.error, 'bad');
        }
      } catch {
        setOrder(saved);
        toast('Could not reach the server. The order is unchanged.', 'bad');
      }
    });
  }

  return (
    <div>
      <div className="sec">
        <h3>Section order</h3>
        {dirty && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save order'}
          </button>
        )}
      </div>

      <div className="list">
        {order.map((key, i) => {
          const n = counts[key] ?? 0;
          return (
            <div key={key} className="row">
              <div className="row-main">
                <div className="row-t">{i + 1}. {CATEGORY_LABEL[key] ?? key}</div>
                <div className="row-s">
                  {n === 0
                    ? 'No credits — hidden on the site'
                    : `${n} ${n === 1 ? 'credit' : 'credits'}`}
                </div>
              </div>
              <button
                type="button" className="chip-btn"
                aria-label={`Move ${CATEGORY_LABEL[key] ?? key} up`}
                disabled={i === 0 || busy}
                onClick={() => setOrder((o) => move(o, key, 'up'))}
              >
                ↑
              </button>
              <button
                type="button" className="chip-btn"
                aria-label={`Move ${CATEGORY_LABEL[key] ?? key} down`}
                disabled={i === order.length - 1 || busy}
                onClick={() => setOrder((o) => move(o, key, 'down'))}
              >
                ↓
              </button>
            </div>
          );
        })}
      </div>

      <p className="hint">
        {dirty
          ? 'Not saved yet — press Save order.'
          : 'A section with no credits does not appear on the site at all, so an empty one can sit anywhere in this list.'}
      </p>
    </div>
  );
}
