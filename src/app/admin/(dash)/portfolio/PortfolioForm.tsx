'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePortfolioItem, deletePortfolioItem } from './actions';
import { parseYouTubeId } from '@/lib/spotify';

/**
 * Add and edit a production credit.
 *
 * The screen has been read-only since it was built, so adding a credit meant
 * editing the seed file and redeploying. The actions existed; nothing called
 * them.
 *
 * `role` is required and stays required. A credit card cannot render without
 * stating exactly what SnareByt did, which is the one thing that stops a mix
 * ever being displayed as a production credit — and getting that wrong is a
 * claim about someone else's record, not a typo.
 */

const CATEGORIES = [
  { v: 'PRODUCED_BY_SNAREBYT', l: 'Produced by SnareByt' },
  { v: 'MIXED_AND_MASTERED_BY_SNAREBYT', l: 'Mixed & Mastered by SnareByt' },
  { v: 'SNAREBYT_RELEASES', l: 'SnareByt Releases' },
  { v: 'SELECTED_VISUAL_WORK', l: 'Selected Visual Work' },
];

const CTAS = ['Listen', 'Watch', 'Read', 'Open'];

export type PortfolioFormData = {
  id: string;
  title: string;
  clientName: string;
  category: string;
  role: string;
  externalUrl: string;
  videoUrl: string;
  ctaLabel: string;
  majorCredit: boolean;
  summary: string;
  published: boolean;
};

