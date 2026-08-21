'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveBeat, setBeatPrice, toggleBeatPublished, deleteBeat,
  getUploadUrl, confirmUpload, removeBeatFile,
} from '@/app/admin/(dash)/beats/actions';
import { Sheet, Switch, useToast, useConfirm } from '@/components/app/Ui';
import { IcUpload, IcCheck, IcWarn, IcClose } from '@/components/app/Icons';
import { ACCEPT, mimeOf, putToR2, uploadError, isPublicSlot, type SlotKey } from '@/lib/upload-client';
import { beatChip, humanStatus } from '@/lib/app-format';
import { fileSize } from '@/lib/beat-files';

type Beat = {
  id: string; title: string; slug: string; genre: string; mood: string;
  bpm: number; musicalKey: string; tags: string[]; description: string;
  basePriceBdt: number; status: string; exclusiveAvailable: boolean;
  playCount: number; purchaseCount: number;
  coverUrl: string | null; previewUrl: string | null;
};

type Slot = { slot: SlotKey; label: string; have: boolean; bytes: number; isPublic: boolean };

type Tier = {
  id: string; name: string; multiplier: number; filesLabel: string;
  isExclusive: boolean; price: number; missing: string[]; sellable: boolean;
};

const taka = (n: number) => '৳' + n.toLocaleString('en-US');

