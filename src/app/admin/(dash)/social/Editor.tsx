'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getMediaUploadUrl, registerMedia } from '../media/actions';
import type { SocialResult } from './actions';

export type SocialRow = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
  iconUrl: string | null;
  /** True when a built-in mark exists for this label. */
  hasBuiltIn: boolean;
  first: boolean;
  last: boolean;
};

export function SocialEditor({
  rows, save, setIcon, add, remove, move, storageReady,
}: {
  rows: SocialRow[];
  save: (id: string, fd: FormData) => Promise<SocialResult>;
  setIcon: (id: string, mediaId: string | null) => Promise<SocialResult>;
  add: () => Promise<SocialResult>;
  remove: (id: string) => Promise<SocialResult>;
  move: (id: string, dir: 'up' | 'down') => Promise<SocialResult>;
  storageReady: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<SocialResult>) => start(async () => {
    const res = await fn();
    setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  });

  return (
    <>
      <div className="sec-hd">
        <h2>{rows.length} profile {rows.length === 1 ? 'link' : 'links'}</h2>
        <span className="sp" />
        <button type="button" className="btn b-red b-sm" disabled={busy} onClick={() => run(add)}>
          Add a profile
        </button>
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      {!storageReady ? (
        <div className="note">
          <span>⚑</span>
          <span>
            <b>Cloudflare R2 is not configured, so icon uploads will fail.</b> Everything else on
            this screen works — the built-in icons are drawn in code and need no storage.
          </span>
        </div>
      ) : null}

      <div className="soc-rows">
        {rows.map((r) => (
          <SocialRowEditor
            key={r.id} row={r} save={save} setIcon={setIcon} remove={remove} move={move}
            busy={busy} run={run}
          />
        ))}
      </div>
    </>
  );
}

function SocialRowEditor({
  row, save, setIcon, remove, move, busy, run,
}: {
  row: SocialRow;
  save: (id: string, fd: FormData) => Promise<SocialResult>;
  setIcon: (id: string, mediaId: string | null) => Promise<SocialResult>;
  remove: (id: string) => Promise<SocialResult>;
  move: (id: string, dir: 'up' | 'down') => Promise<SocialResult>;
  busy: boolean;
  run: (fn: () => Promise<SocialResult>) => void;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function upload(f: File) {
    setUploadError(null);

    // Checked here for a useful message, and again on the server, which is
    // what actually decides. An SVG is refused on purpose: it can carry script
    // and this bucket is public, so one would be a stored XSS served from our
    // own domain.
    if (!/^image\/(png|webp|jpeg|avif)$/.test(f.type)) {
      setUploadError('PNG, WebP, JPG or AVIF. SVG is not accepted — it can carry scripts.');
      return;
    }
    if (f.size > 512 * 1024) {
      setUploadError('That file is over 512KB. An icon this size should be a few kilobytes.');
      return;
    }

    setUploading('Preparing…');
    const signed = await getMediaUploadUrl({
      filename: f.name, contentType: f.type, bytes: f.size,
    });
    if (!signed.ok) { setUploading(null); setUploadError(signed.error); return; }

    setUploading('Uploading…');
    const put = await fetch(signed.url, {
      method: 'PUT', body: f, headers: { 'content-type': f.type },
    }).catch(() => null);

    if (!put || !put.ok) {
      setUploading(null);
      setUploadError(`Upload failed${put ? ` (HTTP ${put.status})` : ''}. Check the R2 settings.`);
      return;
    }

    const reg = await registerMedia({
      kind: 'IMAGE', filename: f.name, objectKey: signed.key, mime: f.type, bytes: f.size,
      alt: `${row.label} icon`,
    });
    if (!reg.ok) { setUploading(null); setUploadError('Saved to storage but not recorded. Try again.'); return; }

    const linked = await setIcon(row.id, reg.id);
    setUploading(null);
    if (!linked.ok) { setUploadError(linked.error); return; }
    router.refresh();
  }

  return (
    <div className="soc-row">
      <div className="soc-prev" title={row.iconUrl ? 'Uploaded icon' : 'Built-in icon'}>
        {row.iconUrl
          // eslint-disable-next-line @next/next/no-img-element -- a 40px preview
          ? <img src={row.iconUrl} alt="" width={22} height={22} />
          : <span className="soc-prev-x">{row.hasBuiltIn ? '◆' : row.label.slice(0, 2).toUpperCase()}</span>}
      </div>

      <form
        className="soc-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => save(row.id, fd));
        }}
      >
        <div className="two">
          <div className="fg">
            <label className="fl" htmlFor={`l-${row.id}`}>Name</label>
            <input className="in" id={`l-${row.id}`} name="label" defaultValue={row.label} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor={`h-${row.id}`}>Address</label>
            <input className="in" id={`h-${row.id}`} name="href" defaultValue={row.href}
              placeholder="https://instagram.com/snarebyt" />
          </div>
        </div>

        <div className="soc-acts">
          <label className="check">
            <input type="checkbox" name="visible" defaultChecked={row.visible} />
            <span>Show on the site</span>
          </label>
          <span className="sp" />
          <button type="button" className="ib" disabled={row.first || busy}
            aria-label={`Move ${row.label} up`} onClick={() => run(() => move(row.id, 'up'))}>↑</button>
          <button type="button" className="ib" disabled={row.last || busy}
            aria-label={`Move ${row.label} down`} onClick={() => run(() => move(row.id, 'down'))}>↓</button>
          <button className="btn b-red b-sm" type="submit" disabled={busy}>Save</button>
        </div>
      </form>

      <div className="soc-icon-acts">
        <input
          ref={file} type="file" accept="image/png,image/webp,image/jpeg,image/avif"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
        />
        <button type="button" className="btn b-gh b-sm" disabled={busy || Boolean(uploading)}
          onClick={() => file.current?.click()}>
          {uploading ?? (row.iconUrl ? 'Replace icon' : 'Upload icon')}
        </button>

        {row.iconUrl ? (
          <button type="button" className="btn b-gh b-sm" disabled={busy}
            onClick={() => run(() => setIcon(row.id, null))}>
            {row.hasBuiltIn ? 'Use built-in' : 'Remove icon'}
          </button>
        ) : null}

        {confirming ? (
          <>
            <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(false)}>Keep</button>
            <button type="button" className="btn b-red b-sm" disabled={busy}
              onClick={() => { setConfirming(false); run(() => remove(row.id)); }}>
              Delete link
            </button>
          </>
        ) : (
          <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>

      {uploadError ? <div className="err-box soc-err">{uploadError}</div> : null}
    </div>
  );
}