export default function PortfolioForm({
  mode, item,
}: {
  mode: 'create' | 'edit';
  item?: PortfolioFormData;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();

  // Live preview of the still, so a wrong link is visible before saving
  // rather than after it is on the public page.
  const [external, setExternal] = useState(item?.externalUrl ?? '');
  const [video, setVideo] = useState(item?.videoUrl ?? '');
  const ytId = parseYouTubeId(video) ?? parseYouTubeId(external);

  function close() { setOpen(false); setErrors({}); }

  function submit(formData: FormData) {
    start(async () => {
      const res = await savePortfolioItem(formData);
      if (res.ok) { close(); router.refresh(); }
      else setErrors(res.errors);
    });
  }

  function remove() {
    if (!item) return;
    if (!confirm(`Delete “${item.title}”?\n\nThis removes the credit from the site entirely.`)) return;
    startDelete(async () => {
      const res = await deletePortfolioItem(item.id);
      if (res.ok) { close(); router.refresh(); }
      else setErrors({ _: res.error });
    });
  }

  return (
    <>
      <button
        type="button"
        className={mode === 'create' ? 'btn b-red' : 'rowgo'}
        onClick={() => setOpen(true)}
      >
        {mode === 'create' ? '+ Add credit' : 'Edit'}
      </button>

      {open && (
        <>
          <div className="scrim on" onClick={close} />
          <div className="drawer on" role="dialog" aria-modal="true" aria-label={item?.title ?? 'Add a credit'}>
            <div className="dw-hd">
              <div>
                <div className="eyebrow">{mode === 'create' ? 'New credit' : 'Edit credit'}</div>
                <h3>{item?.title ?? 'Add a credit'}</h3>
              </div>
              <button type="button" className="x" onClick={close} aria-label="Close">✕</button>
            </div>

            <form action={submit}>
              <div className="dw-bd">
                {item?.id && <input type="hidden" name="id" value={item.id} />}
                {errors._ && <div className="note"><span>⚠</span><span>{errors._}</span></div>}

                <div className={`fg ${errors.title ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-title">Title <span className="req">*</span></label>
                  <input className="in" id="pf-title" name="title" defaultValue={item?.title ?? ''} required />
                  {errors.title && <div className="err">{errors.title}</div>}
                </div>

                <div className={`fg ${errors.clientName ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-client">Artist or brand <span className="req">*</span></label>
                  <input className="in" id="pf-client" name="clientName" defaultValue={item?.clientName ?? ''}
                    placeholder="SHEZAN, Grameenphone, Chorki…" required />
                  {errors.clientName && <div className="err">{errors.clientName}</div>}
                </div>

                <div className={`fg ${errors.role ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-role">What you did <span className="req">*</span></label>
                  <input className="in" id="pf-role" name="role" defaultValue={item?.role ?? ''}
                    placeholder="Mix &amp; master · Producer · Mix" required />
                  <div className="hint">
                    This prints on the card exactly as typed. It is what stops a mix credit ever
                    reading as a production credit, so it cannot be left blank.
                  </div>
                  {errors.role && <div className="err">{errors.role}</div>}
                </div>

                <div className="fg">
                  <label className="fl" htmlFor="pf-cat">Category</label>
                  <select className="in" id="pf-cat" name="category" defaultValue={item?.category ?? 'MIXED_AND_MASTERED_BY_SNAREBYT'}>
                    {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </div>

                <div className={`fg ${errors.externalUrl ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-url">Link</label>
                  <input className="in" id="pf-url" name="externalUrl" value={external}
                    onChange={(e) => setExternal(e.target.value)}
                    placeholder="https://youtu.be/… or any full URL" />
                  <div className="hint">
                    Where the card&rsquo;s button goes. Paste a YouTube link here and the card
                    gets that video&rsquo;s artwork, view count and player automatically —
                    nothing to upload.
                  </div>
                  {errors.externalUrl && <div className="err">{errors.externalUrl}</div>}
                </div>

                <div className={`fg ${errors.videoUrl ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-video">Video (optional)</label>
                  <input className="in" id="pf-video" name="videoUrl" value={video}
                    onChange={(e) => setVideo(e.target.value)}
                    placeholder="https://youtu.be/…" />
                  <div className="hint">
                    Only needed when the link above points somewhere else — a press piece or a
                    Wikipedia entry — but you still want the video on the card.
                  </div>
                  {errors.videoUrl && <div className="err">{errors.videoUrl}</div>}
                </div>

                {/* Seeing the real still before saving is what catches a wrong
                    id, which otherwise only shows up on the public page. */}
                {ytId && (
                  <div className="fg">
                    <label className="fl">Card artwork</label>
                    <div className="ytprev">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" />
                    </div>
                    <div className="hint">
                      Taken live from YouTube — <span className="mono">{ytId}</span>. Nothing is
                      stored, so it stays correct if the video&rsquo;s thumbnail changes.
                    </div>
                  </div>
                )}

                <div className="fg">
                  <label className="fl" htmlFor="pf-cta">Button label</label>
                  <select className="in" id="pf-cta" name="ctaLabel" defaultValue={item?.ctaLabel ?? 'Listen'}>
                    {CTAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className={`fg ${errors.summary ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="pf-sum">Summary</label>
                  <textarea className="in" id="pf-sum" name="summary" rows={3}
                    defaultValue={item?.summary ?? ''} />
                  <div className="hint">One or two lines, shown when the card is hovered.</div>
                  {errors.summary && <div className="err">{errors.summary}</div>}
                </div>

                <div className="f two">
                  <label className="inline">
                    <input type="checkbox" name="majorCredit" defaultChecked={item?.majorCredit ?? false} />
                    <span>
                      <b>Major credit</b>
                      <div className="hint">Adds the badge and pulls it forward.</div>
                    </span>
                  </label>
                  <label className="inline">
                    <input type="checkbox" name="published" defaultChecked={item?.published ?? true} />
                    <span>
                      <b>Published</b>
                      <div className="hint">Untick to hide it without deleting.</div>
                    </span>
                  </label>
                </div>
              </div>

              <div className="dw-ft">
                {mode === 'edit' && (
                  <button type="button" className="btn b-dan" onClick={remove} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="btn b-gh" onClick={close}>Cancel</button>
                <button type="submit" className="btn b-red" disabled={pending}>
                  {pending ? 'Saving…' : mode === 'create' ? 'Add credit' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
