'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUploadUrl, confirmUpload, removeBeatFile } from '@/app/admin/(dash)/beats/actions';
import { ASSET_LABEL, missingFor, missingText, fileSize } from '@/lib/beat-files';
import type { AssetKind } from '@prisma/client';

/**
 * Everything a beat delivers, on one screen.
 *
 * The organising idea is that "what files exist" and "what this beat can sell"
 * are the same question, so they are answered next to each other. Uploading a
 * WAV visibly switches the WAV Licence from greyed-out to sellable — which is
 * the connection between an upload and a customer's download, made literal.
 *
 * Files go browser → R2 on a presigned URL. Nothing passes through the server,
 * so a 2GB stems archive is limited by the connection and not by a function
 * timeout. Progress comes from XHR because fetch() cannot report upload
 * progress, and a four-minute silent upload looks identical to a broken one.
 */

export type SlotKey = 'cover' | 'preview' | AssetKind;

export type FileState = { key: string | null; bytes: number; url: string | null };

export type BeatFilesData = {
  id: string;
  title: string;
  basePriceBdt: number;
  status: string;
  cover: FileState;
  preview: FileState;
  assets: Partial<Record<AssetKind, { bytes: number }>>;
};

export type TierInfo = {
  id: string;
  name: string;
  multiplier: number;
  filesLabel: string;
  includedAssets: AssetKind[];
  isExclusive: boolean;
};

/** Mirrors licencePrice() in money.ts, which cannot be imported here — it pulls Prisma. */
const price = (base: number, mult: number) => Math.round((base * mult) / 50) * 50;
const taka = (n: number) => '৳' + n.toLocaleString('en-US');

/**
 * A presigned PUT is signed for one exact Content-Type, so the browser must
 * send back the same string it asked for. Some systems hand over a File with
 * an empty `type` — .wav and .aiff especially — and guessing at PUT time
 * instead of at signing time produces a 403 that looks like a broken bucket.
 */
const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aiff: 'audio/aiff', aif: 'audio/aiff',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif',
  pdf: 'application/pdf', txt: 'text/plain', rtf: 'application/rtf', md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const mimeOf = (f: File) => f.type || MIME_BY_EXT[extOf(f.name)] || 'application/octet-stream';

function putToR2(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<{ ok: boolean; status: number }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
}

const ACCEPT: Record<SlotKey, string> = {
  cover: 'image/*,.jpg,.jpeg,.png,.webp,.avif',
  preview: 'audio/*,.mp3,.m4a',
  MP3_UNTAGGED: 'audio/mpeg,.mp3',
  WAV: '.wav,.aiff,.aif,audio/*',
  STEMS_ZIP: '.zip,.rar,.7z',
  SESSION_NOTES: '.pdf,.txt,.rtf,.md,.docx',
};

const SLOT_ICON: Record<SlotKey, string> = {
  cover: '🖼', preview: '🔊', MP3_UNTAGGED: '🎵', WAV: '🎚', STEMS_ZIP: '🗂', SESSION_NOTES: '📝',
};

const SLOT_HINT: Record<AssetKind, string> = {
  MP3_UNTAGGED: 'The clean master. Every paid tier includes this.',
  WAV: '24-bit master. Unlocks the WAV licence and everything above it.',
  STEMS_ZIP: 'All tracks exported separately, zipped.',
  SESSION_NOTES: 'Tempo map, key, chain notes — whatever helps the buyer finish it.',
};

const PRIVATE_SLOTS: AssetKind[] = ['MP3_UNTAGGED', 'WAV', 'STEMS_ZIP', 'SESSION_NOTES'];

