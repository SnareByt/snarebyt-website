'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import argon2 from 'argon2';
import { prisma } from '@/lib/prisma';
import {
  requireAccount, hashPassword, revokeDevice, revokeOtherDevices, currentSessionId,
} from '@/lib/account';
import { passwordProblems, isObviousPassword } from '@/lib/account-rules';
import { sendPasswordChanged } from '@/lib/account-mail';

/**
 * Settings actions.
 *
 * Every one of these begins with requireAccount() and then scopes its write by
 * that id. None of them accepts a user id from the caller — the only account
 * these can touch is the one holding the cookie.
 */

export type Result = { ok: true; message: string } | { ok: false; error: string };

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you').max(120),
  artistName: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  country: z.string().trim().max(80).default(''),
});

export async function saveProfile(_prev: Result | null, fd: FormData): Promise<Result> {
  const me = await requireAccount();

  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  // Email is deliberately not editable here. Changing the address on an
  // account is a verification flow of its own — silently swapping it would
  // move every past order and licence to an address nobody has proven.
  await prisma.user.update({
    where: { id: me.id },
    data: {
      name: parsed.data.name,
      artistName: parsed.data.artistName || null,
      phone: parsed.data.phone || null,
      country: parsed.data.country || null,
    },
  });

  revalidatePath('/account/settings');
  revalidatePath('/account');
  return { ok: true, message: 'Saved.' };
}

export async function changePassword(_prev: Result | null, fd: FormData): Promise<Result> {
  const me = await requireAccount();

  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('next') ?? '');

  const user = await prisma.user.findUnique({
    where: { id: me.id }, select: { passwordHash: true, email: true },
  });
  if (!user?.passwordHash) return { ok: false, error: 'This account has no password set.' };

  // The current password is required even though they are already signed in.
  // A session left open on a shared machine should not be enough to lock the
  // real owner out of their own account.
  const valid = await argon2.verify(user.passwordHash, current).catch(() => false);
  if (!valid) return { ok: false, error: 'That is not your current password.' };

  const problems = passwordProblems(next);
  if (problems.length) return { ok: false, error: problems.join(' · ') };
  if (isObviousPassword(next)) {
    return { ok: false, error: 'That is one of the most-guessed passwords there is. Pick something else.' };
  }
  if (next === current) return { ok: false, error: 'That is the password you already have.' };

  const keep = await currentSessionId();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(next), failedLogins: 0, lockedUntil: null },
    }),
    // Everything except the device doing the changing. If the reason for the
    // change is that someone else had the password, leaving their session
    // alive makes the whole exercise pointless.
    prisma.session.updateMany({
      where: { userId: me.id, kind: 'ACCOUNT', revokedAt: null, id: keep ? { not: keep } : undefined },
      data: { revokedAt: new Date() },
    }),
  ]);

  // Sent whether or not it was expected. This is the message that lets someone
  // notice a takeover, so a legitimate change gets one too.
  void sendPasswordChanged(user.email);

  revalidatePath('/account/settings');
  return { ok: true, message: 'Password changed. Every other device has been signed out.' };
}

export async function signOutDevice(sessionId: string): Promise<Result> {
  const me = await requireAccount();
  const res = await revokeDevice(me.id, sessionId);
  revalidatePath('/account/settings');
  return res.ok ? { ok: true, message: 'That device has been signed out.' } : { ok: false, error: res.error };
}

export async function signOutEverywhere(): Promise<Result> {
  const me = await requireAccount();
  const res = await revokeOtherDevices(me.id);
  revalidatePath('/account/settings');
  return {
    ok: true,
    message: res.count
      ? `Signed out ${res.count} other ${res.count === 1 ? 'device' : 'devices'}.`
      : 'No other devices were signed in.',
  };
}
