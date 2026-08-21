'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPortfolioOrder } from './actions';
import {
  CATEGORY_LABEL, move, type PortfolioCategory,
} from '@/lib/portfolio-order';

/**
 * Which section goes where on the public portfolio page.
 *
 * Up and down buttons rather than drag-and-drop. With four items a drag
 * implementation is more code than the thing it reorders, and it is the
 * version that fails on a touchscreen, fails for anyone using a keyboard, and
 * gives no feedback about where an item will land. Two buttons work
 * everywhere and say exactly what they do.
 *
 * The list is moved locally first and saved after, so reordering feels
 * instant. A refused save puts the list back rather than leaving the screen
 * showing an order the site does not have.
 */
export function SectionOrder({
  initial, counts,
}: {
  initial: PortfolioCategory[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<PortfolioCategory[]>(initial);
  const [saved, setSaved] = useState<PortfolioCategory[]>(initial);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = order.join(',') !== saved.join(',');

  function shift(key: PortfolioCategory, direction: 'up' | 'down') {
    setMsg(null);
    setOrder((o) => move(o, key, direction));
  }

  function save() {
    const next = order;
    start(async () => {
      const res = await setPortfolioOrder(next);
      if (res.ok) {
        setSaved(next);
        setMsg({ ok: true, text: res.message });
        router.refresh();
      } else {
        // Put the screen back to what the site actually has.
        setOrder(saved);
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="card pad">
      <div className="sec-hd">
        <h2>Section order</h2>
        <span className="chip">public page</span>
        <span className="sp" />
        {dirty ? (
          <>
            <button type="button" className="btn b-gh b-sm" disabled={busy}
              onClick={() => { setOrder(saved); setMsg(null); }}>
              Cancel
            </button>
            <button type="button" className="btn b-red b-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save order'}
            </button>
          </>
        ) : null}
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      <div className="ord" style={{ marginTop: '.9rem' }}>
        {order.map((key, i) => {
          const n = counts[key] ?? 0;
          return (
            <div key={key} className="ord-row">
              <span className="ord-n">{i + 1}</span>
              <div className="ord-b">
                <div className="ord-t">{CATEGORY_LABEL[key] ?? key}</div>
                <div className="sub">
                  {n === 0
                    ? 'No credits — this section is hidden on the site'
                    : `${n} ${n === 1 ? 'credit' : 'credits'}`}
                </div>
              </div>
              <div className="ord-acts">
                <button
                  type="button" className="ib" aria-label={`Move ${CATEGORY_LABEL[key]} up`}
                  disabled={i === 0 || busy} onClick={() => shift(key, 'up')}
                >↑</button>
                <button
                  type="button" className="ib" aria-label={`Move ${CATEGORY_LABEL[key]} down`}
                  disabled={i === order.length - 1 || busy} onClick={() => shift(key, 'down')}
                >↓</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hint" style={{ marginTop: '.9rem' }}>
        A section with no credits does not appear on the site at all, so an empty one can sit
        anywhere in this list without showing an empty heading.
      </div>
    </div>
  );
}
