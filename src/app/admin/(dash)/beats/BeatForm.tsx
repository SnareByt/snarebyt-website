'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveBeat, deleteBeat } from './actions';
import { BeatFiles, type BeatFilesData, type TierInfo } from '@/components/admin/BeatFiles';

/**
 * Add, edit and equip a beat — one drawer, two tabs.
 *
 * Details and files are deliberately not separate screens. Whether a beat can
 * be published depends on both, so splitting them means saving in one place and
 * discovering the refusal in another. Here the Files tab carries a count and the
 * publish refusal names the tab you need.
 *
 * A new beat has no id, so nothing can be uploaded against it yet — the Files
 * tab stays locked and says why, rather than presenting a dropzone that would
 * fail.
 */

const STATUSES = [
  { v: 'DRAFT', l: 'Draft — not on the site' },
  { v: 'PUBLISHED', l: 'Published — on sale' },
  { v: 'ARCHIVED', l: 'Archived — hidden, history kept' },
];

export type BeatFormData = BeatFilesData & {
  genre: string;
  mood: string;
  bpm: number;
  musicalKey: string;
  tags: string[];
  description: string;
  exclusiveAvailable: boolean;
  fileCount: number;
};

export default function BeatForm({
  mode, beat, tiers,
}: {
  mode: 'create' | 'edit';
  beat?: BeatFormData;
  tiers: TierInfo[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'details' | 'files'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();

  function close() {
    setOpen(false);
    setErrors({});
    setTab('details');
  }

  function submit(formData: FormData) {
    start(async () => {
      const res = await saveBeat(formData);
      if (res.ok) { setErrors({}); close(); router.refresh(); }
      else setErrors(res.errors);
    });
  }

  function remove() {
    if (!beat) return;
    const sure = confirm(
      `Delete “${beat.title}”?\n\nIf it has any paid sales it will be archived instead — issued licences have to stay provable.`,
    );
    if (!sure) return;
    startDelete(async () => {
      const res = await deleteBeat(beat.id);
      if (res.ok) { close(); router.refresh(); }
      else setErrors(res.errors);
    });
  }

  const sold = beat?.status === 'SOLD_EXCLUSIVE';

  return (
    <>
      <button
        type="button"
        className={mode === 'create' ? 'btn b-red' : 'rowgo'}
        onClick={() => setOpen(true)}
      >
        {mode === 'create' ? '+ Add beat' : 'Edit & files'}
      </button>

      {open && (
        <>
          <div className="scrim on" onClick={close} />
          <div className="drawer wide on" role="dialog" aria-modal="true" aria-label={beat?.title ?? 'Add a beat'}>
            <div className="dw-hd">
              <div>
                <div className="eyebrow">{mode === 'create' ? 'New beat' : 'Edit beat'}</div>
                <h3>{beat?.title ?? 'Add a beat'}</h3>
              </div>
              <button type="button" className="x" onClick={close} aria-label="Close">✕</button>
            </div>

            <div className="dw-tabs">
              <button
                type="button"
                className={`dw-tab${tab === 'details' ? ' on' : ''}`}
                onClick={() => setTab('details')}
              >
                Details
              </button>
              <button
                type="button"
                className={`dw-tab${tab === 'files' ? ' on' : ''}`}
                onClick={() => beat && setTab('files')}
                disabled={!beat}
                title={beat ? undefined : 'Save the beat first — files attach to a saved record'}
              >
                Files &amp; delivery
                {beat && <span className="n">{beat.fileCount}</span>}
              </button>
            </div>

            {tab === 'files' && beat ? (
              <>
                <div className="dw-bd">
                  <BeatFiles beat={beat} tiers={tiers} />
                </div>
                <div className="dw-ft">
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn b-gh" onClick={close}>Done</button>
                </div>
              </>
            ) : (
              <form action={submit}>
                <div className="dw-bd">
                  {beat?.id && <input type="hidden" name="id" value={beat.id} />}

                  {errors._ && <div className="note"><span>⚠</span><span>{errors._}</span></div>}

                  {mode === 'create' && (
                    <div className="note plain">
                      <span>①</span>
                      <span>
                        Save this as a draft first. Once it exists you can upload the artwork, the
                        tagged preview and the files a buyer receives — then publish it.
                      </span>
                    </div>
                  )}

                  <div className={`fg ${errors.title ? 'bad' : ''}`}>
                    <label className="fl" htmlFor="bf-title">Title <span className="req">*</span></label>
                    <input className="in" id="bf-title" name="title" defaultValue={beat?.title ?? ''} required />
                    {errors.title && <div className="err">{errors.title}</div>}
                  </div>

                  <div className="f two">
                    <div className={`fg ${errors.genre ? 'bad' : ''}`}>
                      <label className="fl" htmlFor="bf-genre">Genre <span className="req">*</span></label>
                      <input className="in" id="bf-genre" name="genre" defaultValue={beat?.genre ?? ''}
                        placeholder="Drill, Desi Trap, Lo-Fi…" required />
                      {errors.genre && <div className="err">{errors.genre}</div>}
                    </div>
                    <div className="fg">
                      <label className="fl" htmlFor="bf-mood">Mood</label>
                      <input className="in" id="bf-mood" name="mood" defaultValue={beat?.mood ?? ''}
                        placeholder="Dark, Aggressive, Chill…" />
                    </div>
                  </div>

                  <div className="f two">
                    <div className={`fg ${errors.bpm ? 'bad' : ''}`}>
                      <label className="fl" htmlFor="bf-bpm">BPM <span className="req">*</span></label>
                      <input className="in" id="bf-bpm" name="bpm" type="number" min={40} max={220}
                        defaultValue={beat?.bpm ?? 140} required />
                      {errors.bpm && <div className="err">{errors.bpm}</div>}
                    </div>
                    <div className="fg">
                      <label className="fl" htmlFor="bf-key">Key</label>
                      <input className="in" id="bf-key" name="musicalKey" defaultValue={beat?.musicalKey ?? ''}
                        placeholder="F Min" />
                    </div>
                  </div>

                  <div className={`fg ${errors.basePriceBdt ? 'bad' : ''}`}>
                    <label className="fl" htmlFor="bf-price">Base price (BDT) <span className="req">*</span></label>
                    <input className="in" id="bf-price" name="basePriceBdt" inputMode="numeric"
                      defaultValue={beat?.basePriceBdt ?? 1500} required />
                    <div className="hint">
                      Every licence tier is a multiple of this one number. The MP3 licence sells at
                      the base price; the tiers above it multiply up from here.
                    </div>
                    {errors.basePriceBdt && <div className="err">{errors.basePriceBdt}</div>}
                  </div>

                  <div className="fg">
                    <label className="fl" htmlFor="bf-tags">Tags</label>
                    <input className="in" id="bf-tags" name="tags" defaultValue={beat?.tags.join(', ') ?? ''}
                      placeholder="dhaka, 808, bangla drill" />
                    <div className="hint">Comma separated. These are what the store search matches on.</div>
                  </div>

                  <div className="fg">
                    <label className="fl" htmlFor="bf-desc">Description</label>
                    <textarea className="in" id="bf-desc" name="description" rows={3}
                      defaultValue={beat?.description ?? ''} />
                  </div>

                  <div className={`fg ${errors.status ? 'bad' : ''}`}>
                    <label className="fl" htmlFor="bf-status">Status</label>
                    {sold ? (
                      <>
                        <input type="hidden" name="status" value="SOLD_EXCLUSIVE" />
                        <div className="note">
                          <span>🔒</span>
                          <span>
                            The exclusive rights to this beat are sold. Its status is locked — putting it
                            back on sale would resell something somebody already owns outright.
                          </span>
                        </div>
                      </>
                    ) : (
                      <select className="in" id="bf-status" name="status" defaultValue={beat?.status ?? 'DRAFT'}>
                        {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                      </select>
                    )}
                    {errors.status && <div className="err">{errors.status}</div>}
                  </div>

                  <label className="inline">
                    <input type="checkbox" name="exclusiveAvailable"
                      defaultChecked={beat?.exclusiveAvailable ?? true} disabled={sold} />
                    <span>
                      <b>Exclusive rights available</b>
                      <div className="hint">
                        Untick to keep the beat non-exclusive only. Selling an exclusive takes the beat
                        off the store permanently.
                      </div>
                    </span>
                  </label>
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
                    {pending ? 'Saving…' : mode === 'create' ? 'Create draft' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
