'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { IcBack, IcClose } from './Icons';

/* ============================================================
   Toast
   ============================================================
   Every mutation in this app returns { ok, message } or { ok, error }
   from an existing server action. A toast is how that sentence reaches
   the thumb that caused it: on a phone there is no room for the inline
   status text the desktop admin uses next to each control.

   Errors linger noticeably longer than confirmations. "Saved." needs a
   glance; "Cannot publish without an untagged MP3 — a buyer would pay
   and receive nothing" needs to be read to the end.
   ============================================================ */

type Toast = { id: number; text: string; kind: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'bad') => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    if (!text) return;
    const id = ++seq.current;
    setItems((v) => [...v, { id, text, kind }]);
    // Long enough to read a full sentence; errors get half again.
    const ms = kind === 'bad' ? 6200 : 3000;
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), ms);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {items.length > 0 && (
        <div className="toast-host" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ============================================================
   Sheet
   ============================================================
   The bottom modal. Everything that would be a separate page on
   desktop — edit a price, add a release, change an order's status —
   opens as a sheet, so the list underneath keeps its scroll position
   and the whole interaction stays one thumb-reach from the bottom of
   the screen.
   ============================================================ */

export function Sheet({
  open, onClose, title, children, action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* While a sheet is up the page behind it must not scroll. Without this,
     dragging on the backdrop scrolls the list underneath — which on iOS also
     drags the sheet's own scroll container out of sync with the keyboard. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="sheet-bd" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-hd">
          <h3>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {action}
            <button type="button" className="nav-btn" onClick={onClose} aria-label="Close">
              <IcClose />
            </button>
          </div>
        </div>
        <div className="sheet-bd-in">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/* ============================================================
   Navigation bar
   ============================================================ */

export function NavBar({
  title, back, right,
}: {
  title: string;
  /** A path, or true for "go back one step in history". */
  back?: string | true;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="navbar">
      <div className="nav-l">
        {back ? (
          <button
            type="button"
            className="nav-btn"
            onClick={() => (back === true ? router.back() : router.push(back))}
          >
            <IcBack />
            Back
          </button>
        ) : null}
      </div>
      <h1>{title}</h1>
      <div className="nav-r">{right}</div>
    </div>
  );
}

/* ============================================================
   Switch
   ============================================================
   A real iOS-proportioned toggle that reports optimistically and rolls
   itself back if the server refuses.

   Rolling back matters more here than anywhere else in the app. Several
   toggles are allowed to fail on purpose: publishing a beat with no
   untagged MP3 is refused, and a sold exclusive can never go back on
   sale. A switch that stayed on after the server said no would show
   Samir a beat as live that is not.
   ============================================================ */

export function Switch({
  on, onChange, disabled, label,
}: {
  on: boolean;
  onChange: (next: boolean) => Promise<{ ok: boolean; message?: string; error?: string }>;
  disabled?: boolean;
  label: string;
}) {
  const [state, setState] = useState(on);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const id = useId();

  // The server is the source of truth. If a save elsewhere changes this value,
  // the re-rendered prop must win over the local optimistic copy.
  useEffect(() => setState(on), [on]);

  return (
    <span className="sw">
      <input
        id={id}
        type="checkbox"
        checked={state}
        disabled={disabled || busy}
        aria-label={label}
        onChange={async (e) => {
          const next = e.target.checked;
          setState(next);
          setBusy(true);
          try {
            const res = await onChange(next);
            if (!res.ok) {
              setState(!next);
              toast(res.error ?? 'That change was refused.', 'bad');
            } else if (res.message) {
              toast(res.message);
            }
          } catch {
            setState(!next);
            toast('Could not reach the server. Nothing was changed.', 'bad');
          } finally {
            setBusy(false);
          }
        }}
      />
      <i />
    </span>
  );
}

/* ============================================================
   Submit button
   ============================================================
   Disables itself for the duration of the request. A double-tapped
   save is not harmless here: two taps on "Add release" is two releases.
   ============================================================ */

export function SubmitBtn({
  children, className = 'btn btn-full', pending,
}: {
  children: React.ReactNode;
  className?: string;
  pending: boolean;
}) {
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

/* ============================================================
   Confirm
   ============================================================
   For anything destructive. Deliberately types out what will happen in
   full rather than asking "Are you sure?", because on a phone the
   button is easy to hit by accident and "sure" is not information.
   ============================================================ */

export function useConfirm() {
  const [ask, setAsk] = useState<{
    title: string; body: string; confirmLabel: string; resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (title: string, body: string, confirmLabel = 'Delete') =>
      new Promise<boolean>((resolve) => setAsk({ title, body, confirmLabel, resolve })),
    [],
  );

  const node = ask ? (
    <Sheet open onClose={() => { ask.resolve(false); setAsk(null); }} title={ask.title}>
      <p style={{ fontSize: '.88rem', lineHeight: 1.6, color: 'var(--muted)' }}>{ask.body}</p>
      <div className="stack" style={{ marginTop: '1.4rem' }}>
        <button
          type="button"
          className="btn danger btn-full"
          onClick={() => { ask.resolve(true); setAsk(null); }}
        >
          {ask.confirmLabel}
        </button>
        <button
          type="button"
          className="btn gh btn-full"
          onClick={() => { ask.resolve(false); setAsk(null); }}
        >
          Cancel
        </button>
      </div>
    </Sheet>
  ) : null;

  return { confirm, confirmNode: node };
}

/* ============================================================
   Wordmark
   ============================================================
   SNAREBYT as one locked unit, never split, chrome gradient with the
   red waveform tick. Same construction as the desktop admin's, at
   phone scale.
   ============================================================ */

export function Wordmark() {
  return (
    <svg className="wm" viewBox="0 0 310 46" role="img" aria-label="SnareByt">
      <defs>
        <linearGradient id="app-wc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="30%" stopColor="#d6d6dd" />
          <stop offset="50%" stopColor="#74747f" />
          <stop offset="64%" stopColor="#f6f6f9" />
          <stop offset="100%" stopColor="#8d8d98" />
        </linearGradient>
      </defs>
      <text className="wm-t" x="0" y="31" textLength="288" lengthAdjust="spacing" fill="url(#app-wc)">
        SNAREBYT
      </text>
      <g fill="#FF2D4A">
        <rect x="292" y="6" width="3" height="10" rx="1.5" />
        <rect x="298" y="1" width="3" height="20" rx="1.5" />
        <rect x="304" y="9" width="3" height="5" rx="1.5" />
      </g>
    </svg>
  );
}
