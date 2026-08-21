'use client';

import { useEffect, useState } from 'react';

export type LegalLink = { slug: string; title: string };

/**
 * The footer's legal links, opened as a panel instead of a page.
 *
 * Someone checking what "non-exclusive" means is halfway through choosing a
 * licence. Sending them to another page loses the cart, the beat they were
 * listening to and their place; a panel answers the question and closes.
 *
 * The text is still a real page at /legal/<slug> — this fetches that page's
 * rendered HTML rather than duplicating it. So the terms exist at a URL that
 * can be linked, printed and cited, and there is exactly one copy of them.
 */
export function LegalDialog({ links }: { links: LegalLink[] }) {
  const [open, setOpen] = useState<LegalLink | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) { setHtml(null); setFailed(false); return; }

    let cancelled = false;
    setHtml(null);
    setFailed(false);

    fetch(`/api/legal/${encodeURIComponent(open.slug)}`, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { html: string }) => { if (!cancelled) setHtml(d.html); })
      // A panel that cannot load its text must not look like empty terms.
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [open]);

  // Escape closes, and the page behind must not scroll while it is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {links.map((l) => (
        <a
          key={l.slug}
          href={`/legal/${l.slug}`}
          onClick={(e) => {
            // Ctrl/cmd-click, middle-click and "open in new tab" must still
            // behave like the ordinary link this really is.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            setOpen(l);
          }}
        >
          {l.title}
        </a>
      ))}

      {open ? (
        <div className="lg-scrim" onClick={() => setOpen(null)}>
          <div
            className="lg-card" role="dialog" aria-modal="true" aria-label={open.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lg-hd">
              <div>
                <div className="eyebrow">Legal</div>
                <h3>{open.title}</h3>
              </div>
              <button type="button" className="lg-x" onClick={() => setOpen(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="lg-body">
              {failed ? (
                <p className="note">
                  This could not be loaded just now.{' '}
                  <a href={`/legal/${open.slug}`}>Open the full page instead</a>.
                </p>
              ) : html === null ? (
                <p className="note">Loading…</p>
              ) : (
                <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>

            <div className="lg-ft">
              <a className="btn btn-ghost btn-sm" href={`/legal/${open.slug}`}>Open as a page</a>
              <span className="sp" />
              <button type="button" className="btn btn-red btn-sm" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
