'use client';

import { useState } from 'react';
import { getMediaUploadUrl, registerMedia } from '@/app/admin/(dash)/media/actions';

export type PickerAsset = { id: string; kind: string; filename: string; url: string; alt: string };

/**
 * Choose or upload the file behind an image/audio field.
 *
 * A media field stores a MediaAsset **id**, never a URL, so replacing the file
 * updates every page that uses it rather than leaving five stale copies of the
 * same link. That is why this saves `asset.id` and not `asset.url`.
 *
 * Uploading goes browser → R2 directly on a presigned URL; the database row is
 * only created once the transfer succeeds, so a failed upload cannot leave a
 * field pointing at nothing.
 */
export function MediaPicker({
  kind, value, assets, onChange,
}: {
  kind: 'image' | 'audio';
  value: string;
  assets: PickerAsset[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState(assets);

  const wanted = kind === 'image' ? 'IMAGE' : 'AUDIO';
  const options = list.filter((a) => a.kind === wanted);
  const current = list.find((a) => a.id === value);

  async function upload(file: File) {
    setError(null);
    setBusy(`Uploading ${file.name}…`);

    const signed = await getMediaUploadUrl({
      filename: file.name, contentType: file.type, bytes: file.size,
    });
    if (!signed.ok) { setBusy(null); setError(signed.error); return; }

    const put = await fetch(signed.url, {
      method: 'PUT', body: file, headers: { 'content-type': file.type },
    }).catch(() => null);

    if (!put || !put.ok) {
      setBusy(null);
      setError(`Upload failed${put ? ` (HTTP ${put.status})` : ''}. Check the R2 settings.`);
      return;
    }

    const reg = await registerMedia({
      kind: signed.kind, filename: file.name, objectKey: signed.key,
      mime: file.type, bytes: file.size,
    });
    setBusy(null);
    if (!reg.ok) { setError('Uploaded, but could not be saved to the library.'); return; }

    const added: PickerAsset = {
      id: reg.id, kind: wanted, filename: file.name,
      url: signed.publicUrl ?? '', alt: '',
    };
    setList((prev) => [added, ...prev]);
    onChange(reg.id);   // select it straight away — that is why you uploaded it
    setOpen(false);
  }

  return (
    <div className="mediapick-wrap">
      <div className="mediapick">
        <div className="prev">
          {current && kind === 'image' && current.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={current.url} alt={current.alt || current.filename} />
            : <span>{kind === 'image' ? '🖼' : '♪'}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ttl">{current ? current.filename : 'Nothing chosen'}</div>
          <div className="sub">
            {current
              ? (kind === 'image' && !current.alt ? 'No alt text yet — add it in Media' : 'In use')
              : 'Upload a file or pick one from your library'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn b-gh b-sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : current ? 'Replace' : 'Choose'}
          </button>
          {current ? (
            <button type="button" className="btn b-gh b-sm" onClick={() => onChange('')}>Remove</button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mediapick-panel">
          <label className="btn b-red b-sm" style={{ display: 'inline-block', cursor: 'pointer' }}>
            {busy ? busy : `Upload a new ${kind}`}
            <input
              type="file"
              hidden
              accept={kind === 'image'
                ? 'image/jpeg,image/png,image/webp,image/avif'
                : 'audio/mpeg,audio/wav,audio/mp4'}
              disabled={!!busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </label>
          {error ? <div className="err-box">{error}</div> : null}

          {options.length ? (
            <>
              <div className="eyebrow" style={{ marginTop: '1rem' }}>Your library</div>
              <div className="pickgrid">
                {options.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`pickcard ${a.id === value ? 'on' : ''}`}
                    onClick={() => { onChange(a.id); setOpen(false); }}
                    title={a.filename}
                  >
                    {kind === 'image' && a.url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.url} alt={a.alt || a.filename} />
                      : <span className="prev">♪</span>}
                    <span className="nm">{a.filename}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="sub" style={{ marginTop: '.8rem' }}>
              Nothing in your library yet. Upload one above.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
