'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMediaUploadUrl, registerMedia, updateAlt, deleteMedia,
} from '@/app/admin/(dash)/media/actions';
import { Sheet, useToast, useConfirm } from '@/components/app/Ui';
import { IcUpload } from '@/components/app/Icons';
import { mimeOf, putToR2, uploadError } from '@/lib/upload-client';

type Asset = {
  id: string; filename: string; kind: string; alt: string;
  size: string; added: string; url: string;
};

export function MediaGrid({ assets, missingAlt }: { assets: Asset[]; missingAlt: number }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [pct, setPct] = useState<number | null>(null);
  const [open, setOpen] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setPct(0);
    try {
      const contentType = mimeOf(file);
      const ticket = await getMediaUploadUrl({
        filename: file.name, contentType, bytes: file.size,
      });
      if (!ticket.ok) { toast(ticket.error, 'bad'); return; }

      const put = await putToR2(ticket.url, file, contentType, setPct);
      // Media goes to the public bucket, so the CORS hint names that one.
      if (!put.ok) { toast(uploadError(put.status, true), 'bad'); return; }

      /* Image dimensions are read here rather than on the server: the file is
         already in the browser's memory, and a second fetch on the server just
         to measure it would be a round trip for something free. */
      const dims = await imageSize(file).catch(() => null);

      const done = await registerMedia({
        kind: ticket.kind,
        filename: file.name,
        objectKey: ticket.key,
        mime: contentType,
        bytes: file.size,
        ...(dims ?? {}),
      });
      if (!done.ok) { toast('Could not save that file.', 'bad'); return; }

      toast('Uploaded. Add alt text so it reads properly.');
      router.refresh();
    } finally {
      setPct(null);
    }
  }

  function pick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void upload(f); };
    input.click();
  }

  return (
    <>
      <div className="big-title">
        <h2>Media</h2>
        <p>{assets.length} file{assets.length === 1 ? '' : 's'}</p>
      </div>

      <div className="wrap stack-lg">
        <button type="button" className="btn btn-full" onClick={pick} disabled={pct !== null}>
          <IcUpload className="ic-sm" />
          {pct !== null ? `Uploading ${pct}%…` : 'Upload from this phone'}
        </button>

        {pct !== null && (
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        )}

        {missingAlt > 0 && (
          <div className="note warn">
            <b>{missingAlt} image{missingAlt > 1 ? 's have' : ' has'} no alt text.</b>
            <br />
            Alt text is not decoration — screen readers and image search both use it.
          </div>
        )}

        <div className="media-grid">
          {assets.map((a) => (
            <button key={a.id} type="button" className="media-cell" onClick={() => setOpen(a)}>
              {a.kind === 'IMAGE' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.alt || a.filename} loading="lazy" />
              ) : (
                <span className="media-audio">{a.kind.toLowerCase()}</span>
              )}
              {a.kind === 'IMAGE' && !a.alt.trim() && <span className="media-flag">alt</span>}
            </button>
          ))}
        </div>

        {assets.length === 0 && (
          <div className="list"><div className="empty">Nothing uploaded yet.</div></div>
        )}
      </div>

      {/* ---------- Detail sheet ---------- */}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.filename ?? ''}>
        {open && (
          <>
            {open.kind === 'IMAGE' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={open.url}
                alt={open.alt || open.filename}
                style={{ width: '100%', borderRadius: 12, marginBottom: '1rem',
                         border: '1px solid var(--line)' }}
              />
            )}
            {open.kind === 'AUDIO' && (
              <audio controls src={open.url} style={{ width: '100%', marginBottom: '1rem' }} />
            )}

            <form
              action={async (formData: FormData) => {
                setBusy(true);
                try {
                  await updateAlt(open.id, String(formData.get('alt') ?? ''));
                  setOpen(null);
                  toast('Saved.');
                  router.refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="field">
                <label className="fl" htmlFor="m-alt">Alt text</label>
                <input id="m-alt" name="alt" className="in" defaultValue={open.alt} maxLength={300} />
                <p className="hint">
                  Describe what is in the picture, for someone who cannot see it.
                </p>
              </div>
              <p className="hint" style={{ marginBottom: '1rem' }}>
                {open.size} · added {open.added}
              </p>
              <button type="submit" className="btn btn-full" disabled={busy}>
                {busy ? 'Saving…' : 'Save alt text'}
              </button>
            </form>

            <button
              type="button"
              className="btn danger btn-full"
              style={{ marginTop: '.7rem' }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  /* The first call is a dry run: it counts what still points at
                     this file and refuses if anything does. Only after that is
                     spelled out does the forced delete get offered. */
                  const first = await deleteMedia(open.id);
                  if (!first.ok) {
                    const ok = await confirm(
                      'This file is still in use',
                      `${first.error} Deleting it leaves those spots showing a placeholder.`,
                      'Delete anyway',
                    );
                    if (!ok) return;
                    const forced = await deleteMedia(open.id, true);
                    if (!forced.ok) { toast(forced.error, 'bad'); return; }
                  }
                  setOpen(null);
                  toast('Deleted.');
                  router.refresh();
                } catch {
                  toast('That was refused. Deleting media needs the owner account.', 'bad');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete file
            </button>
          </>
        )}
      </Sheet>

      {confirmNode}
    </>
  );
}

/** Measure an image in the browser, so the server never has to fetch it back. */
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image'));
    };
    img.src = url;
  });
}
