'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProjectUploadUrl, confirmProjectUpload, deleteOwnFile, postMessage, type Result,
} from '../actions';
import { fileSize } from '@/lib/beat-files';
import { Banner, Submit } from '@/components/account/Field';
import { relative } from '@/components/account/bits';

/**
 * Client-side upload.
 *
 * Files go browser → R2 on a presigned URL, so nothing passes through the web
 * server and a 2GB stems archive is limited by the connection rather than by a
 * function timeout.
 *
 * Progress comes from XHR because fetch() cannot report upload progress, and a
 * four-minute silent upload is indistinguishable from a broken one.
 */

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', mp3: 'audio/mpeg',
  m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime',
};

const extOf = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
// A presigned PUT is signed for one exact Content-Type, so the value must be
// decided BEFORE the URL is requested and reused verbatim on the PUT. Some
// systems hand over a File with an empty type — .wav and .aiff especially.
const mimeOf = (f: File) => f.type || MIME_BY_EXT[extOf(f.name)] || 'application/octet-stream';

function putToR2(url: string, file: File, contentType: string, onProgress: (n: number) => void) {
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

type Row = { id: string; filename: string; label: string | null; bytes: number; createdAt: string };

export function FileZone({ projectId, files }: { projectId: string; files: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(files);
  const [over, setOver] = useState(false);
  const [queue, setQueue] = useState<{ name: string; pct: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();

  async function upload(file: File) {
    setError(null);
    const contentType = mimeOf(file);
    setQueue((q) => [...q, { name: file.name, pct: 0 }]);
    const bump = (pct: number) =>
      setQueue((q) => q.map((x) => (x.name === file.name ? { ...x, pct } : x)));

    const ticket = await getProjectUploadUrl({
      projectId, filename: file.name, contentType, bytes: file.size,
    });
    if (!ticket.ok) {
      setQueue((q) => q.filter((x) => x.name !== file.name));
      setError(ticket.error);
      return;
    }

    const put = await putToR2(ticket.url, file, contentType, bump);
    if (!put.ok) {
      setQueue((q) => q.filter((x) => x.name !== file.name));
      setError(
        put.status === 0
          ? 'Storage refused the connection. This is a bucket CORS rule, not your file — tell SnareByt.'
          : `Upload failed (HTTP ${put.status}).`,
      );
      return;
    }

    const done = await confirmProjectUpload({
      projectId, key: ticket.key, filename: file.name,
      mime: contentType, bytes: file.size, label: '',
    });
    setQueue((q) => q.filter((x) => x.name !== file.name));
    if (!done.ok) { setError(done.error); return; }

    router.refresh();
  }

  function pick(list: FileList | null) {
    if (!list) return;
    // Sequential, not parallel: several 500MB uploads at once will starve each
    // other on a home connection and all of them look stalled.
    void (async () => {
      for (const f of Array.from(list)) await upload(f);
    })();
  }

  function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}?\n\nSnareByt will no longer have it for this project.`)) return;
    start(async () => {
      const res = await deleteOwnFile(id);
      if (!res.ok) { setError(res.error); return; }
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    });
  }

  return (
    <>
      {error && <Banner kind="bad">{error}</Banner>}

      <div
        className={`upz${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <input
          ref={inputRef} type="file" multiple hidden
          onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
        />
        <b>Drop files here</b>
        <span>
          Stems, references, vocals, artwork — up to 2 GB each. They go straight to storage,
          never through the website, and only you and SnareByt can reach them.
        </span>
      </div>

      {queue.length > 0 && (
        <div className="upq">
          {queue.map((q) => (
            <div key={q.name} className="upq-i">
              <div className="upq-n">{q.name}</div>
              <div className="upq-t"><i style={{ width: `${q.pct}%` }} /></div>
              <div className="upq-p">{q.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="pt-list" style={{ marginTop: '1rem' }}>
          {rows.map((f) => (
            <div key={f.id} className="pt-row">
              <div>
                <div className="t">{f.label || f.filename}</div>
                <div className="s">{fileSize(f.bytes)} · sent {relative(f.createdAt)}</div>
              </div>
              <div className="r" style={{ display: 'flex', gap: '.4rem' }}>
                <a href={`/account/files/${f.id}`} className="btn btn-ghost btn-sm">Download</a>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => remove(f.id, f.filename)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

type Msg = { id: string; fromStudio: boolean; body: string; createdAt: string };

export function MessageBox({
  projectId, messages, revisionsLeft, revisionsAllowed,
}: {
  projectId: string;
  messages: Msg[];
  revisionsLeft: number;
  revisionsAllowed: number;
}) {
  const [state, action, pending] = useActionState<Result | null, FormData>(postMessage, null);
  const [asRevision, setAsRevision] = useState(false);

  return (
    <>
      {messages.length > 0 && (
        <div className="msgs">
          {messages.map((m) => (
            <div key={m.id} className={`msg${m.fromStudio ? ' them' : ' me'}`}>
              <div className="msg-b">{m.body}</div>
              <div className="msg-m">
                {m.fromStudio ? 'SnareByt' : 'You'} · {relative(m.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={action} style={{ marginTop: messages.length ? '1.2rem' : 0 }}>
        {state && <Banner kind={state.ok ? 'good' : 'bad'}>{state.ok ? state.message : state.error}</Banner>}
        <input type="hidden" name="projectId" value={projectId} />

        <label className="ff">
          <textarea
            name="body" placeholder=" " required disabled={pending}
            // key resets the field after a successful send, which is simpler
            // and more reliable than clearing it by hand.
            key={state?.ok ? String(messages.length) : 'draft'}
          />
          <span className="lbl">
            {asRevision ? 'What needs changing?' : 'Message SnareByt'}
          </span>
        </label>

        {revisionsAllowed > 0 && (
          <label className="check" style={{ margin: '.9rem 0' }}>
            <input
              type="checkbox" name="isRevision" disabled={pending || revisionsLeft === 0}
              checked={asRevision} onChange={(e) => setAsRevision(e.target.checked)}
            />
            <span>
              <b>Send this as a revision request</b>
              <div style={{ fontSize: '.74rem', color: 'var(--dim)', marginTop: '.2rem', lineHeight: 1.55 }}>
                {revisionsLeft > 0
                  ? `${revisionsLeft} of ${revisionsAllowed} left. This moves the project to "revision requested" and counts one.`
                  : `All ${revisionsAllowed} revisions used. Send a note instead and SnareByt will quote for an extra one.`}
              </div>
            </span>
          </label>
        )}

        <Submit pending={pending} className="btn btn-red">
          {pending ? 'Sending…' : asRevision ? 'Request revision' : 'Send message'}
        </Submit>
      </form>
    </>
  );
}
