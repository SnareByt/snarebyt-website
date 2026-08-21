'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  requireAdmin, currentSession, signOut, listSessions, revokeSession,
} from '@/lib/prisma-safe-auth';
import {
  startPasskeyRegistration, finishPasskeyRegistration, listPasskeys, removePasskey,
} from '@/lib/passkey';
import { audit } from '@/lib/audit';
import { deviceLabel } from '@/lib/app-format';

/**
 * Account and security, from the phone.
 *
 * Everything here is scoped to the signed-in admin's OWN credentials and
 * sessions — never to an id supplied by the caller. `requireAdmin()` returns
 * who the session says you are, and that id is what every query below filters
 * on, so a guessed passkey or session id from another account touches nothing
 * rather than touching somebody else's.
 */

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/* ============================================================
   Face ID
   ============================================================ */

/**
 * Begin enrolling this device's biometric.
 *
 * Requires an existing signed-in session by design: registering a passkey is
 * how you make future sign-ins easier, not a way to get in. Someone who has
 * not proved who they are cannot attach a new key to the account.
 */
export async function beginPasskey() {
  const user = await requireAdmin();
  const options = await startPasskeyRegistration(user);
  return { ok: true as const, options };
}

export async function finishPasskey(
  response: RegistrationResponseJSON,
  label?: string,
): Promise<Result> {
  const user = await requireAdmin();
  const ua = (await headers()).get('user-agent') ?? '';

  const res = await finishPasskeyRegistration(
    user.id,
    response,
    label?.trim() || deviceLabel(ua),
  );
  if (!res.ok) return { ok: false, error: res.error };

  await audit({
    actorId: user.id, action: 'passkey.added', entity: 'User', entityId: user.id,
    diff: { label: res.label },
  });

  revalidatePath('/app/account/security');
  return { ok: true, message: `Face ID set up for ${res.label}.` };
}

export async function dropPasskey(id: string): Promise<Result> {
  const user = await requireAdmin();

  /**
   * Removing the last passkey is allowed.
   *
   * It looks like a footgun and is not: the password plus TOTP path always
   * works, so this cannot lock anyone out. Refusing would be worse — losing a
   * phone and being unable to revoke the key on it is the actual danger.
   */
  const gone = await removePasskey(user.id, id);
  if (!gone) return { ok: false, error: 'That passkey is already gone.' };

  await audit({ actorId: user.id, action: 'passkey.removed', entity: 'User', entityId: user.id });
  revalidatePath('/app/account/security');
  return { ok: true, message: 'Passkey removed. That device can no longer unlock with Face ID.' };
}

export async function myPasskeys() {
  const user = await requireAdmin();
  return listPasskeys(user.id);
}

/* ============================================================
   Sessions
   ============================================================ */

export async function mySessions() {
  const user = await requireAdmin();
  const [sessions, here] = await Promise.all([listSessions(user.id), currentSession()]);
  // Marking the current row matters: without it the only way to find out which
  // line is the phone in your hand is to revoke one and see if you get logged
  // out — which is exactly the mistake this prevents.
  return sessions.map((s) => ({ ...s, current: s.id === here?.id }));
}

export async function dropSession(sessionId: string): Promise<Result> {
  const user = await requireAdmin();

  const here = await currentSession();
  if (here?.id === sessionId) {
    return {
      ok: false,
      error: 'That is this device. Use Sign out instead — it does the same thing and takes you back to the login screen.',
    };
  }

  const gone = await revokeSession(user.id, sessionId);
  if (!gone) return { ok: false, error: 'That device is already signed out.' };

  await audit({
    actorId: user.id, action: 'session.revoked', entity: 'User', entityId: user.id,
    diff: { sessionId },
  });
  revalidatePath('/app/account/security');
  return { ok: true, message: 'That device is signed out.' };
}

/** Sign out of this device only. */
export async function appSignOut() {
  await signOut();
}
