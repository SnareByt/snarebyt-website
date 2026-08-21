'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setProjectStatus, updateProjectNotes, deleteProject,
  getProjectUploadUrl, confirmProjectUpload, getProjectFileLink, removeProjectFile,
} from '../actions';
import { replyToProject } from '../../customers/actions';

/**
 * Everything you can do to a project, from the desktop.
 *
 * Every one of these actions already existed — the phone dashboard has been
 * driving them since it was built. This screen calls the same ones rather than
 * a second implementation, so a rule enforced on the phone cannot quietly not
 * apply here.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string };

const STATUSES = [
  'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'FILES_RECEIVED', 'IN_PROGRESS',
  'FIRST_PREVIEW_READY', 'REVISION_REQUESTED', 'FINALISING', 'COMPLETED', 'DELIVERED',
];

const label = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  flac: 'audio/flac', zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed', pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime',
};
const mimeOf = (f: File) =>
  f.type || MIME_BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';

function Note({ r }: { r: Result | null }) {
  if (!r) return null;
  return <div className={r.ok ? 'ok-box' : 'err-box'}>{r.ok ? r.message : r.error}</div>;
}

type FileRow = {
  id: string; filename: string; label: string | null; size: string;
  uploadedBy: string; isDeliverable: boolean; createdAt: string;
};

export function ProjectPanel({
  project,
}: {
  project: {
    id: string; number: string; status: string; notes: string; deadline: string;
    revisionsUsed: number; revisionsAllowed: number;
    hasPaidOrder: boolean; fileCount: number;
    files: FileRow[];
    messages: { id: string; fromStudio: boolean; body: string; createdAt: string }[];
  };
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  const [status, setStatus] = useState(project.status);
  const [statusNote, setStatusNote] = useState('');
  const [reply, setReply] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [final, setFinal] = useState(false);

  const run = (fn: () => Promise<Result>) =>
    start(async () => { const r = await fn(); setRes(r); if (r.ok) router.refresh(); });

  async function upload(file: File) {
    setRes(null);
    setPct(0);
    const contentType = mimeOf(file);

    const ticket = await getProjectUploadUrl({
      projectId: project.id, filename: file.name, contentType, bytes: file.size,
    });
    if (!ticket.ok) { setPct(null); setRes(ticket); return; }

    const put = await new Promise<{ ok: boolean; status: number }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', ticket.url);
      xhr.setRequestHeader('content-type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
      xhr.onerror = () => resolve({ ok: false, status: 0 });
      xhr.send(file);
    });

    if (!put.ok) {
      setPct(null);
      setRes({
        ok: false,
        error: put.status === 0
          ? 'Storage refused the connection — the private bucket needs a CORS rule allowing PUT from this site.'
          : `Upload failed (HTTP ${put.status}).`,
      });
      return;
    }

    const done = await confirmProjectUpload({
      projectId: project.id, key: ticket.key, filename: file.name,
      mime: contentType, bytes: file.size,
      label: final ? 'Final delivery' : 'Preview',
      isDeliverable: final,
    });
    setPct(null);
    setRes(done);
    if (done.ok) router.refresh();
  }

  async function openFile(fileId: string) {
    // Takes the file id alone — it resolves the project itself and checks
    // admin on the way through.
    const r = await getProjectFileLink(fileId);
    if (!r.ok) { setRes(r); return; }
    window.open(r.url, '_blank', 'noopener');
  }

  function remove() {
    if (!confirm(
      `Delete ${project.number}?\n\nThis removes the enquiry, its messages and its history. It cannot be undone.`,
    )) return;
    start(async () => {
      const r = await deleteProject(project.id);
      setRes(r);
      if (r.ok) router.push('/admin/projects');
    });
  }

  return (
    <>
      <Note r={res} />

      <div className="grid2">
        <div className="card pad">
          <div className="sec-hd">
            <h2>Status</h2>
            <span className="chip info">{label(project.status)}</span>
            <span className="chip off">{project.revisionsUsed}/{project.revisionsAllowed} revisions</span>
          </div>

          <label className="fl" htmlFor="pj-status">Move to</label>
          <select className="in" id="pj-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>

          <label className="fl" htmlFor="pj-note" style={{ marginTop: '.9rem' }}>
            Note for their timeline
          </label>
          <input className="in" id="pj-note" value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Optional — the client sees this" />

          <button
            type="button" className="btn b-red" style={{ marginTop: '.9rem' }}
            disabled={busy || status === project.status}
            onClick={() => run(async () => {
              const r = await setProjectStatus(project.id, status, statusNote || undefined);
              if (r.ok) setStatusNote('');
              return r;
            })}
          >
            {busy ? 'Working…' : status === project.status ? 'Already at that status' : 'Update status'}
          </button>
        </div>

        <div className="card pad">
          <div className="sec-hd"><h2>Working notes</h2><span className="chip">private</span></div>
          <form
            action={(fd) => run(() => updateProjectNotes(project.id, fd))}
          >
            <label className="fl" htmlFor="pj-deadline">Agreed deadline</label>
            <input className="in" id="pj-deadline" name="deadline" type="date" defaultValue={project.deadline} />

            <label className="fl" htmlFor="pj-notes" style={{ marginTop: '.9rem' }}>Notes</label>
            <textarea className="in" id="pj-notes" name="notes" rows={4} defaultValue={project.notes}
              placeholder="Never shown to the client." />

            <button type="submit" className="btn b-gh" style={{ marginTop: '.9rem' }} disabled={busy}>
              Save notes
            </button>
          </form>
        </div>
      </div>

      <section className="sec" style={{ marginTop: '1.6rem' }}>
        <div className="sec-hd">
          <h2>Files</h2>
          <span className="chip">{project.files.length}</span>
          <span className="sp" />
          <label className="inline" style={{ marginRight: '.7rem' }}>
            <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} />
            <span><b>Final delivery</b></span>
          </label>
          <input ref={inputRef} type="file" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <button type="button" className="btn b-red b-sm" disabled={pct !== null}
            onClick={() => inputRef.current?.click()}>
            {pct !== null ? `Uploading ${pct}%` : 'Send a file'}
          </button>
        </div>

        {project.files.length === 0 ? (
          <div className="empty">No files yet.</div>
        ) : (
          <div className="tbl-wrap"><div className="tbl-scroll">
            <table>
              <thead><tr><th>File</th><th>From</th><th>Size</th><th>Added</th><th /></tr></thead>
              <tbody>
                {project.files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="ttl">{f.label || f.filename}</div>
                      <div className="sub">{f.filename}</div>
                    </td>
                    <td>
                      <span className={`chip ${f.uploadedBy === 'STUDIO' ? 'info' : 'off'}`}>
                        {f.uploadedBy === 'STUDIO' ? 'Studio' : 'Client'}
                      </span>
                      {f.isDeliverable ? <span className="chip ok">Final</span> : null}
                    </td>
                    <td className="sub">{f.size}</td>
                    <td className="sub">{f.createdAt}</td>
                    <td className="acts">
                      <div style={{ display: 'inline-flex', gap: '.35rem' }}>
                        <button type="button" className="btn b-gh b-sm" onClick={() => void openFile(f.id)}>
                          Open
                        </button>
                        <button type="button" className="btn b-dan b-sm" disabled={busy}
                          onClick={() => {
                            if (!confirm(`Remove ${f.filename}?`)) return;
                            run(() => removeProjectFile(f.id));
                          }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </section>

      <section className="sec">
        <div className="sec-hd"><h2>Messages</h2><span className="chip">{project.messages.length}</span></div>

        {project.messages.length > 0 && (
          <div className="card pad" style={{ marginBottom: '1rem', maxHeight: 300, overflowY: 'auto' }}>
            {project.messages.map((m) => (
              <div key={m.id} style={{ padding: '.6rem 0', borderBottom: '1px dashed rgba(255,255,255,.06)' }}>
                <div className="sub">{m.fromStudio ? 'SnareByt' : 'Client'} · {m.createdAt}</div>
                <div style={{ fontSize: '.86rem', whiteSpace: 'pre-wrap', marginTop: '.2rem' }}>{m.body}</div>
              </div>
            ))}
          </div>
        )}

        <form
          action={(fd) => run(async () => {
            const r = await replyToProject(null, fd);
            if (r.ok) setReply('');
            return r;
          })}
        >
          <input type="hidden" name="projectId" value={project.id} />
          <label className="fl" htmlFor="pj-reply">Reply to the client</label>
          <textarea className="in" id="pj-reply" name="body" rows={3} value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="They see this in their project thread." />
          <button type="submit" className="btn b-red b-sm" style={{ marginTop: '.7rem' }} disabled={busy}>
            Send
          </button>
        </form>
      </section>

      <div className="note" style={{ marginTop: '1.6rem' }}>
        <span>⚖</span>
        <span>
          {project.hasPaidOrder ? (
            <><b>This is paid work and cannot be deleted.</b> The record of what was bought has to
              stay provable. Mark it delivered instead.</>
          ) : project.fileCount > 0 ? (
            <><b>This has files attached.</b> Files usually mean real work happened here — remove
              them first if you are certain it should go.</>
          ) : (
            <><b>This is an unpaid enquiry with no files.</b> Delete it if it is spam or a
              duplicate. Messages and history go with it.</>
          )}
        </span>
        {!project.hasPaidOrder && project.fileCount === 0 && (
          <button type="button" className="btn b-dan b-sm" disabled={busy} onClick={remove}
            style={{ marginLeft: 'auto', flex: 'none' }}>
            Delete enquiry
          </button>
        )}
      </div>
    </>
  );
}