export function BeatEditor({
  beat, slots, tiers, blockers, usdRate,
}: {
  beat: Beat; slots: Slot[]; tiers: Tier[]; blockers: string[]; usdRate: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [pct, setPct] = useState<Partial<Record<string, number>>>({});
  const [busy, setBusy] = useState(false);

  const live = beat.status === 'PUBLISHED';
  const soldExclusive = beat.status === 'SOLD_EXCLUSIVE';

  /* ---------- Files ---------- */

  async function upload(slot: SlotKey, file: File) {
    setPct((p) => ({ ...p, [slot]: 0 }));
    try {
      const contentType = mimeOf(file);
      const ticket = await getUploadUrl({
        beatId: beat.id, slot, filename: file.name, contentType, bytes: file.size,
      });
      if (!ticket.ok) { toast(ticket.error, 'bad'); return; }

      const put = await putToR2(ticket.url, file, contentType, (n) =>
        setPct((p) => ({ ...p, [slot]: n })));
      if (!put.ok) { toast(uploadError(put.status, isPublicSlot(slot)), 'bad'); return; }

      const done = await confirmUpload({
        beatId: beat.id, slot, key: ticket.key, bytes: file.size,
      });
      if (!done.ok) { toast(done.error, 'bad'); return; }

      toast('Uploaded.');
      router.refresh();
    } finally {
      setPct((p) => { const n = { ...p }; delete n[slot]; return n; });
    }
  }

  function pick(slot: SlotKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT[slot];
    input.onchange = () => { const f = input.files?.[0]; if (f) void upload(slot, f); };
    input.click();
  }

  async function removeFile(slot: SlotKey, label: string) {
    const ok = await confirm(
      `Remove the ${label.toLowerCase()}?`,
      `The file stays in storage, so anyone who has already paid keeps their download. ${
        live ? 'If this beat then has nothing to deliver, it will be pulled back to draft.' : ''
      }`,
      'Remove',
    );
    if (!ok) return;

    const res = await removeBeatFile(beat.id, slot);
    if (!res.ok) { toast(res.error, 'bad'); return; }
    toast(res.message);
    router.refresh();
  }

  /* ---------- Save ---------- */

  async function saveDetails(formData: FormData) {
    setBusy(true);
    try {
      formData.set('id', beat.id);
      // Status is owned by the publish switch, not by this form. Posting it
      // here would let a details edit silently unpublish a live beat.
      formData.set('status', beat.status);
      const res = await saveBeat(formData);
      if (!res.ok) {
        toast(Object.values(res.errors)[0] ?? 'Could not save.', 'bad');
        return;
      }
      setEditing(false);
      toast('Saved.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function savePrice(formData: FormData) {
    setBusy(true);
    try {
      const res = await setBeatPrice(beat.id, formData);
      if (!res.ok) { toast(res.error, 'bad'); return; }
      setPricing(false);
      toast(res.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>{beat.title}</h2>
        <p>
          {beat.bpm} BPM · {beat.musicalKey || 'key not set'} · {beat.genre}
          {beat.mood ? ` · ${beat.mood}` : ''}
        </p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- Cover + headline numbers ---------- */}
        <div className="card">
          <div className="card-pad" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {beat.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={beat.coverUrl}
                alt={`${beat.title} cover art`}
                style={{ width: 78, height: 78, borderRadius: 12, objectFit: 'cover', flex: 'none',
                         border: '1px solid var(--line)' }}
              />
            ) : (
              <span className="thumb" style={{ width: 78, height: 78, borderRadius: 12 }}>
                cover art pending
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tile-k">Base price</div>
              <div className="tile-v" style={{ fontSize: '1.5rem' }}>{taka(beat.basePriceBdt)}</div>
              <div className="tile-s">
                ${(beat.basePriceBdt / usdRate).toFixed(2)} · {beat.purchaseCount} sold · {beat.playCount} plays
              </div>
            </div>
          </div>
        </div>

        {/* ---------- On sale ---------- */}
        <div>
          <div className="sec"><h3>Availability</h3></div>
          <div className="list">
            <div className="row">
              <div className="row-main">
                <div className="row-t">On sale</div>
                <div className="row-s">
                  {soldExclusive
                    ? 'Exclusive rights sold — this can never go back on sale.'
                    : blockers.length
                      ? `Needs ${blockers.join(' and ')}.`
                      : live ? 'Visible in the store now.' : 'Hidden from the store.'}
                </div>
              </div>
              <Switch
                label="On sale"
                on={live}
                disabled={soldExclusive}
                onChange={async () => {
                  const res = await toggleBeatPublished(beat.id);
                  router.refresh();
                  return res.ok
                    ? { ok: true, message: res.message }
                    : { ok: false, error: res.error };
                }}
              />
            </div>

            <div className="row">
              <div className="row-main">
                <div className="row-t">Status</div>
                <div className="row-s">Slug: {beat.slug}</div>
              </div>
              <span className={`chip ${beatChip(beat.status)}`}>{humanStatus(beat.status)}</span>
            </div>
          </div>

          {blockers.length > 0 && (
            <p className="note red" style={{ marginTop: '.6rem' }}>
              <b>Cannot go on sale.</b> Upload {blockers.join(' and ')} below. Publishing
              without them means a buyer pays and receives nothing.
            </p>
          )}
        </div>

        {/* ---------- Files ---------- */}
        <div>
          <div className="sec"><h3>Files</h3></div>
          <div className="list">
            {slots.map((s) => {
              const progress = pct[s.slot];
              const uploading = progress !== undefined;
              return (
                <div key={s.slot} className="row">
                  <span
                    className="thumb"
                    style={{ width: 38, height: 38, fontSize: '.9rem',
                             color: s.have ? 'var(--ok)' : 'var(--dim)' }}
                    aria-hidden="true"
                  >
                    {s.have ? <IcCheck className="ic-sm" /> : <IcUpload className="ic-sm" />}
                  </span>
                  <div className="row-main">
                    <div className="row-t">{s.label}</div>
                    <div className="row-s">
                      {uploading
                        ? `Uploading ${progress}%…`
                        : s.have
                          ? `${s.isPublic ? 'Public' : 'Private'}${s.bytes ? ` · ${fileSize(s.bytes)}` : ''}`
                          : s.isPublic ? 'Public bucket · not uploaded' : 'Private · not uploaded'}
                    </div>
                    {uploading && (
                      <div className="bar" style={{ marginTop: '.4rem' }}>
                        <i style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                  {!uploading && (
                    <div style={{ display: 'flex', gap: '.4rem', flex: 'none' }}>
                      <button type="button" className="btn gh btn-sm" onClick={() => pick(s.slot)}>
                        {s.have ? 'Replace' : 'Upload'}
                      </button>
                      {s.have && (
                        <button
                          type="button"
                          className="nav-btn"
                          aria-label={`Remove ${s.label}`}
                          onClick={() => removeFile(s.slot, s.label)}
                        >
                          <IcClose />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Cover art and the tagged preview are public. Everything else is private and only
            ever reachable through an expiring, attempt-limited download grant.
          </p>
        </div>

        {/* ---------- Licence tiers ---------- */}
        <div>
          <div className="sec"><h3>What this sells for</h3></div>
          <div className="list">
            {tiers.map((t) => (
              <div key={t.id} className="row">
                <div className="row-main">
                  <div className="row-t">{t.name}</div>
                  <div className="row-s">
                    {t.sellable ? t.filesLabel : `Needs ${t.missing.join(' and ')}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="row-v">{taka(t.price)}</div>
                  <div style={{ marginTop: '.2rem' }}>
                    <span className={`chip ${t.sellable ? 'ok' : ''}`}>
                      {t.sellable ? 'sellable' : 'not ready'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Every tier is a multiplier on the base price, rounded to ৳50. Change the
            multipliers from the desktop dashboard — they move the price of every beat at
            that tier at once.
          </p>
        </div>

        {/* ---------- Actions ---------- */}
        <div className="stack">
          <button type="button" className="btn gh btn-full" onClick={() => setPricing(true)}>
            Change base price
          </button>
          <button type="button" className="btn gh btn-full" onClick={() => setEditing(true)}>
            Edit details
          </button>
          <button
            type="button"
            className="btn danger btn-full"
            onClick={async () => {
              const ok = await confirm(
                `Delete ${beat.title}?`,
                'If this beat has any paid sales it will be archived instead of deleted — issued licences have to stay provable.',
                'Delete',
              );
              if (!ok) return;
              const res = await deleteBeat(beat.id);
              if (!res.ok) {
                // Not necessarily a failure: this is also how the action reports
                // "archived instead", which is the correct outcome and needs to
                // be read, so it goes up as a message rather than swallowed.
                toast(res.errors._ ?? 'Could not delete.', 'bad');
                router.refresh();
                return;
              }
              toast('Deleted.');
              router.push('/app/beats');
            }}
          >
            Delete beat
          </button>
        </div>
      </div>

      {/* ---------- Price sheet ---------- */}
      <Sheet open={pricing} onClose={() => setPricing(false)} title="Base price">
        <form action={savePrice}>
          <div className="field">
            <label className="fl" htmlFor="bp">Base price in taka</label>
            <input
              id="bp" name="basePriceBdt" className="in" type="number"
              inputMode="numeric" min={1} defaultValue={beat.basePriceBdt} required autoFocus
            />
            <p className="hint">
              Whole taka only. Every licence tier is derived from this, so one change moves
              the whole ladder. Orders already placed keep the price they froze at checkout.
            </p>
          </div>
          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save price'}
          </button>
        </form>
      </Sheet>

      {/* ---------- Details sheet ---------- */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit details">
        <form action={saveDetails}>
          <div className="field">
            <label className="fl" htmlFor="e-title">Title</label>
            <input id="e-title" name="title" className="in" defaultValue={beat.title} required maxLength={120} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div className="field">
              <label className="fl" htmlFor="e-bpm">BPM</label>
              <input id="e-bpm" name="bpm" className="in" type="number" inputMode="numeric"
                     min={40} max={220} defaultValue={beat.bpm} required />
            </div>
            <div className="field">
              <label className="fl" htmlFor="e-key">Key</label>
              <input id="e-key" name="musicalKey" className="in" defaultValue={beat.musicalKey} maxLength={20} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div className="field">
              <label className="fl" htmlFor="e-genre">Genre</label>
              <input id="e-genre" name="genre" className="in" defaultValue={beat.genre} required maxLength={60} />
            </div>
            <div className="field">
              <label className="fl" htmlFor="e-mood">Mood</label>
              <input id="e-mood" name="mood" className="in" defaultValue={beat.mood} maxLength={60} />
            </div>
          </div>

          <div className="field">
            <label className="fl" htmlFor="e-tags">Tags</label>
            <input id="e-tags" name="tags" className="in" defaultValue={beat.tags.join(', ')}
                   placeholder="drill, dark, 808" />
            <p className="hint">Comma separated.</p>
          </div>

          <div className="field">
            <label className="fl" htmlFor="e-desc">Description</label>
            <textarea id="e-desc" name="description" className="in" defaultValue={beat.description}
                      maxLength={2000} />
          </div>

          <div className="field">
            <label className="row" style={{ padding: '.6rem 0', minHeight: 0 }}>
              <div className="row-main">
                <div className="row-t">Exclusive rights available</div>
                <div className="row-s">Offer the exclusive tier on this beat</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="exclusiveAvailable" value="true"
                       defaultChecked={beat.exclusiveAvailable} aria-label="Exclusive rights available" />
                <i />
              </span>
            </label>
          </div>

          {/* The price lives in its own sheet, but saveBeat validates the whole
              object, so the current value has to travel with the form. */}
          <input type="hidden" name="basePriceBdt" value={beat.basePriceBdt} />

          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}
