'use client';

import { useState, useTransition } from 'react';
import { saveRelease } from './actions';
import { parseSpotifyUrl, embedUrl, FULL_PLAYER } from '@/lib/spotify';

type Release = {
  id: string; title: string; type: string; trackCount: number; releasedAt: string; youtubeUrl?: string | null;
  about: string; credits: string; spotifyUrl: string; live: boolean; featured: boolean;
};

const TYPES = ['SINGLE', 'EP', 'ALBUM', 'BEAT_TAPE', 'COLLABORATION'];

export default function ReleaseForm({ mode, release }: { mode: 'create' | 'edit'; release?: Release }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(release?.spotifyUrl ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Live preview as you type. This is the moment the admin stops feeling
  // like a form and starts feeling like it is doing something for you.
  const ref = parseSpotifyUrl(url);

  function submit(formData: FormData) {
    start(async () => {
      const res = await saveRelease(formData);
      if (res.ok) {
        setErrors({});
        if (res.warning) { setWarning(res.warning); return; } // keep the drawer open so it gets read
        setOpen(false);
      } else {
        setErrors(res.errors);
      }
    });
  }

  return (
    <>
      <button className={mode === 'create' ? 'btn b-red' : 'ib'} onClick={() => setOpen(true)}>
        {mode === 'create' ? '+ Add release' : '✎'}
      </button>

      {open && (
        <>
          <div className="scrim on" onClick={() => setOpen(false)} />
          <div className="drawer on">
            <div className="dw-hd">
              <div>
                <div className="eyebrow">{mode === 'create' ? 'New release' : 'Edit release'}</div>
                <h3>{release?.title ?? 'Add a release'}</h3>
              </div>
              <button className="x" onClick={() => setOpen(false)}>✕</button>
            </div>

            <form action={submit}>
              <div className="dw-bd">
                {release?.id && <input type="hidden" name="id" value={release.id} />}

                <div className={`fg ${errors.spotifyUrl ? 'bad' : ''}`}>
                  <label className="fl">Spotify link</label>
                  <input className="in" name="spotifyUrl" value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://open.spotify.com/album/… or /track/…" />
                  <div className="hint">
                    Paste the URL from Spotify (⋯ → Share → Copy link). The player and the real cover art come from
                    Spotify — <b>you never upload artwork for a release that is already out</b>.
                  </div>
                  {errors.spotifyUrl && <div className="err">{errors.spotifyUrl}</div>}
                </div>

                <div className={`fg ${errors.youtubeUrl ? 'bad' : ''}`}>
                  <label className="fl" htmlFor="youtubeUrl">YouTube video</label>
                  <input
                    className="in" id="youtubeUrl" name="youtubeUrl"
                    placeholder="https://www.youtube.com/watch?v=..."
                    defaultValue={release?.youtubeUrl ?? ''}
                  />
                  <div className="hint">
                    When set, the home page shows this video instead of the Spotify player.
                    Any YouTube link works — watch, share or Shorts.
                  </div>
                  {errors.youtubeUrl && <div className="err">{errors.youtubeUrl}</div>}
                </div>

                {ref && (
                  <div className="fg">
                    <label className="fl">Live player preview</label>
                    {/* Always the full player here. This preview exists to
                        confirm the link is the right record, so it should show
                        everything the link contains — the public page picks the
                        size from the track count. */}
                    <iframe title="Spotify preview" src={embedUrl(ref)} height={FULL_PLAYER}
                      style={{ width: '100%', border: 0, borderRadius: 12 }} loading="lazy" allowFullScreen
                      allow="clipboard-write *; encrypted-media *; fullscreen *; picture-in-picture *;" />
                    <div className="hint">Detected: <b>{ref.type}</b> · <span className="mono">{ref.id}</span></div>
                  </div>
                )}

                {warning && <div className="note"><span>⚠</span><span>{warning}</span></div>}

                <div className={`fg ${errors.title ? 'bad' : ''}`}>
                  <label className="fl">Title <span className="req">*</span></label>
                  <input className="in" name="title" defaultValue={release?.title ?? ''} required />
                  {errors.title && <div className="err">{errors.title}</div>}
                </div>

                <div className="f two">
                  <div className="fg">
                    <label className="fl">Type</label>
                    <select className="in" name="type" defaultValue={release?.type ?? 'SINGLE'}>
                      {TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Tracks</label>
                    <input className="in" name="trackCount" type="number" min={1}
                      defaultValue={release?.trackCount ?? 1} />
                  </div>
                  <div className={`fg ${errors.releasedAt ? 'bad' : ''}`}>
                    <label className="fl">Release date</label>
                    <input className="in" name="releasedAt" type="date" defaultValue={release?.releasedAt ?? ''} />
                    <div className="hint">Leave blank if you are not certain — the site shows a dash rather than a guess.</div>
                    {errors.releasedAt && <div className="err">{errors.releasedAt}</div>}
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">About</label>
                  <textarea className="in" name="about" rows={3} defaultValue={release?.about ?? ''} />
                </div>
                <div className="fg">
                  <label className="fl">Credits</label>
                  <input className="in" name="credits" defaultValue={release?.credits ?? 'Produced by SnareByt'} />
                </div>

                <div className="f two">
                  <label className="inline">
                    <input type="checkbox" name="live" defaultChecked={release?.live ?? false} />
                    <span><b>Live on site</b><div className="hint">Only tick this when the release is actually public.</div></span>
                  </label>
                  <label className="inline">
                    <input type="checkbox" name="featured" defaultChecked={release?.featured ?? false} />
                    <span><b>Featured track</b><div className="hint">Pins it to the homepage strip.</div></span>
                  </label>
                </div>
              </div>

              <div className="dw-ft">
                <span style={{ flex: 1 }} />
                <button type="button" className="btn b-gh" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn b-red" disabled={pending}>
                  {pending ? 'Saving…' : mode === 'create' ? 'Create release' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
