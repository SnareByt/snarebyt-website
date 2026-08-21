'use server';

import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { signIn, openSession } from '@/lib/prisma-safe-auth';
import { startPasskeyLogin, finishPasskeyLogin } from '@/lib/passkey';
import { rateLimit, audit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { deviceLabel } from '@/lib/app-format';

/**
 * Sign-in for the phone dashboard.
 *
 * These are thin wrappers, not a second auth system. Password sign-in calls
 * the same `signIn()` the desktop admin uses, so the lockout counter, the TOTP
 * requirement, the timing-flattened decoy hash and the "never say which half
 * was wrong" error message all apply here unchanged. The only difference
 * passed down is `kind: 'APP'`, which buys the longer session described in
 * src/lib/auth.ts.
 */

export type LoginState = {
  ok: boolean;
  error?: string;
  /** The server is asking for the 6-digit code; the form swaps to it. */
  needsTotp?: boolean;
  /** Echoed back so the code step does not make him retype it. */
  email?: string;
  /** Bumped every attempt so the client can react to a repeated same error. */
  attempt: number;
};

const clientIp = async () => {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
};

export async function appLogin(prev: LoginState, formData: FormData): Promise<LoginState> {
  const attempt = prev.attempt + 1;
  const h = await headers();
  const ip = await clientIp();
  const ua = h.get('user-agent') ?? '';

  /**
   * The IP limit is the one the account lockout cannot provide.
   *
   * Lockout protects the account: five wrong passwords and it freezes. But a
   * public login endpoint plus a per-account lockout is also a way to keep
   * Samir permanently locked out of his own dashboard by guessing wrong on
   * purpose. Throttling by IP first means an attacker is stopped before the
   * lockout they are trying to trigger ever fires.
   */
  const limited = await rateLimit(`applogin:ip:${ip}`, 10, 10 * 60_000);
  if (!limited.ok) {
    return { ok: false, attempt, error: 'Too many attempts from this connection. Wait a few minutes.' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const totp = String(formData.get('totp') ?? '').replace(/\D/g, '');

  if (!email || !password) {
    return { ok: false, attempt, email, error: 'Enter your email and password.' };
  }

  const res = await signIn(email, password, ip, ua, totp || undefined, 'APP', deviceLabel(ua));

  if (!res.ok) {
    if ('needsTotp' in res && res.needsTotp) return { ok: false, attempt, email, needsTotp: true };
    // A wrong CODE must keep the user on the code step; a wrong PASSWORD must
    // send them back to the start. `totp` being present is what tells them
    // apart — without this, one mistyped digit drops the whole sign-in.
    return { ok: false, attempt, email, error: res.error, needsTotp: Boolean(totp) };
  }

  await audit({ actorId: res.user.id, action: 'app.login.password', entity: 'User',
    entityId: res.user.id, ip, diff: { device: deviceLabel(ua) } });
  return { ok: true, attempt };
}

/* ============================================================
   Face ID
   ============================================================ */

export type PasskeyChallenge =
  | { ok: true; handle: string; options: PublicKeyCredentialRequestOptionsJSON }
  | { ok: false; error: string };

/**
 * Hand the phone a challenge to sign.
 *
 * Unauthenticated by necessity — this is the login screen. Two things keep it
 * from being useful to anyone else: the challenge is worthless without the
 * private key sealed in a Secure Enclave, and the response is rate limited
 * below. Nothing here reveals whether a passkey exists, or for whom.
 */
export async function beginFaceId(): Promise<PasskeyChallenge> {
  const ip = await clientIp();
  const limited = await rateLimit(`appface:ip:${ip}`, 20, 10 * 60_000);
  if (!limited.ok) return { ok: false, error: 'Too many attempts. Wait a few minutes.' };

  const handle = randomBytes(16).toString('base64url');
  const options = await startPasskeyLogin(handle);
  return { ok: true, handle, options };
}

export async function finishFaceId(
  handle: string,
  response: AuthenticationResponseJSON,
): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  const ip = await clientIp();
  const ua = h.get('user-agent') ?? '';

  const limited = await rateLimit(`appface:ip:${ip}`, 20, 10 * 60_000);
  if (!limited.ok) return { ok: false, error: 'Too many attempts. Wait a few minutes.' };

  const res = await finishPasskeyLogin(handle, response);
  if (!res.ok) return { ok: false, error: res.error };

  /**
   * A passkey satisfies 2FA on its own, and this is a deliberate call worth
   * defending. TOTP exists to prove a second factor beyond a memorised secret.
   * A passkey proves possession of a device AND a biometric on that device,
   * both verified by hardware — `userVerification: 'required'` is enforced at
   * enrolment and again at every assertion, so an unlocked-but-not-verified
   * phone cannot sign. Demanding a typed code on top of that would add
   * friction without adding a factor.
   */
  await openSession(res.userId, { client: 'APP', label: res.label, ip, ua });
  await prisma.user.update({
    where: { id: res.userId },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  });

  await audit({ actorId: res.userId, action: 'app.login.passkey', entity: 'User',
    entityId: res.userId, ip, diff: { device: res.label } });

  return { ok: true };
}
