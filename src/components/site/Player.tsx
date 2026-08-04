'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { coverCss } from '@/lib/cover-art';

/**
 * Sticky preview player.
 *
 * Only ever plays TAGGED previews from the public bucket. The untagged MP3,
 * WAV and stems live in the private bucket and are never given a URL, so there
 * is nothing here that could accidentally stream a master.
 *
 * A track with no `src` is not playable — that happens whenever a beat or
 * release has no preview uploaded yet. Rather than render a control that does
 * nothing, PlayButton returns null in that case.
 */
export type Track = {
  id: string;
  title: string;
  subtitle: string;
  src: string | null;
  coverUrl: string | null;
  seed: number;
};

type Ctx = {
  current: Track | null;
  playing: boolean;
  error: string | null;
  play: (queue: Track[], index: number) => void;
  toggle: () => void;
  isCurrent: (id: string) => boolean;
};

const PlayerCtx = createContext<Ctx>({
  current: null,
  playing: false,
  error: null,
  play: () => {},
  toggle: () => {},
  isCurrent: () => false,
});

export const usePlayer = () => useContext(PlayerCtx);

const time = (s: number) =>
  Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.7);

  const current = queue[index] ?? null;

  const play = useCallback((q: Track[], i: number) => {
    const playable = q.filter((t) => t.src);
    if (!playable.length) return;
    const target = q[i];
    const at = target?.src ? playable.findIndex((t) => t.id === target.id) : 0;
    setQueue(playable);
    setIndex(at < 0 ? 0 : at);
    setOpen(true);
    setError(null);
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const step = useCallback((d: number) => {
    setIndex((i) => (queue.length ? (i + d + queue.length) % queue.length : 0));
    setError(null);
    setPlaying(true);
  }, [queue.length]);

  const isCurrent = useCallback((id: string) => current?.id === id && playing, [current, playing]);

  // Drive the audio element from state rather than the other way round, so the
  // bar and every card stay in agreement about what is playing.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current?.src) return;
    if (a.src !== current.src) {
      a.src = current.src;
      a.load();
    }
    if (playing) {
      a.play().catch(() => {
        // Autoplay refusal or a missing file. Say so rather than showing a
        // play button that appears stuck.
        setPlaying(false);
        setError('Could not play this preview. The file may not be uploaded yet.');
      });
    } else {
      a.pause();
    }
  }, [current, playing]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = vol;
  }, [vol]);

  return (
    <PlayerCtx.Provider value={{ current, playing, error, play, toggle, isCurrent }}>
      {children}

      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => step(1)}
        onError={() => {
          setPlaying(false);
          setError('That preview could not be loaded.');
        }}
      />

      <div id="bar" className={`${open ? 'up' : ''} ${playing ? 'playing' : ''}`.trim()}>
        <div
          className="prog"
          onClick={(e) => {
            const a = audioRef.current;
            if (!a || !Number.isFinite(a.duration)) return;
            const r = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
          }}
        >
          <i style={{ width: dur ? `${(cur / dur) * 100}%` : 0 }} />
        </div>

        <div className="bar-in">
          <div
            className="bar-art"
            style={current?.coverUrl ? undefined : { background: coverCss(current?.seed ?? 211) }}
          >
            {current?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="covimg" src={current.coverUrl} alt="" />
            ) : null}
          </div>

          <div className="bar-info">
            <div className="t">{current?.title ?? '—'}</div>
            <div className="s">{error ?? current?.subtitle ?? '—'}</div>
          </div>

          <div className="bar-ctl">
            <button type="button" className="pbtn" onClick={() => step(-1)} aria-label="Previous">
              <svg viewBox="0 0 24 24"><path d="M7 5v14H5V5h2zm12 0v14l-11-7 11-7z" /></svg>
            </button>
            <button type="button" className="pbtn main" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              <svg className="i-play" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" /></svg>
              <svg className="i-pause" viewBox="0 0 24 24"><path d="M7 4h4v16H7zm6 0h4v16h-4z" /></svg>
            </button>
            <button type="button" className="pbtn" onClick={() => step(1)} aria-label="Next">
              <svg viewBox="0 0 24 24"><path d="M17 5v14h2V5h-2zM5 5v14l11-7L5 5z" /></svg>
            </button>
          </div>

          <div className="bar-time">{time(cur)} / {time(dur)}</div>

          <div className="vol">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--muted)">
              <path d="M4 9h3l5-4v14l-5-4H4z" />
              <path d="M16 8a5 5 0 010 8" stroke="var(--muted)" strokeWidth="1.8" fill="none" />
            </svg>
            <input
              type="range" min={0} max={100} value={Math.round(vol * 100)}
              onChange={(e) => setVol(Number(e.target.value) / 100)}
              aria-label="Volume"
            />
          </div>

          <button
            type="button" className="pbtn" style={{ fontSize: '1.1rem' }} aria-label="Close player"
            onClick={() => { setPlaying(false); setOpen(false); }}
          >
            ✕
          </button>
        </div>
      </div>
    </PlayerCtx.Provider>
  );
}

/**
 * Play control for a card. Renders nothing when there is no preview file,
 * because a play button that cannot play is worse than no button.
 */
export function PlayButton({
  queue, index, label, className = 'play',
}: { queue: Track[]; index: number; label: string; className?: string }) {
  const { play, toggle, isCurrent } = usePlayer();
  const track = queue[index];
  if (!track?.src) return null;

  const active = isCurrent(track.id);
  return (
    <button
      type="button"
      className={className}
      aria-label={active ? `Pause ${label}` : `Play ${label}`}
      onClick={() => (active ? toggle() : play(queue, index))}
    >
      <span className="play-circle">
        {active ? (
          <svg viewBox="0 0 24 24"><path d="M7 4h4v16H7zm6 0h4v16h-4z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" /></svg>
        )}
      </span>
    </button>
  );
}
