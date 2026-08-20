'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  suspendArtist, restoreArtist, saveAdminNote, resendVerification,
  signOutArtistEverywhere, setProjectStatus, replyToProject,
  getDeliveryUploadUrl, confirmDelivery, type Result,
} from '../actions';

/** Shared result banner, in the admin's own vocabulary. */
function Note({ r }: { r: Result | null }) {
  if (!r) return null;
  return <div className={r.ok ? 'ok-box' : 'err-box'}>{r.ok ? r.message : r.error}</div>;
}

/* ------------------------------------------------------------------ */

export function AccountActions({
  userId, email, suspended, verified, liveSessions,
}: {
  userId: string; email: string; suspended: boolean; verified: boolean; liveSessions: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);
  const [asking, setAsking] = useState(false);
  const [suspendState, suspendAction, suspending] = useActionState<Result | null, FormData>(suspendArtist, null);

  const run = (fn: () => Promise<Result>) =>
    start(async () => { const r = await fn(); setRes(r); router.refresh(); });

  return (
    <>
      <Note r={suspendState ?? res} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginTop: '.9rem' }}>
        {!verified && (
          <button type="button" className="btn b-gh" disabled={busy}
            onClick={() => run(() => resendVerification(userId))}>
            Resend verification code
          </button>
        )}

        <button type="button" className="btn b-gh" disabled={busy || liveSessions === 0}
          onClick={() => run(() => signOutArtistEverywhere(userId))}>
          {liveSessions === 0
            ? 'No devices signed in'
            : `Sign out all ${liveSessions} ${liveSessions === 1 ? 'device' : 'devices'}`}
        </button>

        {suspended ? (
          <button type="button" className="btn b-red" disabled={busy}
            onClick={() => run(() => restoreArtist(userId))}>
            Restore this account
          </button>
        ) : asking ? (
          <form action={suspendAction}>
            <input type="hidden" name="userId" value={userId} />
            <label className="fl" htmlFor="susp-reason">Why are you suspending them?</label>
            <input className="in" id="susp-reason" name="reason" required
              placeholder="Chargeback opened / abuse / at their request" />
            <div className="hint">
              Stored on the account and shown here — it is what you will read in six months
              when you have forgotten.
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.8rem' }}>
              <button type="submit" className="btn b-dan" disabled={suspending}>
                {suspending ? 'Suspending…' : 'Suspend'}
              </button>
              <button type="button" className="btn b-gh" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn b-dan" disabled={busy} onClick={() => setAsking(true)}>
            Suspend this account
          </button>
        )}
      </div>

      <div className="note plain" style={{ marginTop: '1.2rem' }}>
        <span>🔒</span>
        <span>
          There is no way to see or set a password from here, on purpose. If {email} is locked
          out they reset it through their own inbox — support that can hand over an account by
          being asked nicely is not support, it is a back door.
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function NoteForm({ userId, note }: { userId: string; note: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveAdminNote, null);

  return (
    <form action={action}>
      <Note r={state} />
      <input type="hidden" name="userId" value={userId} />
      <textarea
        className="in" name="note" rows={4} defaultValue={note} disabled={pending}
        placeholder="Anything worth remembering next time they message. Never shown to them."
      />
      <button type="submit" className="btn b-red b-sm" disabled={pending} style={{ marginTop: '.7rem' }}>
        {pending ? 'Saving…' : 'Save note'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const STATUSES = [
  'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'FILES_RECEIVED', 'IN_PROGRESS',
  'FIRST_PREVIEW_READY', 'REVISION_REQUESTED', 'FINALISING', 'COMPLETED', 'DELIVERED',
];

const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

type File = {
  id: string; filename: string; label: string | null; size: string;
  uploadedBy: string; isDeliverable: boolean; createdAt: string;
};

type Project = {
  id: string; number: string; status: string; title: string; service: string;
  deadline: string | null; revisionsUsed: number; revisionsAllowed: number;
  files: File[];
  messages: { id: string; fromStudio: boolean; body: string; createdAt: string }[];
};

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  flac: 'audio/flac', zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed', pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime',
};
const mimeOf = (f: globalThis.File) =>
  f.type || MIME_BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';

export function ProjectPanel({ project }: { project: Project }) {
  const router = useRouter();
  const [statusState, statusAction, statusPending] = useActionState<Result | null, FormData>(setProjectStatus, null);
  const [replyState, replyAction, replyPending] = useActionState<Result | null, FormData>(replyToProject, null);
  const [open, setOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [final, setFinal] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);

  async function upload(file: globalThis.File) {
    setUpErr(null);
    setPct(0);
    const contentType = mimeOf(file);

    const ticket = await getDeliveryUploadUrl({
      projectId: project.id, filename: file.name, contentType, bytes: file.size,
    });
    if (!ticket.ok) { setPct(null); setUpErr(ticket.error); return; }

    const ok = await new Promise<{ ok: boolean; status: number }>((resolve) => {
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

    if (!ok.ok) {
      setPct(null);
      setUpErr(ok.status === 0
        ? 'Storage refused the connection — the private bucket needs a CORS rule allowing PUT from this site.'
        : `Upload failed (HTTP ${ok.status}).`);
      return;
    }

    const done = await confirmDelivery({
      projectId: project.id, key: ticket.key, filename: file.name,
      mime: contentType, bytes: file.size, label: final ? 'Final delivery' : 'Preview',
      isDeliverable: final,
    });
    setPct(null);
    if (!done.ok) { setUpErr(done.error); return; }
    router.refresh();
  }

  return (
    <div className="card pad" style={{ marginBottom: '1rem' }}>
      <div className="sec-hd">
        <h2>{project.title}</h2>
        <span className="chip">{project.number}</span>
        <span className={`chip ${project.status === 'DELIVERED' || project.status === 'COMPLETED' ? 'ok' : 'info'}`}>
          {label(project.status)}
        </span>
        <span className="chip off">
          {project.revisionsUsed}/{project.revisionsAllowed} revisions
        </span>
        <span className="sp" />
        <button type="button" className="btn b-gh b-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Manage'}
        </button>
      </div>

      {open && (
        <>
          <form action={statusAction} style={{ marginBottom: '1.2rem' }}>
            <Note r={statusState} />
            <input type="hidden" name="projectId" value={project.id} />
            <label className="fl" htmlFor={`st-${project.id}`}>Move to</label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <select className="in" id={`st-${project.id}`} name="status" defaultValue={project.status}
                style={{ maxWidth: 240 }}>
                {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
              <input className="in" name="note" placeholder="Optional note shown on their timeline"
                style={{ flex: 1, minWidth: 200 }} />
              <button type="submit" className="btn b-red" disabled={statusPending}>
                {statusPending ? 'Saving…' : 'Update'}
              </button>
            </div>
          </form>

          <div style={{ marginBottom: '1.2rem' }}>
            <label className="fl">Send a preview or final delivery</label>
            {upErr && <div className="err-box">{upErr}</div>}
            <label className="inline" style={{ margin: '.5rem 0 .7rem' }}>
              <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} />
              <span>
                <b>This is the final delivery</b>
                <div className="hint">Marks it as final on their page. Previews stay unmarked.</div>
              </span>
            </label>
            <input ref={inputRef} type="file" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <button type="button" className="btn b-gh" disabled={pct !== null}
              onClick={() => inputRef.current?.click()}>
              {pct !== null ? `Uploading ${pct}%` : 'Choose a file'}
            </button>
          </div>

          {project.files.length > 0 && (
            <div className="tbl-wrap" style={{ marginBottom: '1.2rem' }}>
              <div className="tbl-scroll">
                <table>
                  <thead><tr><th>File</th><th>From</th><th>Size</th><th>Added</th></tr></thead>
                  <tbody>
                    {project.files.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div className="ttl">{f.label || f.filename}</div>
                          <div className="sub">{f.filename}</div>
                        </td>
                        <td>
                          <span className={`chip ${f.uploadedBy === 'STUDIO' ? 'info' : 'off'}`}>
                            {f.uploadedBy === 'STUDIO' ? 'Studio' : 'Artist'}
                          </span>
                          {f.isDeliverable && <span className="chip ok">Final</span>}
                        </td>
                        <td className="sub">{f.size}</td>
                        <td className="sub">{f.createdAt.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <form action={replyAction}>
            <Note r={replyState} />
            <input type="hidden" name="projectId" value={project.id} />
            <label className="fl" htmlFor={`rp-${project.id}`}>Reply to the artist</label>
            <textarea className="in" id={`rp-${project.id}`} name="body" rows={3}
              placeholder="They see this in their project thread." disabled={replyPending}
              key={replyState?.ok ? 'sent' : 'draft'} />
            <button type="submit" className="btn b-red b-sm" disabled={replyPending} style={{ marginTop: '.7rem' }}>
              {replyPending ? 'Sending…' : 'Send'}
            </button>
          </form>

          {project.messages.length > 0 && (
            <div style={{ marginTop: '1.2rem', maxHeight: 260, overflowY: 'auto' }}>
              {project.messages.map((m) => (
                <div key={m.id} style={{ padding: '.6rem 0', borderBottom: '1px dashed rgba(255,255,255,.06)' }}>
                  <div className="sub">
                    {m.fromStudio ? 'SnareByt' : 'Artist'} · {m.createdAt.slice(0, 10)}
                  </div>
                  <div style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap', marginTop: '.2rem' }}>{m.body}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
