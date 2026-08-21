'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LegalResult } from './actions';

type Save = (id: string, fd: FormData) => Promise<LegalResult>;

export type LegalRow = {
  id: string;
  slug: string;
  title: string;
  bodyMarkdown: string;
  version: string;
  effectiveFrom: string;
  lawyerReviewNeeded: boolean;
  updatedAt: string;
};

/** One legal page, opened to edit. */
export function LegalEditor({ page, action }: { page: LegalRow; action: Save }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className="sec">
      <div className="sec-hd">
        <h2>{page.title}</h2>
        <span className="chip mono">/legal/{page.slug}</span>
        <span className="chip">v{page.version}</span>
        {page.lawyerReviewNeeded
          ? <span className="chip warn">Not lawyer-reviewed</span>
          : <span className="chip ok">Reviewed</span>}
        <span className="sp" />
        <a className="btn b-gh b-sm" href={`/legal/${page.slug}`} target="_blank" rel="noopener noreferrer">
          View
        </a>
        <button type="button" className="btn b-gh b-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      <div className="sub">
        {page.bodyMarkdown.trim().length} characters · last changed {page.updatedAt}
      </div>

      {open ? (
        <form
          className="svc-block" style={{ marginTop: '1rem' }}
          /* onSubmit rather than the `action` prop, deliberately. React resets
             a form after an action runs, which on a refused save would throw
             away everything just typed — on a page this long that is an
             afternoon's work gone because a version number was blank. */
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await action(page.id, fd);
              setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
              if (res.ok) router.refresh();
            });
          }}
        >
          <div className="sec-hd" style={{ marginBottom: '.8rem' }}>
            <h3 style={{ margin: 0, fontSize: '.82rem' }}>Edit page</h3>
            <span className="sp" />
            <button className="btn b-red b-sm" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>

          {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

          <div className="fg">
            <label className="fl" htmlFor={`t-${page.id}`}>Title</label>
            <input className="in" id={`t-${page.id}`} name="title" defaultValue={page.title} />
          </div>

          <div className="two">
            <div className="fg">
              <label className="fl" htmlFor={`v-${page.id}`}>Version</label>
              <input className="in" id={`v-${page.id}`} name="version" defaultValue={page.version} />
              <div className="hint">Bump this when the terms actually change.</div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor={`e-${page.id}`}>Effective from</label>
              <input className="in" id={`e-${page.id}`} name="effectiveFrom" type="date"
                defaultValue={page.effectiveFrom} />
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor={`b-${page.id}`}>Page text</label>
            <textarea className="in" id={`b-${page.id}`} name="bodyMarkdown" rows={18}
              defaultValue={page.bodyMarkdown} spellCheck />
            <div className="hint">
              Markdown. <code>##</code> for a section heading, <code>-</code> for a bullet,{' '}
              <code>**bold**</code>, <code>[label](https://…)</code> for a link, a blank line
              between paragraphs. The title above is already printed at the top of the page, so
              there is no need to repeat it here.
            </div>
          </div>

          <label className="check" style={{ marginTop: '.9rem' }}>
            <input type="checkbox" name="lawyerReviewNeeded" defaultChecked={page.lawyerReviewNeeded} />
            <span>This page still needs a lawyer to look at it</span>
          </label>
          <div className="hint">
            Untick only once someone qualified actually has. It shows as a warning here until then,
            and never on the public page.
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** Add a page. Deliberately spare — the writing happens in the editor above. */
export function NewLegalPage({ action }: { action: Save }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn b-gh b-sm" onClick={() => setOpen(true)}>
        Add a page
      </button>
    );
  }

  return (
    <form
      className="svc-block" style={{ marginTop: '1rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await action('new', fd);
          setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
          if (res.ok) { setOpen(false); router.refresh(); }
        });
      }}
    >
      <div className="sec-hd" style={{ marginBottom: '.8rem' }}>
        <h3 style={{ margin: 0, fontSize: '.82rem' }}>New legal page</h3>
        <span className="sp" />
        <button type="button" className="btn b-gh b-sm" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn b-red b-sm" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      <div className="two">
        <div className="fg">
          <label className="fl" htmlFor="new-title">Title</label>
          <input className="in" id="new-title" name="title" placeholder="Refund Policy" />
        </div>
        <div className="fg">
          <label className="fl" htmlFor="new-slug">Web address</label>
          <input className="in mono" id="new-slug" name="slug" placeholder="refund-policy" />
          <div className="hint">Becomes /legal/… and cannot be changed afterwards.</div>
        </div>
      </div>
    </form>
  );
}
