import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import argon2 from 'argon2';
import { prisma } from './prisma';
import type { Role } from '@prisma/client';

const COOKIE = 'sb_session';
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_FAILED = 5;
const LOCK_MS = 1000 * 60 * 15;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const hashPassword = (pw: string) =>
  argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * Sign in.
 *
 * Deliberate choices:
 * - The raw session token is never stored. Only its SHA-256 goes to
 *   the database, so a leaked database dump cannot be replayed as a
 *   live session.
 * - Failures are counted and the account locks for 15 minutes. This
 *   is the difference between "someone tried" and "someone got in".
 * - The error message never distinguishes "no such user" from "wrong
 *   password", so the login form cannot be used to enumerate emails.
 */
export async function signIn(email: string, password: string, ip?: string, ua?: string, totpToken?: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  const generic = { ok: false as const, error: 'Email or password is incorrect.' };

  if (!user || !user.passwordHash) {
    await argon2.hash('decoy-to-equalise-timing'); // keep response time flat
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false as const, error: 'Too many attempts. Try again in a few minutes.' };
  }

  const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null,
      },
    });
    return generic;
  }
  if (user.role === 'CUSTOMER') {
    return { ok: false as const, error: 'This account has no admin access.' };
  }

  /* 2FA: password alone never opens a session when it is enabled.
     The login action collects the code and passes it through. */
  if (user.twoFactorEnabled) {
    if (!totpToken) return { ok: false as const, needsTotp: true as const, error: '' };
    const { verifyTotp } = await import('./totp');
    if (!user.totpSecret || !verifyTotp(user.totpSecret, totpToken)) {
      return { ok: false as const, error: 'That code is not valid. Codes rotate every 30 seconds.' };
    }
  }

  const raw = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: user.id,
        // Stated rather than left to the column default, so the door this
        // token belongs to is visible at the place it is issued.
        kind: 'ADMIN',
        token: sha256(raw),
        ip: ip ?? null,
        userAgent: ua ?? null,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip ?? null },
    }),
  ]);

  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_MS / 1000,
  });

  return { ok: true as const, user };
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await prisma.session.deleteMany({ where: { token: sha256(raw) } });
  jar.delete(COOKIE);
}

export type AdminUser = { id: string; email: string; name: string | null; role: Role };

export async function currentAdmin(): Promise<AdminUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { token: sha256(raw) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  // Minted at the artist portal, presented here. The role check below already
  // stops a customer, but this stops the case the role check cannot see: a
  // STAFF or ADMIN who also holds a portal session. Both doors now refuse the
  // other's tokens, so neither check is the only thing standing there.
  if (session.kind !== 'ADMIN') return null;
  if (session.revokedAt) return null;
  if (session.user.role === 'CUSTOMER') return null;
  return session.user;
}

/** Use at the top of every admin page and server action. */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await currentAdmin();
  if (!user) throw new Error('UNAUTHORISED');
  return user;
}

/** Destructive actions (refunds, deletes) require full ADMIN, not STAFF. */
export async function requireOwner(): Promise<AdminUser> {
  const user = await requireAdmin();
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
