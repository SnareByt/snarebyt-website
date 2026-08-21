'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setProjectStatus, updateProjectNotes,
  getProjectUploadUrl, confirmProjectUpload, getProjectFileLink, removeProjectFile,
} from '@/app/admin/(dash)/projects/actions';
import { Sheet, useToast, useConfirm } from '@/components/app/Ui';
import { IcUpload, IcClose, IcCheck } from '@/components/app/Icons';
import { mimeOf, putToR2, uploadError } from '@/lib/upload-client';

type Project = {
  id: string; number: string; status: string; notes: string;
  deadline: string; contactName: string; email: string;
};

type StudioFile = {
  id: string; filename: string; label: string | null;
  bytes: string; isDeliverable: boolean; createdAt: string;
};

export function ProjectActions({
  project, files, nextStatuses, canDeliver,
}: {
  project: Project;
  files: StudioFile[];
  nextStatuses: { key: string; label: string }[];
  canDeliver: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<{ key: string; label: string } | null>(null);
  const [link, setLink] = useState<{ url: string; days: number } | null>(null);

  /* ---------- Files ---------- */

  async function upload(file: File, isDeliverable: boolean) {
    setPct(0);
    try {
      const contentType = mimeOf(file);
      const ticket = await getProjectUploadUrl({
        projectId: project.id, filename: file.name, contentType, bytes: file.size,
      });
      if (!ticket.ok) { toast(ticket.error, 'bad'); return; }

      const put = await putToR2(ticket.url, file, contentType, setPct);
      // Always the private bucket for project work, so the CORS hint points
      // at the right one.
      if (!put.ok) { toast(uploadError(put.status, false), 'bad'); return; }

      const done = await confirmProjectUpload({
        projectId: project.id,
        key: ticket.key,
        filename: file.name,
        mime: contentType,
        bytes: file.size,
        isDeliverable,
      });
      if (!done.ok) { toast(done.error, 'bad'); return; }

      toast(done.message ?? 'Uploaded.');
      router.refresh();
    } finally {
      setPct(null);
    }
  }

  function pick(isDeliverable: boolean) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void upload(f, isDeliverable);
    };
    input.click();
  }

  async function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast(res.error ?? 'That was refused.', 'bad'); return false; }
      if (res.message) toast(res.message);
      router.refresh();
      return true;
    } catch {
      toast('Could not reach the server.', 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* ---------- Final files ---------- */}
      <div>
        <div className="sec"><h3>Your files</h3></div>
        <div className="list">
          {files.map((f) => (
            <div key={f.id} className="row">
              <span
                className="thumb"
                style={{ width: 38, height: 38, color: f.isDeliverable ? 'var(--ok)' : 'var(--dim)' }}
                aria-hidden="true"
              >
                <IcCheck className="ic-sm" />
              </span>
              <div className="row-main">
                <div className="row-t">{f.label || f.filename}</div>
                <div className="row-s">
                  {f.bytes} · {f.createdAt}
                  {f.isDeliverable ? ' · final delivery' : ' · working file'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.4rem', flex: 'none' }}>
                <button
                  type="button"
                  className="btn gh btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await getProjectFileLink(f.id);
                      if (!res.ok) { toast(res.error, 'bad'); return; }
                      setLink({ url: res.url, days: res.expiresInDays });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Link
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  aria-label={`Remove ${f.filename}`}
                  onClick={async () => {
                    const ok = await confirm(
                      'Detach this file?',
                      'The stored copy is kept, so a client mid-download on a link you already sent is not cut off. It just stops being listed here.',
                      'Detach',
                    );
                    if (ok) await run(() => removeProjectFile(f.id));
                  }}
                >
                  <IcClose />
                </button>
              </div>
            </div>
          ))}

          {pct !== null && (
            <div className="row">
              <div className="row-main">
                <div className="row-t">Uploading {pct}%</div>
                <div className="bar" style={{ marginTop: '.4rem' }}>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )}

          {files.length === 0 && pct === null && (
            <div className="empty">Nothing uploaded yet.</div>
          )}
        </div>

        <div className="stack" style={{ marginTop: '.7rem' }}>
          <button
            type="button"
            className="btn btn-full"
            disabled={pct !== null}
            onClick={() => pick(true)}
          >
            <IcUpload className="ic-sm" />
            Upload the final delivery
          </button>
          <button
            type="button"
            className="btn gh btn-full"
            disabled={pct !== null}
            onClick={() => pick(false)}
          >
            Upload a working file
          </button>
        </div>

        <p className="hint" style={{ padding: '.6rem .3rem 0' }}>
          Everything here goes to the private bucket. Nothing a client sends, and nothing
          you make for them, ever gets a public URL.
        </p>
      </div>

      {/* ---------- Move it along ---------- */}
      <div>
        <div className="sec"><h3>Move it along</h3></div>
        {nextStatuses.length ? (
          <div className="stack">
            {nextStatuses.map((s) => {
              const blocked = s.key === 'DELIVERED' && !canDeliver;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`btn ${s.key === 'DELIVERED' ? '' : 'gh'} btn-full`}
                  disabled={busy || blocked}
                  onClick={() => setMoving(s)}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="note ok">
            <b>Delivered.</b> This record is closed — start a new booking if there is more
            work on it.
          </div>
        )}

        {!canDeliver && nextStatuses.some((s) => s.key === 'DELIVERED') && (
          <p className="note warn" style={{ marginTop: '.7rem' }}>
            Upload the final files and mark them as the delivery before marking this
            delivered. Otherwise the customer has paid and has nothing to download.
          </p>
        )}
      </div>

      {/* ---------- Notes ---------- */}
      <div className="stack">
        <button type="button" className="btn gh btn-full" onClick={() => setEditing(true)}>
          Notes and deadline
        </button>
        <a className="btn gh btn-full" href={`mailto:${project.email}`}>
          Email {project.contactName.split(' ')[0]}
        </a>
      </div>

      {/* ---------- Status sheet ---------- */}
      <Sheet
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title={moving?.label ?? ''}
      >
        <form
          action={async (formData: FormData) => {
            if (!moving) return;
            const note = String(formData.get('note') ?? '');
            const done = await run(() => setProjectStatus(project.id, moving.key, note));
            if (done) setMoving(null);
          }}
        >
          <div className="field">
            <label className="fl" htmlFor="p-note">Note (optional)</label>
            <textarea
              id="p-note" name="note" className="in" maxLength={1000}
              placeholder="What changed, or what you sent."
            />
            <p className="hint">
              Kept in the history with the date, so you can always answer &ldquo;when did
              this happen?&rdquo;. Admin only.
            </p>
          </div>

          {moving?.key === 'REVISION_REQUESTED' && (
            <p className="note warn" style={{ marginBottom: '1rem' }}>
              This counts one revision against the package. Going over the included number
              is allowed — it just gets recorded.
            </p>
          )}

          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : `Mark ${moving?.label.toLowerCase()}`}
          </button>
        </form>
      </Sheet>

      {/* ---------- Delivery link ---------- */}
      <Sheet open={Boolean(link)} onClose={() => setLink(null)} title="Delivery link">
        <p className="note warn" style={{ marginBottom: '.9rem' }}>
          This link works for {link?.days} day{link?.days === 1 ? '' : 's'} and then stops.
          Unlike a beat download it has <b>no attempt limit and is not logged</b>, so anyone
          it is forwarded to can fetch the file until it expires. Send it to the client
          directly.
        </p>
        <textarea
          className="in selectable"
          readOnly
          rows={5}
          value={link?.url ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          style={{ fontFamily: 'var(--font-mono), monospace', fontSize: '12px' }}
        />
        <button
          type="button"
          className="btn btn-full"
          style={{ marginTop: '1rem' }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link?.url ?? '');
              toast('Copied.');
            } catch {
              toast('Could not copy. Long-press to select it.', 'bad');
            }
          }}
        >
          Copy link
        </button>
      </Sheet>

      {/* ---------- Notes sheet ---------- */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Notes and deadline">
        <form
          action={async (formData: FormData) => {
            const done = await run(() => updateProjectNotes(project.id, formData));
            if (done) setEditing(false);
          }}
        >
          <div className="field">
            <label className="fl" htmlFor="p-deadline">Deadline</label>
            <input
              id="p-deadline" name="deadline" className="in" type="date"
              defaultValue={project.deadline}
            />
            <p className="hint">Leave blank if none has been agreed.</p>
          </div>
          <div className="field">
            <label className="fl" htmlFor="p-notes">Your notes</label>
            <textarea
              id="p-notes" name="notes" className="in" defaultValue={project.notes}
              maxLength={4000} rows={6}
            />
            <p className="hint">Admin only. Never shown to the client.</p>
          </div>
          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}
