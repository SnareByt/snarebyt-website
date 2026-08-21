'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DeviceResult } from './actions';

export type DeviceRow = {
  id: string;
  name: string;
  detail: string;
  client: string;
  ip: string | null;
  lastSeen: string;
  signedIn: string;
  expires: string;
  /** The device reading this page. It cannot sign itself out by accident. */
  current: boolean;
};

/**
 * Every device signed in to the admin, and the buttons to remove one.
 *
 * There is no "grant access to a device" step, and there deliberately is not
 * one: access is not held by a device, it is held by whoever can sign in. A
 * new phone or laptop gets in by signing in on it, which creates the session
 * listed here. What matters is the other half — being able to SEE what is
 * signed in and take it away — and that is what this is.
 *
 * The current device is marked and cannot be signed out from this list.
 * Removing the session you are using logs you out mid-click, which looks
 * exactly like being locked out.
 */
export function Devices({
  rows, signOutOne, signOutOthers,
}: {
  rows: DeviceRow[];
  signOutOne: (id: string) => Promise<DeviceResult>;
  signOutOthers: () => Promise<DeviceResult>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (fn: () => Promise<DeviceResult>) => start(async () => {
    const res = await fn();
    setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  });

  const others = rows.filter((r) => !r.current).length;

  return (
    <>
      <div className="sec-hd">
        <h2>Devices signed in</h2>
        <span className="chip">{rows.length}</span>
        <span className="sp" />
        {others > 0 ? (
          confirming ? (
            <>
              <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn b-red b-sm" disabled={busy}
                onClick={() => { setConfirming(false); run(signOutOthers); }}>
                Sign out {others} other{others === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(true)}>
              Sign out everything else
            </button>
          )
        ) : null}
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      <div className="devices">
        {rows.map((d) => (
          <div className={d.current ? 'device is-current' : 'device'} key={d.id}>
            <div className="dev-main">
              <div className="dev-t">
                {d.name}
                {d.current ? <span className="chip ok">This device</span> : null}
                <span className="chip">{d.client === 'APP' ? 'Phone app' : 'Browser'}</span>
              </div>
              <div className="sub">{d.detail}</div>
              <div className="sub dev-meta">
                Last used {d.lastSeen} · signed in {d.signedIn} · expires {d.expires}
                {d.ip ? ` · ${d.ip}` : ''}
              </div>
            </div>
            {d.current ? (
              <span className="sub">in use</span>
            ) : (
              <button type="button" className="btn b-gh b-sm" disabled={busy}
                onClick={() => run(() => signOutOne(d.id))}>
                Sign out
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
