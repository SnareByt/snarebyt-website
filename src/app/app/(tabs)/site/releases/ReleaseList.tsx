'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveRelease, toggleLive, toggleFeatured, deleteRelease } from '@/app/admin/(dash)/releases/actions';
import { Sheet, Switch, useToast, useConfirm } from '@/components/app/Ui';
import { IcPlus, IcSpotify } from '@/components/app/Icons';

type Release = {
  id: string; title: string; type: string; year: string; releasedAt: string;
  trackCount: number; about: string; credits: string;
  spotifyUrl: string; youtubeUrl: string;
  hasSpotifyEmbed: boolean; hasCover: boolean; live: boolean; featured: boolean;
};

const TYPES = ['SINGLE', 'EP', 'ALBUM', 'BEAT_TAPE', 'COLLABORATION'] as const;

export function ReleaseList({ releases }: { releases: Release[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [editing, setEditing] = useState<Release | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const current = editing === 'new' ? null : editing;

  async function submit(formData: FormData) {
    setBusy(true);
    setErrors({});
    try {
      if (current) formData.set('id', current.id);
      const res = await saveRelease(formData);
      if (!res.ok) {
        setErrors(res.errors);
        toast(Object.values(res.errors)[0] ?? 'Could not save.', 'bad');
        return;
      }
      setEditing(null);
      /* The warning is the whole reason the save action calls Spotify's oEmbed
         endpoint: a wrong ID means somebody else's song plays on his site. It
         gets the long error-toast timing rather than the quick confirmation
         one, because it has to actually be read. */
      if (res.warning) toast(res.warning, 'bad');
      else toast(res.verifiedTitle ? `Saved. Spotify confirms “${res.verifiedTitle}”.` : 'Saved.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>Releases</h2>
        <p>{releases.filter((r) => r.live).length} live on the site</p>
      </div>

      <div className="wrap stack-lg">
        <button type="button" className="btn btn-full" onClick={() => setEditing('new')}>
          <IcPlus className="ic-sm" />
          Add a release
        </button>

        <div className="list">
          {releases.map((r) => (
            <div key={r.id} className="row">
              <div className="row-main" onClick={() => setEditing(r)} style={{ cursor: 'pointer' }}>
                <div className="row-t">{r.title}</div>
                <div className="row-s">
                  {r.type.replace(/_/g, ' ').toLowerCase()} · {r.year}
                  {r.trackCount > 1 ? ` · ${r.trackCount} tracks` : ''}
                </div>
                <div className="row-s" style={{ color: r.hasSpotifyEmbed ? 'var(--ok)' : 'var(--dim)' }}>
                  {r.hasSpotifyEmbed
                    ? 'Spotify player live'
                    : r.hasCover ? 'Own cover art' : 'Cover art pending'}
                  {r.featured ? ' · featured on home' : ''}
                </div>
              </div>
              <Switch
                label={`${r.title} live`}
                on={r.live}
                onChange={async (next) => {
                  const res = await toggleLive(r.id, next);
                  router.refresh();
                  return res;
                }}
              />
            </div>
          ))}
          {releases.length === 0 && <div className="empty">No releases yet.</div>}
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          The switch is what the public sees. Everything defaults to hidden, so a record
          that has been taken down cannot keep advertising itself. Tap a row to edit it.
        </p>
      </div>

      {/* ---------- Edit sheet ---------- */}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? current.title : 'New release'}
      >
        <form action={submit}>
          <div className="field">
            <label className="fl" htmlFor="r-title">Title</label>
            <input id="r-title" name="title" className="in" defaultValue={current?.title ?? ''} required maxLength={160} />
            {errors.title && <p className="err">{errors.title}</p>}
          </div>

          <div className="field">
            <label className="fl" htmlFor="r-spotify">Spotify link</label>
            <input
              id="r-spotify" name="spotifyUrl" className="in" type="url"
              inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={current?.spotifyUrl ?? ''}
              placeholder="https://open.spotify.com/track/…"
            />
            <p className="hint">
              <IcSpotify className="ic-sm" /> Paste this and the site renders a real player
              with Spotify&rsquo;s own cover art — no artwork upload needed. The link is
              verified on save, and you are warned if the title does not match.
            </p>
            {errors.spotifyUrl && <p className="err">{errors.spotifyUrl}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div className="field">
              <label className="fl" htmlFor="r-type">Type</label>
              <select id="r-type" name="type" className="in" defaultValue={current?.type ?? 'SINGLE'}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="fl" htmlFor="r-tracks">Tracks</label>
              <input
                id="r-tracks" name="trackCount" className="in" type="number"
                inputMode="numeric" min={1} max={100} defaultValue={current?.trackCount ?? 1}
              />
            </div>
          </div>

          <div className="field">
            <label className="fl" htmlFor="r-date">Release date</label>
            <input id="r-date" name="releasedAt" className="in" type="date" defaultValue={current?.releasedAt ?? ''} />
            <p className="hint">
              Leave blank if it is not confirmed. The site prints a dash rather than a
              guessed year.
            </p>
          </div>

          <div className="field">
            <label className="fl" htmlFor="r-youtube">YouTube link</label>
            <input
              id="r-youtube" name="youtubeUrl" className="in" type="url"
              inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={current?.youtubeUrl ?? ''}
            />
          </div>

          <div className="field">
            <label className="fl" htmlFor="r-about">About</label>
            <textarea id="r-about" name="about" className="in" defaultValue={current?.about ?? ''} maxLength={2000} />
          </div>

          <div className="field">
            <label className="fl" htmlFor="r-credits">Credits</label>
            <textarea id="r-credits" name="credits" className="in" defaultValue={current?.credits ?? ''} maxLength={2000} />
          </div>

          <div className="list" style={{ marginBottom: '1rem' }}>
            <label className="row">
              <div className="row-main">
                <div className="row-t">Live on the site</div>
                <div className="row-s">Off means nobody can see it</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="live" value="true" defaultChecked={current?.live ?? false} aria-label="Live on the site" />
                <i />
              </span>
            </label>
            <label className="row">
              <div className="row-main">
                <div className="row-t">Featured on the home page</div>
                <div className="row-s">Pinned into the featured strip</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="featured" value="true" defaultChecked={current?.featured ?? false} aria-label="Featured on the home page" />
                <i />
              </span>
            </label>
          </div>

          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : current ? 'Save release' : 'Add release'}
          </button>

          {current && (
            <button
              type="button"
              className="btn danger btn-full"
              style={{ marginTop: '.7rem' }}
              disabled={busy}
              onClick={async () => {
                const ok = await confirm(
                  `Delete ${current.title}?`,
                  'This removes the release from the site and from the database. If you only want it off the site, switch it to hidden instead.',
                  'Delete',
                );
                if (!ok) return;
                setBusy(true);
                try {
                  await deleteRelease(current.id);
                  setEditing(null);
                  toast('Deleted.');
                  router.refresh();
                } catch {
                  // requireOwner() throws rather than returning, so a STAFF
                  // account hits this rather than a tidy error object.
                  toast('That was refused. Deleting a release needs the owner account.', 'bad');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete release
            </button>
          )}
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}
