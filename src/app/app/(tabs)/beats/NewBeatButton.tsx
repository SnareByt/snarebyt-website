'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveBeat } from '@/app/admin/(dash)/beats/actions';
import { Sheet, useToast } from '@/components/app/Ui';
import { IcPlus } from '@/components/app/Icons';

/**
 * Add a beat.
 *
 * Calls the same `saveBeat` server action the desktop admin uses, which is the
 * point of the whole architecture: the slug collision handling, the "save as a
 * draft first" rule and the audit entry all come along for free, and cannot
 * drift from what the website does.
 *
 * A new beat is always created as a DRAFT — the action refuses PUBLISHED on a
 * beat that does not exist yet, because there is nowhere to have uploaded
 * files to. On success it navigates into the new beat, since the next thing
 * Samir wants is the Files tab.
 */
export function NewBeatButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const toast = useToast();

  async function submit(formData: FormData) {
    setBusy(true);
    setErrors({});
    try {
      formData.set('status', 'DRAFT');
      const res = await saveBeat(formData);
      if (!res.ok) {
        setErrors(res.errors);
        if (res.errors._) toast(res.errors._, 'bad');
        return;
      }
      setOpen(false);
      toast('Draft created. Add its files next.');
      router.refresh();
    } catch {
      toast('Could not save. Check your connection.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="nav-btn" onClick={() => setOpen(true)} aria-label="Add a beat">
        <IcPlus />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New beat">
        <form action={submit}>
          <div className="field">
            <label className="fl" htmlFor="nb-title">Title</label>
            <input id="nb-title" name="title" className="in" required autoFocus maxLength={120} />
            {errors.title && <p className="err">{errors.title}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div className="field">
              <label className="fl" htmlFor="nb-bpm">BPM</label>
              <input
                id="nb-bpm" name="bpm" className="in" type="number"
                inputMode="numeric" min={40} max={220} defaultValue={140} required
              />
              {errors.bpm && <p className="err">{errors.bpm}</p>}
            </div>
            <div className="field">
              <label className="fl" htmlFor="nb-key">Key</label>
              <input id="nb-key" name="musicalKey" className="in" placeholder="F# minor" maxLength={20} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div className="field">
              <label className="fl" htmlFor="nb-genre">Genre</label>
              <input id="nb-genre" name="genre" className="in" required maxLength={60} />
              {errors.genre && <p className="err">{errors.genre}</p>}
            </div>
            <div className="field">
              <label className="fl" htmlFor="nb-mood">Mood</label>
              <input id="nb-mood" name="mood" className="in" maxLength={60} />
            </div>
          </div>

          <div className="field">
            <label className="fl" htmlFor="nb-price">Base price (BDT)</label>
            <input
              id="nb-price" name="basePriceBdt" className="in" type="number"
              inputMode="numeric" min={100} defaultValue={1500} required
            />
            <p className="hint">
              Every licence tier is a multiplier on this one number, so changing
              it moves the whole ladder. Whole taka only.
            </p>
            {errors.basePriceBdt && <p className="err">{errors.basePriceBdt}</p>}
          </div>

          <p className="note" style={{ marginBottom: '1rem' }}>
            Saved as a draft. It cannot go on sale until a tagged preview and an
            untagged MP3 are uploaded.
          </p>

          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Create draft'}
          </button>
        </form>
      </Sheet>
    </>
  );
}
