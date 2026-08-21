'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, useConfirm } from '@/components/app/Ui';
import { IcBell, IcCheck, IcWarn } from '@/components/app/Icons';

type Device = {
  id: string; label: string; added: string; lastPush: string;
  disabledReason: string | null;
};

type MailStatus =
  | { ok: true; to: string }
  | { ok: false; problem: string; fix: string };

export function AlertsPanel({
  configured, publicKey, devices, email,
}: {
  configured: boolean;
  publicKey: string;
  devices: Device[];
  email: MailStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'checking' | 'on' | 'off' | 'blocked' | 'unsupported'>('checking');
  /* Whether push needs the app INSTALLED before it will work. That is an
     iOS rule, not a web one: desktop Chrome, Edge and Firefox deliver push to
     an ordinary tab. Requiring standalone everywhere is what stopped this
     working on a Mac or a PC. */
  const [needsInstall, setNeedsInstall] = useState(false);

  /**
   * Work out what this device can actually do, once, on mount.
   *
   * Four distinct states, and conflating any of them produces a screen that
   * lies. "Blocked" in particular cannot be fixed by any button here — once
   * iOS permission is denied, only the system Settings app can undo it, so
   * offering an enable button would be a button that silently does nothing.
   */
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    /* iPadOS reports itself as Macintosh, so the touch count is what separates
       a real Mac from an iPad pretending to be one. Getting this wrong tells a
       Mac user to add the app to a Home Screen it does not have. */
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua)
      || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

    setNeedsInstall(isIOS && !isStandalone);

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    // Permission granted is not the same as subscribed: the subscription can
    // be dropped while permission survives, and then nothing arrives.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        toast('Alerts were not allowed.', 'bad');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        // Without this every push must carry a visible notification. That is
        // the behaviour we want anyway, and Chrome refuses to subscribe
        // without it.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch('/app/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const json = await res.json();
      if (!json.ok) { toast(json.error ?? 'Could not register this device.', 'bad'); return; }

      setState('on');
      toast('Alerts are on for this phone.');
      router.refresh();
    } catch {
      toast('Could not turn alerts on. Make sure the app is on your Home Screen.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const ok = await confirm(
      'Turn alerts off on this phone?',
      'You will stop getting a buzz for new orders, payments and bookings on this device. Email alerts are unaffected.',
      'Turn off',
    );
    if (!ok) return;

    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/app/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      toast('Alerts are off on this phone.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch('/app/api/push/test', { method: 'POST' });
      const json = await res.json();
      toast(json.ok ? json.message : json.error, json.ok ? 'ok' : 'bad');
    } catch {
      toast('Could not reach the server.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>Alerts</h2>
        <p>New orders, payments and bookings</p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- This phone ---------- */}
        <div>
          <div className="sec"><h3>This phone</h3></div>

          {!configured ? (
            <div className="note red">
              <b>Push is not set up on the server.</b>
              <br />
              The VAPID keys are missing. Generate a pair and set VAPID_PUBLIC_KEY,
              VAPID_PRIVATE_KEY and VAPID_SUBJECT in the hosting environment, then redeploy.
              Email alerts work regardless.
            </div>
          ) : needsInstall ? (
            <div className="note warn">
              <b>Add the app to your Home Screen first.</b>
              <br />
              iPhone and iPad only deliver alerts to an installed web app. In Safari, tap
              Share, then Add to Home Screen, open it from the icon and come back here.
              On a Mac or a PC nothing needs installing — just switch them on.
            </div>
          ) : state === 'unsupported' ? (
            <div className="note warn">
              <b>This browser cannot receive alerts.</b>
              <br />
              On iPhone or iPad, open the app from its Home Screen icon on iOS 16.4 or newer.
              On a computer use Chrome, Edge or Firefox — Safari on macOS needs the site added
              to the Dock first.
            </div>
          ) : state === 'blocked' ? (
            <div className="note red">
              <b>Notifications are blocked for this app.</b>
              <br />
              No button here can undo that — iOS keeps the decision. Open Settings →
              Notifications → SnareByt and allow them, then come back.
            </div>
          ) : (
            <>
              <div className={`note ${state === 'on' ? 'ok' : ''}`}>
                {state === 'on' ? (
                  <><b><IcCheck className="ic-sm" /> Alerts are on for this phone.</b></>
                ) : state === 'checking' ? (
                  'Checking…'
                ) : (
                  <><b><IcWarn className="ic-sm" /> Alerts are off on this phone.</b></>
                )}
              </div>

              <div className="stack" style={{ marginTop: '.7rem' }}>
                {state === 'on' ? (
                  <>
                    <button type="button" className="btn gh btn-full" disabled={busy} onClick={test}>
                      Send a test alert
                    </button>
                    <button type="button" className="btn danger btn-full" disabled={busy} onClick={disable}>
                      Turn alerts off
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-full"
                    disabled={busy || state === 'checking'}
                    onClick={enable}
                  >
                    <IcBell className="ic-sm" />
                    Turn alerts on
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ---------- Registered devices ---------- */}
        {devices.length > 0 && (
          <div>
            <div className="sec"><h3>Devices receiving alerts</h3></div>
            <div className="list">
              {devices.map((d) => (
                <div key={d.id} className="row">
                  <div className="row-main">
                    <div className="row-t">{d.label}</div>
                    <div className="row-s">Added {d.added} · last alert {d.lastPush}</div>
                    {d.disabledReason && (
                      <div className="row-s" style={{ color: '#ff9aa8', whiteSpace: 'normal' }}>
                        {d.disabledReason}
                      </div>
                    )}
                  </div>
                  <span className={`chip ${d.disabledReason ? 'red' : 'ok'}`}>
                    {d.disabledReason ? 'silent' : 'live'}
                  </span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ padding: '0 .3rem' }}>
              A device goes silent when the push service rejects it — usually because the app
              was removed. It is kept rather than deleted so this screen can say why alerts
              stopped, instead of just showing nothing.
            </p>
          </div>
        )}

        {/* ---------- Email ---------- */}
        <div>
          <div className="sec"><h3>Email alerts</h3></div>
          {email.ok ? (
            <div className="note ok">
              <b>Email alerts go to {email.to}.</b>
              <br />
              Push and email are sent together, so one failing does not silence the other.
            </div>
          ) : (
            <div className="note warn">
              <b>{email.problem}</b>
              <br />
              {email.fix}
            </div>
          )}
        </div>
      </div>

      {confirmNode}
    </>
  );
}

/**
 * The VAPID key arrives base64url-encoded and `pushManager.subscribe` wants
 * raw bytes. Base64url is not base64: `-` and `_` replace `+` and `/`, and the
 * padding is stripped. Feeding it to atob() unconverted throws, which presents
 * as "alerts just will not turn on" with nothing in the console to explain it.
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