export function BeatFiles({ beat, tiers }: { beat: BeatFilesData; tiers: TierInfo[] }) {
  const router = useRouter();

  // Local mirrors so a finished upload lands instantly. router.refresh() then
  // reconciles with the server; without the mirror the row sits unchanged for
  // as long as the refresh takes, which reads as a failed upload.
  const [cover, setCover] = useState(beat.cover);
  const [preview, setPreview] = useState(beat.preview);
  const [assets, setAssets] = useState(beat.assets);

  const [pct, setPct] = useState<Partial<Record<SlotKey, number>>>({});
  const [err, setErr] = useState<Partial<Record<SlotKey, string>>>({});
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState<SlotKey | null>(null);

  const have = PRIVATE_SLOTS.filter((k) => assets[k]);

  async function upload(slot: SlotKey, file: File) {
    setErr((e) => ({ ...e, [slot]: undefined }));
    setNote(null);
    setPct((p) => ({ ...p, [slot]: 0 }));

    const contentType = mimeOf(file);

    const ticket = await getUploadUrl({
      beatId: beat.id, slot, filename: file.name, contentType, bytes: file.size,
    });
    if (!ticket.ok) {
      setPct((p) => ({ ...p, [slot]: undefined }));
      setErr((e) => ({ ...e, [slot]: ticket.error }));
      return;
    }

    const put = await putToR2(ticket.url, file, contentType, (n) =>
      setPct((p) => ({ ...p, [slot]: n })));

    if (!put.ok) {
      setPct((p) => ({ ...p, [slot]: undefined }));
      // status 0 means the request never completed — no HTTP response at all.
      // In practice that is one thing: the bucket has no CORS rule allowing
      // this site, so the browser refused before sending a byte. Worth naming
      // exactly, because "upload failed" sends you looking at the file.
      setErr((e) => ({
        ...e,
        [slot]: put.status === 0
          ? 'Storage refused the connection. The R2 bucket needs a CORS rule allowing PUT from this site — Cloudflare → R2 → snarebyt-'
            + (slot === 'cover' || slot === 'preview' ? 'public' : 'private')
            + ' → Settings → CORS policy. Nothing is wrong with the file.'
          : put.status === 403
            ? 'Storage rejected the upload as unauthorised (403). The signed link may have expired — try again.'
            : `Storage refused the file (HTTP ${put.status}).`,
      }));
      return;
    }

    const done = await confirmUpload({ beatId: beat.id, slot, key: ticket.key, bytes: file.size });
    setPct((p) => ({ ...p, [slot]: undefined }));
    if (!done.ok) { setErr((e) => ({ ...e, [slot]: done.error })); return; }

    // Object URL for the instant preview: the real CDN URL can take a moment
    // to become fetchable, and a broken image in the meantime looks like a
    // failure rather than a cache warming up.
    const localUrl = URL.createObjectURL(file);
    if (slot === 'cover') setCover({ key: ticket.key, bytes: file.size, url: localUrl });
    else if (slot === 'preview') setPreview({ key: ticket.key, bytes: file.size, url: localUrl });
    else setAssets((a) => ({ ...a, [slot]: { bytes: file.size } }));

    router.refresh();
  }

  async function remove(slot: SlotKey, label: string) {
    if (!confirm(`Remove the ${label} from ${beat.title}?\n\nThe file stays in storage so anyone who has already paid keeps their download.`)) return;
    setErr((e) => ({ ...e, [slot]: undefined }));
    const res = await removeBeatFile(beat.id, slot);
    if (!res.ok) { setErr((e) => ({ ...e, [slot]: res.error })); return; }
    if (slot === 'cover') setCover({ key: null, bytes: 0, url: null });
    else if (slot === 'preview') setPreview({ key: null, bytes: 0, url: null });
    else setAssets((a) => { const n = { ...a }; delete n[slot]; return n; });
    setNote(res.message);
    router.refresh();
  }

  function pick(slot: SlotKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT[slot];
    input.onchange = () => { const f = input.files?.[0]; if (f) void upload(slot, f); };
    input.click();
  }

  function dropProps(slot: SlotKey) {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(slot); },
      onDragLeave: () => setOver((s) => (s === slot ? null : s)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(null);
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(slot, f);
      },
    };
  }

  const busy = (slot: SlotKey) => pct[slot] !== undefined;

  return (
    <div className="fm">
      {note && <div className="note plain"><span>✓</span><span>{note}</span></div>}

      {/* ---------- Public: what everyone can see and hear ---------- */}
      <div>
        <div className="fm-hd">
          <h4>Artwork &amp; preview</h4>
          <span className="tag pub">Public</span>
          <span className="sp" />
          <span className="sub">Anyone can reach these. Never put the clean master here.</span>
        </div>

        <div className="fm-top">
          <div
            className={`artdrop${over === 'cover' ? ' drop' : ''}`}
            onClick={() => !busy('cover') && pick('cover')}
            {...dropProps('cover')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick('cover'); } }}
            aria-label="Cover art"
          >
            {cover.url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.url} alt={`${beat.title} cover art`} />
                <div className="over">{busy('cover') ? `${pct.cover}%` : 'Replace'}</div>
              </>
            ) : (
              <div className="ph">
                <span style={{ fontSize: '1.4rem' }}>🖼</span>
                <b>{busy('cover') ? `Uploading ${pct.cover}%` : 'Cover art'}</b>
                <span>Drop an image or click.<br />1400×1400 square, JPG or PNG.</span>
              </div>
            )}
            {busy('cover') && <i className="slot-bar" style={{ width: `${pct.cover}%` }} />}
          </div>

          <div className="slots">
            <Slot
              slot="preview"
              name="Tagged preview"
              required
              hint="The only audio the public ever hears. Upload the version with your producer tag over it."
              state={preview}
              pct={pct.preview}
              error={err.preview}
              over={over === 'preview'}
              onPick={() => pick('preview')}
              onRemove={() => remove('preview', 'tagged preview')}
              drop={dropProps('preview')}
            />
            {preview.url && (
              <div className="slot-au">
                <audio controls src={preview.url} preload="none">
                  <track kind="captions" />
                </audio>
              </div>
            )}
            {err.cover && <div className="pf-err">{err.cover}</div>}
            {cover.key && (
              <button type="button" className="btn b-gh b-sm" onClick={() => remove('cover', 'cover art')}>
                Remove cover art
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Private: what a buyer actually receives ---------- */}
      <div>
        <div className="fm-hd">
          <h4>Deliverables</h4>
          <span className="tag prv">Private</span>
          <span className="sp" />
          <span className="sub">No public URL exists for these. Ever.</span>
        </div>

        <div className="slots">
          {PRIVATE_SLOTS.map((k) => (
            <Slot
              key={k}
              slot={k}
              name={ASSET_LABEL[k]}
              required={k === 'MP3_UNTAGGED'}
              hint={SLOT_HINT[k]}
              state={{ key: assets[k] ? 'set' : null, bytes: assets[k]?.bytes ?? 0, url: null }}
              pct={pct[k]}
              error={err[k]}
              over={over === k}
              onPick={() => pick(k)}
              onRemove={() => remove(k, ASSET_LABEL[k])}
              drop={dropProps(k)}
            />
          ))}
        </div>
      </div>

      {/* ---------- The point of all of it ---------- */}
      <div>
        <div className="fm-hd">
          <h4>What this beat can sell</h4>
          <span className="sp" />
          <span className="sub">A tier with a missing file is not offered in the store.</span>
        </div>

        <div className="tiers">
          {tiers.map((t) => {
            const missing = missingFor(t.includedAssets, have);
            const ok = missing.length === 0;
            return (
              <div key={t.id} className={`tierrow${ok ? '' : ' no'}`}>
                <div>
                  <div className="tr-nm">
                    {t.name}{' '}
                    <span className={`chip ${ok ? 'ok' : 'warn'}`}>
                      {ok ? 'Sellable' : `Needs ${missingText(missing)}`}
                    </span>
                  </div>
                  <div className="tr-sub">{t.filesLabel}</div>
                </div>
                <div className="tr-pr">{taka(price(beat.basePriceBdt, t.multiplier))}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="note">
        <span>🔒</span>
        <span>
          Files upload straight from this browser to storage — they never pass through the website, so
          a large stems archive is limited only by your connection. After a verified payment the buyer
          gets a link that <b>expires, counts its uses and only ever serves the files their tier includes</b>.
        </span>
      </div>
    </div>
  );
}

function Slot({
  slot, name, required, hint, state, pct, error, over, onPick, onRemove, drop,
}: {
  slot: SlotKey;
  name: string;
  required?: boolean;
  hint: string;
  state: FileState;
  pct?: number;
  error?: string;
  over: boolean;
  onPick: () => void;
  onRemove: () => void;
  drop: Record<string, unknown>;
}) {
  const has = Boolean(state.key);
  const busy = pct !== undefined;
  const cls = ['slot', over ? 'drop' : '', busy ? 'busy' : has ? 'has' : required ? 'need' : '']
    .filter(Boolean).join(' ');

  return (
    <>
      <div className={cls} {...drop}>
        <div className="slot-ic" aria-hidden="true">{SLOT_ICON[slot]}</div>
        <div className="slot-b">
          <div className="slot-nm">
            {name}
            {required && <span className="req" title="Required before this beat can be published">required</span>}
          </div>
          <div className="slot-meta">
            {busy
              ? `Uploading… ${pct}%`
              : has
                ? `${fileSize(state.bytes)} · uploaded`
                : hint}
          </div>
        </div>
        <div className="slot-acts">
          <button type="button" className="btn b-gh b-sm" disabled={busy} onClick={onPick}>
            {has ? 'Replace' : 'Upload'}
          </button>
          {has && !busy && (
            <button type="button" className="btn b-dan b-sm" onClick={onRemove}>Remove</button>
          )}
        </div>
        {busy && <i className="slot-bar" style={{ width: `${pct}%` }} />}
      </div>
      {error && <div className="pf-err">{error}</div>}
    </>
  );
}
