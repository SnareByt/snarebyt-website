'use client';

import { useState, useTransition } from 'react';
import { getMediaUploadUrl, registerMedia, updateAlt } from './actions';

export type Asset = {
  id: string;
  kind: string;
  filename: string;
  url: string;
  alt: string;
  bytes: number;
  createdAt: string;
};

/**
 * Files go from the browser straight to R2 with a presigned URL — they never
 * pass through the server, which is what lets a 2GB stems archive work at all.
 * The row is only created after the upload succeeds, so a failed transfer
 * cannot leave a database entry pointing at nothing.
 */
export function MediaLibrary({ assets, storageReady }: { assets: Asset[]; storageReady: boolean }) {
  const [items, setItems] = useState(assets);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const missingAlt = items.filter((a) => a.kind === 'IMAGE' && !a.alt.trim()).length;

  async function upload(file: File) {
    setError(null);
    setBusy(`Preparing ${file.name}…`);

    const signed = await getMediaUploadUrl({
      filename: file.name, contentType: file.type, bytes: file.size,
    });
    if (!signed.ok) { setBusy(null); setError(signed.error); return; }

    setBusy(`Uploading ${file.name}…`);
    const put = await fetch(signed.url, {
      method: 'PUT', body: file, headers: { 'content-type': file.type },
    }).catch(() => null);

    if (!put || !put.ok) {
      setBusy(null);
      setError(`Upload failed${put ? ` (HTTP ${put.status})` : ''}. Check the R2 credentials and that the bucket accepts uploads.`);
      return;
    }

    const reg = await registerMedia({
      kind: signed.kind, filename: file.name, objectKey: signed.key,
      mime: file.type, bytes: file.size,
    });
    setBusy(null);
    if (reg.ok) window.location.reload();
  }

  return (
    <>
      {!storageReady ? (
        <div className="note" style={{ marginBottom: '1.2rem' }}>
          <span>⚑</span>
          <span>
            <b>Cloudflare R2 is not configured, so uploads will fail.</b> Set
            <code> R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code> and
            <code> R2_SECRET_ACCESS_KEY</code> in the server environment. Everything else on this
            screen works; there is simply nowhere to put a file yet.
          </span>
        </div>
      ) : null}

      <div className="dropzone">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,audio/mpeg,audio/wav,audio/mp4"
          disabled={!!busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        <div className="sub">
          JPG, PNG, WebP, AVIF up to 15MB · MP3, WAV, M4A up to 60MB.
          These go to the <b>public</b> bucket — cover art and tagged previews only. Never an
          untagged master.
        </div>
        {busy ? <div className="chip">{busy}</div> : null}
        {error ? <div className="err-box">{error}</div> : null}
      </div>

      <div className="sec-hd" style={{ marginTop: '1.6rem' }}>
        <h2>{items.length} files</h2>
        {missingAlt
          ? <span className="chip warn">{missingAlt} without alt text</span>
          : <span className="chip ok">All images described</span>}
      </div>

      {items.length ? (
        <div className="mediagrid">
          {items.map((a) => (
            <div className="mediacard" key={a.id}>
              {a.kind === 'IMAGE' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.alt} />
              ) : (
                <div className="prev">♪</div>
              )}
              <div className="ttl">{a.filename}</div>
              <div className="sub">{(a.bytes / 1024).toFixed(0)} KB · {a.kind.toLowerCase()}</div>

              {a.kind === 'IMAGE' ? (
                <>
                  <input
                    className="in"
                    placeholder="Describe this image"
                    defaultValue={a.alt}
                    onBlur={(e) => {
                      if (e.target.value === a.alt) return;
                      const next = e.target.value;
                      startTransition(async () => {
                        await updateAlt(a.id, next);
                        setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, alt: next } : x)));
                      });
                    }}
                  />
                  {!a.alt.trim() ? <span className="chip warn">Needs alt text</span> : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="note">
          <span>🖼</span>
          <span><b>No files yet.</b> Cover art and tagged previews land here once uploaded.</span>
        </div>
      )}
    </>
  );
}
