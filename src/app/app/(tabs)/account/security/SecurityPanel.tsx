'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { beginPasskey, finishPasskey, dropPasskey, dropSession } from '@/app/app/account/actions';
import { useToast, useConfirm } from '@/components/app/Ui';
import { IcFaceId, IcCheck, IcWarn } from '@/components/app/Icons';

type Passkey = { id: string; label: string; added: string; lastUsed: string };
type Session = {
  id: string; label: string; kind: string; ip: string;
  lastSeen: string; expires: string; current: boolean;
};

export function SecurityPanel({
  email, twoFactorEnabled, lastLogin, lastLoginIp, passkeys, sessions,
}: {
  email: string;
  twoFactorEnabled: boolean;
  lastLogin: string;
  lastLoginIp: string;
  passkeys: Passkey[];
  sessions: Session[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setBusy(true);
    try {
      const start = await beginPasskey();
      // Raises the Face ID sheet. Throws if the user cancels.
      const attestation = await startRegistration({ optionsJSON: start.options });
      const res = await finishPasskey(attestation);
      if (!res.ok) { toast(res.error, 'bad'); return; }
      toast(res.message ?? 'Face ID set up.');
      router.refresh();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      // A cancelled prompt is a choice, not a failure worth shouting about.
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      if (name === 'InvalidStateError') {
        toast('This device already has a passkey on this account.', 'bad');
        return;
      }
      toast('This device cannot set up Face ID. Add the app to your Home Screen first.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>Security</h2>
        <p>{email}</p>
      </div>

      <div className="wrap stack-lg">
        {/* ---------- Face ID ---------- */}
        <div>
          <div className="sec"><h3>Face ID</h3></div>
          <div className="list">
            {passkeys.map((p) => (
              <div key={p.id} className="row">
                <span className="thumb" style={{ width: 38, height: 38, color: 'var(--ok)' }} aria-hidden="true">
                  <IcFaceId className="ic-sm" />
                </span>
                <div className="row-main">
                  <div className="row-t">{p.label}</div>
                  <div className="row-s">Added {p.added} · {p.lastUsed}</div>
                </div>
                <button
                  type="button"
                  className="btn danger btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await confirm(
                      `Remove ${p.label}?`,
                      'That device can no longer unlock with Face ID. Your password and authenticator code still work, so this cannot lock you out.',
                      'Remove',
                    );
                    if (!ok) return;
                    setBusy(true);
                    try {
                      const res = await dropPasskey(p.id);
                      if (!res.ok) { toast(res.error, 'bad'); return; }
                      toast(res.message ?? 'Removed.');
                      router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {passkeys.length === 0 && (
              <div className="empty">No device is set up for Face ID yet.</div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-full"
            style={{ marginTop: '.7rem' }}
            disabled={busy}
            onClick={addPasskey}
          >
            <IcFaceId className="ic-sm" />
            Set up Face ID on this phone
          </button>

          <p className="hint" style={{ padding: '.6rem .3rem 0' }}>
            The private key lives in this phone&rsquo;s Secure Enclave and never leaves it.
            Only the public key is stored on the server, so a database dump yields nothing
            that can sign a login.
          </p>
        </div>

        {/* ---------- Two-factor ---------- */}
        <div>
          <div className="sec"><h3>Two-factor</h3></div>
          <div className={`note ${twoFactorEnabled ? 'ok' : 'warn'}`}>
            {twoFactorEnabled ? (
              <>
                <b><IcCheck className="ic-sm" /> Authenticator codes are on.</b>
                <br />
                A password alone will not open a session. Face ID counts as its own second
                factor — it proves the device and a biometric, both in hardware — so it does
                not ask for a code as well.
              </>
            ) : (
              <>
                <b><IcWarn className="ic-sm" /> Authenticator codes are off.</b>
                <br />
                Turn them on from the desktop dashboard — it needs a QR code, which is
                awkward to scan with the phone that is displaying it.
              </>
            )}
          </div>
        </div>

        {/* ---------- Signed-in devices ---------- */}
        <div>
          <div className="sec"><h3>Signed in</h3></div>
          <div className="list">
            {sessions.map((s) => (
              <div key={s.id} className="row">
                <div className="row-main">
                  <div className="row-t">
                    {s.label}
                    {s.current && <span className="chip ok" style={{ marginLeft: '.4rem' }}>this phone</span>}
                  </div>
                  <div className="row-s">
                    {s.kind === 'APP' ? 'Installed app' : 'Browser'} · {s.ip}
                  </div>
                  <div className="row-s dim">
                    Active {s.lastSeen} · expires {s.expires}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="btn danger btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm(
                        `Sign out ${s.label}?`,
                        'That device is signed out immediately and has to log in again. Do this if you no longer recognise it.',
                        'Sign it out',
                      );
                      if (!ok) return;
                      setBusy(true);
                      try {
                        const res = await dropSession(s.id);
                        if (!res.ok) { toast(res.error, 'bad'); return; }
                        toast(res.message ?? 'Signed out.');
                        router.refresh();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Only the SHA-256 of each session token is stored, so a database dump cannot be
            replayed as a live session. If a device here is not yours, sign it out and
            change your password from the desktop.
          </p>
        </div>

        {/* ---------- Last login ---------- */}
        <div>
          <div className="sec"><h3>Last sign-in</h3></div>
          <div className="list">
            <div className="row">
              <div className="row-main">
                <div className="row-s" style={{ marginTop: 0 }}>When</div>
                <div className="row-t">{lastLogin}</div>
              </div>
            </div>
            <div className="row">
              <div className="row-main">
                <div className="row-s" style={{ marginTop: 0 }}>From</div>
                <div className="row-t mono">{lastLoginIp}</div>
              </div>
            </div>
          </div>
        </div>

        <p className="note">
          There is no public sign-up on this site and no second admin account. Five wrong
          passwords locks this account for fifteen minutes, and every sign-in is written to
          the audit log.
        </p>
      </div>

      {confirmNode}
    </>
  );
}
