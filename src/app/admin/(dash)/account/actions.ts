'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  requireAdmin, hashPassword, currentSession, revokeSession,
} from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { passwordSchema } from '@/lib/validators';
import { generateTotpSecret, verifyTotp, otpauthUrl } from '@/lib/totp';
import argon2 from 'argon2';

export type PwState = { ok: boolean; message?: string; error?: string; attempt: number };
export type TotpState = {
  ok: boolean;
  error?: string;
  message?: string;
  secret?: string;
  otpauth?: string;
  qr?: string;
  attempt: number;
};

export async function changePassword(prev: PwState, formData: FormData): Promise<PwState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const admin = await requireAdmin();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });

  // The current password is required even though the session already proves
  // identity: it stops an unattended open dashboard being used to lock the
  // real owner out.
  const valid = user.passwordHash
    ? await argon2.verify(user.passwordHash, current).catch(() => false)
    : false;
  if (!valid) return { ok: false, attempt, error: 'Your current password is not right.' };

  if (next !== confirm) return { ok: false, attempt, error: 'The two new passwords do not match.' };

  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, attempt, error: parsed.error.issues[0]?.message ?? 'Too weak.' };

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(next), failedLogins: 0, lockedUntil: null },
  });

  // Every other session is invalidated. If the password is being changed
  // because it leaked, leaving old sessions alive would defeat the point.
  await prisma.session.deleteMany({ where: { userId: admin.id } });

  await audit({ actorId: admin.id, action: 'account.password', entity: 'User', entityId: admin.id });

  return { ok: true, attempt, message: 'Password changed. Every other device has been signed out — sign in again.' };
}

/** Step one: mint a secret and show it. Nothing is saved until a code proves it works. */
export async function beginTotp(prev: TotpState): Promise<TotpState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const admin = await requireAdmin();

  const secret = generateTotpSecret();
  const url = otpauthUrl(secret, admin.email);

  const QRCode = (await import('qrcode')).default;
  const qr = await QRCode.toString(url, {
    type: 'svg', margin: 1, width: 190,
    color: { dark: '#F4F4F6', light: '#00000000' },
  });

  return { ok: false, attempt, secret, otpauth: url, qr };
}

/** Step two: only a working code turns it on. */
export async function confirmTotp(prev: TotpState, formData: FormData): Promise<TotpState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const admin = await requireAdmin();

  const secret = String(formData.get('secret') ?? '');
  const token = String(formData.get('token') ?? '');
  if (!secret) return { ok: false, attempt, error: 'Start again — the setup secret was lost.' };

  if (!verifyTotp(secret, token)) {
    const QRCode = (await import('qrcode')).default;
    return {
      ok: false, attempt, secret,
      otpauth: otpauthUrl(secret, admin.email),
      qr: await QRCode.toString(otpauthUrl(secret, admin.email), {
        type: 'svg', margin: 1, width: 190, color: { dark: '#F4F4F6', light: '#00000000' },
      }),
      error: 'That code is not valid. Codes change every 30 seconds — try the current one.',
    };
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { totpSecret: secret, twoFactorEnabled: true },
  });
  await audit({ actorId: admin.id, action: 'account.2fa.enable', entity: 'User', entityId: admin.id });
  revalidatePath('/admin/account');

  return { ok: true, attempt, message: 'Two-factor is on. You will need a code every time you sign in.' };
}

/** Turning it off needs a current code, so a borrowed session cannot strip it. */
export async function disableTotp(prev: TotpState, formData: FormData): Promise<TotpState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const admin = await requireAdmin();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  if (!user.twoFactorEnabled || !user.totpSecret) {
    return { ok: false, attempt, error: 'Two-factor is not on.' };
  }
  if (!verifyTotp(user.totpSecret, String(formData.get('token') ?? ''))) {
    return { ok: false, attempt, error: 'Enter a current code to switch it off.' };
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { totpSecret: null, twoFactorEnabled: false },
  });
  await audit({ actorId: admin.id, action: 'account.2fa.disable', entity: 'User', entityId: admin.id });
  revalidatePath('/admin/account');

  return { ok: true, attempt, message: 'Two-factor is off. Your password alone now opens the dashboard.' };
}

export type DeviceResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Sign one device out.
 *
 * revokeSession is scoped to the caller's own ADMIN sessions inside its where
 * clause, so a guessed id belonging to another account — or to a customer in
 * the artist portal — matches nothing rather than signing someone else out.
 */
export async function signOutDevice(sessionId: string): Promise<DeviceResult> {
  const admin = await requireAdmin();

  // Refusing to revoke the session making the request. Doing it would log him
  // out mid-click, which is indistinguishable from being locked out.
  const here = await currentSession();
  if (here?.id === sessionId) {
    return { ok: false, error: 'That is the device you are using. Use Sign out at the bottom of the sidebar instead.' };
  }

  const done = await revokeSession(admin.id, sessionId);
  if (!done) return { ok: false, error: 'That device is already signed out.' };

  await audit({
    actorId: admin.id, action: 'session.revoked', entity: 'Session', entityId: sessionId,
    diff: { by: 'admin device list' },
  });

  revalidatePath('/admin/account');
  return { ok: true, message: 'Signed out. That device needs the password again.' };
}

/**
 * Sign out everything except the device asking.
 *
 * The thing to reach for when a laptop is lost or a phone is sold: one action,
 * and every other session stops working immediately, because currentAdmin()
 * refuses a revoked row exactly as it refuses an expired one.
 */
export async function signOutOtherDevices(): Promise<DeviceResult> {
  const admin = await requireAdmin();
  const here = await currentSession();

  const { count } = await prisma.session.updateMany({
    where: {
      userId: admin.id,
      kind: 'ADMIN',
      revokedAt: null,
      ...(here ? { id: { not: here.id } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await audit({
    actorId: admin.id, action: 'session.revoked.all', entity: 'User', entityId: admin.id,
    diff: { count },
  });

  revalidatePath('/admin/account');
  return {
    ok: true,
    message: count
      ? `Signed out ${count} device${count === 1 ? '' : 's'}. Each needs the password again.`
      : 'Nothing else was signed in.',
  };
}
