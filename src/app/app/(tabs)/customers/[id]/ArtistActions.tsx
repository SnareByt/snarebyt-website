'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  suspendArtist, restoreArtist, saveAdminNote, resendVerification,
  signOutArtistEverywhere, artistDeletionImpact, deleteArtist,
} from '@/app/admin/(dash)/customers/actions';
import { Sheet, useToast, useConfirm } from '@/components/app/Ui';

/**
 * What can be done to an artist account from a phone.
 *
 * Every one of these calls the desktop's own server action unchanged. There is
 * no phone-specific copy of any of them, so a rule added on the desktop — the
 * owner check on suspend, the CUSTOMER-only guard on delete, the session
 * revocation inside the suspend transaction — applies here the moment it is
 * written, without anyone remembering to.
 *
 * Ordered by how reversible they are. Note and resend change nothing you
 * cannot redo; sign-out is an inconvenience; suspend is reversible but locks
 * someone out; delete is at the bottom, behind an impact check.
 */
type Artist = {
  id: string;
  email: string;
  suspended: boolean;
  verified: boolean;
  adminNote: string;
  sessions: number;
};

export function ArtistActions({ artist, isOwner }: { artist: Artist; isOwner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  /** Every action goes through here, so none of them can double-fire. */
  async function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) { toast(res.message ?? 'Done.'); router.refresh(); }
      else toast(res.error ?? 'That was refused.', 'bad');
      return res.ok;
    } catch {
      toast('Could not reach the server. Nothing was changed.', 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <div className="sec"><h3>Account</h3></div>
        <div className="list">
          <button
            type="button" className="row" disabled={busy}
            onClick={() => setNoteOpen(true)}
          >
            <div className="row-main">
              <div className="row-t">Private note</div>
              <div className="row-s">
                {artist.adminNote
                  ? artist.adminNote.slice(0, 60) + (artist.adminNote.length > 60 ? '…' : '')
                  : 'Only you ever see this'}
              </div>
            </div>
            <span className="row-v">{artist.adminNote ? 'Edit' : 'Add'}</span>
          </button>

          {!artist.verified && (
            <button
              type="button" className="row" disabled={busy}
              onClick={() => run(() => resendVerification(artist.id))}
            >
              <div className="row-main">
                <div className="row-t">Resend verification email</div>
                <div className="row-s">
                  Sends a fresh code. It does not verify the address for them.
                </div>
              </div>
            </button>
          )}

          <button
            type="button" className="row" disabled={busy || artist.sessions === 0}
            onClick={async () => {
              const ok = await confirm(
                'Sign out every device?',
                `${artist.email} will have to sign in again on ${artist.sessions === 1 ? 'their device' : 'all their devices'}. Nothing else changes.`,
                'Sign out',
              );
              if (ok) run(() => signOutArtistEverywhere(artist.id));
            }}
          >
            <div className="row-main">
              <div className="row-t">Sign out everywhere</div>
              <div className="row-s">
                {artist.sessions
                  ? `${artist.sessions} device${artist.sessions === 1 ? '' : 's'} signed in`
                  : 'No devices signed in'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {isOwner && (
        <div>
          <div className="sec"><h3>Access</h3></div>
          <div className="list">
            {artist.suspended ? (
              <button
                type="button" className="row" disabled={busy}
                onClick={() => run(() => restoreArtist(artist.id))}
              >
                <div className="row-main">
                  <div className="row-t">Restore access</div>
                  <div className="row-s">They can sign in again, fresh</div>
                </div>
              </button>
            ) : (
              <button
                type="button" className="row" disabled={busy}
                onClick={() => setSuspendOpen(true)}
              >
                <div className="row-main">
                  <div className="row-t redt">Suspend</div>
                  <div className="row-s">
                    Blocks sign-in and downloads. Reversible, and destroys nothing.
                  </div>
                </div>
              </button>
            )}

            <button
              type="button" className="row" disabled={busy}
              onClick={async () => {
                /* The impact is fetched from the server before asking, not
                   guessed here. "Delete this account?" without the numbers is
                   how someone finds out afterwards what was attached to it. */
                setBusy(true);
                const impact = await artistDeletionImpact(artist.id).catch(() => null);
                setBusy(false);
                if (!impact || !impact.ok) {
                  toast(impact?.error ?? 'Could not check what this would affect.', 'bad');
                  return;
                }
                const kept: string[] = [];
                if (impact.paidOrders) kept.push(`${impact.paidOrders} paid order${impact.paidOrders === 1 ? '' : 's'}`);
                if (impact.otherOrders) kept.push(`${impact.otherOrders} unpaid order${impact.otherOrders === 1 ? '' : 's'}`);
                if (impact.projects) kept.push(`${impact.projects} booking${impact.projects === 1 ? '' : 's'}`);
                if (impact.licences) kept.push(`${impact.licences} licence${impact.licences === 1 ? '' : 's'}`);

                const ok = await confirm(
                  `Delete ${impact.email}?`,
                  kept.length
                    ? `The account goes. ${kept.join(', ')} stay as records — detached from any account, not destroyed, so a paid licence is still provable. Their sessions, passkeys and saved beats are removed.`
                    : 'The account goes. Nothing is attached to it.',
                  'Delete account',
                );
                if (!ok) return;
                const done = await run(() => deleteArtist(artist.id));
                if (done) router.push('/app/customers');
              }}
            >
              <div className="row-main">
                <div className="row-t redt">Delete account</div>
                <div className="row-s">
                  Orders, bookings and licences are kept as records
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ---------- Note ---------- */}
      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Private note">
        <form
          action={async (fd) => {
            fd.set('userId', artist.id);
            const ok = await run(() => saveAdminNote(null, fd));
            if (ok) setNoteOpen(false);
          }}
          className="stack-lg"
        >
          <div className="field">
            <label className="fl" htmlFor="a-note">Note</label>
            <textarea
              id="a-note" name="note" className="in" rows={6} maxLength={4000}
              defaultValue={artist.adminNote}
              placeholder="Anything worth remembering next time they get in touch"
            />
            <p className="hint">
              Private. No query the artist&apos;s own pages run ever selects this column, so
              there is no route by which they could see it.
            </p>
          </div>
          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </form>
      </Sheet>

      {/* ---------- Suspend ---------- */}
      <Sheet open={suspendOpen} onClose={() => setSuspendOpen(false)} title={`Suspend ${artist.email}`}>
        <form
          action={async (fd) => {
            fd.set('userId', artist.id);
            const ok = await run(() => suspendArtist(null, fd));
            if (ok) setSuspendOpen(false);
          }}
          className="stack-lg"
        >
          <p className="note warn">
            <b>Nothing is destroyed.</b>
            <br />
            Their orders, licences and files stay exactly where they are — a paid licence has
            to stay provable even when the relationship has gone wrong. Every signed-in device
            is signed out in the same moment, so this takes effect now rather than whenever
            their cookie happens to expire.
          </p>
          <div className="field">
            <label className="fl" htmlFor="a-reason">Reason</label>
            <textarea
              id="a-reason" name="reason" className="in" rows={3} maxLength={300} required
              placeholder="What happened"
            />
            <p className="hint">
              Required, and at least a few words — it is what you will read in six months
              when you have forgotten why.
            </p>
          </div>
          <button type="submit" className="btn danger btn-full" disabled={busy}>
            {busy ? 'Suspending…' : 'Suspend account'}
          </button>
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}
