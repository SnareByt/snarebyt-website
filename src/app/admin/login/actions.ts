'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { signIn, hashPassword } from '@/lib/prisma-safe-auth';
import { rateLimit } from '@/lib/audit';
import { passwordSchema } from '@/lib/validators';

export type LoginState = {
  error?: string;
  /** Password was right, but a 2FA code is still required. */
  needsTotp?: boolean;
  email?: string;
  attempt: number;
};

export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const totp = String(formData.get('totp') ?? '').trim();

  // Per-IP limit on top of the per-account lockout, so one attacker cannot
  // work through a list of accounts from a single machine.
  const limited = await rateLimit(`login:ip:${ip}`, 10, 10 * 60_000);
  if (!limited.ok) return { attempt, email, error: 'Too many attempts from this connection. Wait ten minutes.' };

  const res = await signIn(email, password, ip, h.get('user-agent') ?? undefined, totp || undefined);

  if (!res.ok) {
    if ('needsTotp' in res && res.needsTotp) {
      return { attempt, email, needsTotp: true };
    }
    return { attempt, email, error: res.error };
  }

  redirect('/admin');
}

export type SetupState = { error?: string; attempt: number };

/**
 * First run only.
 *
 * This is reachable exclusively while the admin account has no password hash
 * at all. Once one exists the action refuses, so it can never be used to
 * overwrite a live password — changing it afterwards requires being signed in.
 */
export async function createFirstPassword(prev: SetupState, formData: FormData): Promise<SetupState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const limited = await rateLimit(`setup:ip:${ip}`, 5, 30 * 60_000);
  if (!limited.ok) return { attempt, error: 'Too many attempts. Wait half an hour.' };

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, passwordHash: true },
  });
  if (!admin) return { attempt, error: 'No admin account exists. Run the seed first.' };
  if (admin.passwordHash) return { attempt, error: 'A password is already set. Sign in instead.' };

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) return { attempt, error: 'The two passwords do not match.' };

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { attempt, error: parsed.error.issues[0]?.message ?? 'That password is too weak.' };

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null },
  });

  redirect('/admin/login?created=1');
}
