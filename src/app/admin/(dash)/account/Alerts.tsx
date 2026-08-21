'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type PushDeviceRow = {
  id: string;
  label: string;
  added: string;
  lastPush: string;
  disabledReason: string | null;
};

/**
 * Desktop notifications for this computer.
 *
 * This is the piece that was missing. The phone dashboard has had a
 * notifications screen since it was built, but its service worker is scoped to
 * /app/ — a worker cannot claim a scope above its own directory — so there was
 * nothing at /admin to receive a push. Turning alerts on from a computer was
 * impossible, not broken.
 *
 * Registering /sw.js gives the root scope a worker. It is the same
 * implementation, imported rather than copied, and it has no fetch handler, so
 * it never touches a page load.
 */
export function Alerts({
  configured, publicKey, devices,
}: {
  configured: boolean;
  publicKey: string;
  devices: PushDeviceRow[];
}) {
  const router = useRouter();

  /* Five states, and conflating any two produces a screen that lies. "Blocked"
     in particular cannot be fixed by any button here — once a browser's
     permission is denied, only its own settings can undo it, so offering an
     Enable button would be a button that does nothing. */
  const [state, setState] =
    useState<'checking' | 'on' | 'off' | 'blocked' | 'unsupported'>('checking');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const sub = await existingSubscription();
        // Permission granted is not the same as subscribed — a subscription can
        // be dropped while the permission survives, and then nothing arrives.
        if (!cancelled) setState(sub ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('off');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      // Already subscribed under the phone app's scope? Say so and stop.
      // Subscribing again would create a SECOND endpoint for the same machine
      // and every alert would arrive twice.
      const already = await existingSubscription();
      if (already) {
        setState('on');
        setMsg({ ok: true, text: 'This computer was already registered. Send a test to check it.' });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        setMsg({ ok: false, text: 'Alerts were not allowed by the browser.' });
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        // Without this, every push would have to be silent. Chrome refuses to
        // subscribe without it anyway, and a visible alert is the point.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch('/app/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const json = await res.json();
      if (!json.ok) { setMsg({ ok: false, text: json.error ?? 'Could not register this computer.' }); return; }

      setState('on');
      setMsg({ ok: true, text: 'Alerts are on for this computer. Send a test to prove it.' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: `Could not turn alerts on. ${(e as Error).message ?? ''}`.trim() });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const sub = await existingSubscription();
      if (sub) {
        await fetch('/app/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
      setMsg({ ok: true, text: 'Alerts are off for this computer.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/app/api/push/test', { method: 'POST' });
      const json = await res.json();
      setMsg(json.ok
        ? { ok: true, text: 'Sent. It should appear within a few seconds.' }
        : { ok: false, text: json.error ?? 'The test could not be sent.' });
    } catch {
      setMsg({ ok: false, text: 'The test could not be sent.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sec-hd">
        <h2>Notifications on this computer</h2>
        {state === 'on' ? <span className="chip ok">On</span> : null}
        {state === 'off' ? <span className="chip off">Off</span> : null}
        {state === 'blocked' ? <span className="chip warn">Blocked by the browser</span> : null}
        <span className="sp" />
        {state === 'on' ? (
          <>
            <button type="button" className="btn b-gh b-sm" disabled={busy} onClick={test}>
              Send a test
            </button>
            <button type="button" className="btn b-gh b-sm" disabled={busy} onClick={disable}>
              Turn off
            </button>
          </>
        ) : state === 'off' ? (
          <button type="button" className="btn b-red b-sm" disabled={busy || !configured} onClick={enable}>
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        ) : null}
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      {!configured ? (
        <div className="note">
          <span>⚑</span>
          <span>
            <b>Push is not set up on the server.</b> The VAPID keys are missing — set
            <code> VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> and
            <code> VAPID_SUBJECT</code> in Vercel, then redeploy. Email alerts work regardless.
          </span>
        </div>
      ) : state === 'unsupported' ? (
        <div className="note">
          <span>⚑</span>
          <span>
            <b>This browser cannot receive alerts.</b> Chrome, Edge and Firefox can. Safari on
            macOS needs the site added to the Dock first.
          </span>
        </div>
      ) : state === 'blocked' ? (
        <div className="note">
          <span>⚑</span>
          <span>
            <b>You have blocked notifications for this site.</b> No button here can undo that —
            the browser keeps the decision. Click the padlock in the address bar, allow
            notifications, then reload this page.
          </span>
        </div>
      ) : (
        <div className="note">
          <span>🔔</span>
          <span>
            Orders, payments and enquiries buzz here as they happen — the same events the email
            alerts cover, governed by the same switches in Settings. This works in an ordinary
            browser tab on a computer; only iPhone and iPad need the app installed first.
          </span>
        </div>
      )}

      {devices.length ? (
        <div className="devices" style={{ marginTop: '1rem' }}>
          {devices.map((d) => (
            <div className="device" key={d.id}>
              <div className="dev-main">
                <div className="dev-t">
                  {d.label}
                  {d.disabledReason ? <span className="chip warn">Silent</span> : null}
                </div>
                <div className="sub dev-meta">
                  Added {d.added} · last alert {d.lastPush}
                  {d.disabledReason ? ` · ${d.disabledReason}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * Any push subscription this browser already holds for the site.
 *
 * Two service workers can be registered here: the phone app's, scoped to
 * /app/, and the root one this screen installs. They are separate
 * registrations with separate subscriptions, so subscribing again when one
 * already exists would register the same machine twice and every alert would
 * arrive twice.
 *
 * Checked in scope order — root first, then /app/ — and the first one found
 * wins. Nothing is registered by this function: getRegistration only reports
 * what is already there.
 */
async function existingSubscription(): Promise<PushSubscription | null> {
  for (const scope of ['/', '/app/']) {
    try {
      const reg = await navigator.serviceWorker.getRegistration(scope);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) return sub;
    } catch {
      /* A scope that cannot be read is simply not the one holding it. */
    }
  }
  return null;
}

/**
 * The VAPID public key arrives base64url-encoded; subscribe() wants bytes.
 * Padding has to be restored first — the browser rejects the key otherwise,
 * with an error that says nothing about why.
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
