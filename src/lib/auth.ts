import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import argon2 from 'argon2';
import { prisma } from './prisma';
import type { Role, SessionClient } from '@prisma/client';

const COOKIE = 'sb_session';
const MAX_FAILED = 5;
const LOCK_MS = 1000 * 60 * 15;

/**
 * Two lifetimes, because the two surfaces have different threat models.
 *
 * WEB is a browser that might be on a borrowed laptop, so it forgets you after
 * twelve hours. APP is the dashboard installed on Samir's own phone, which is
 * already behind the phone's lock screen and, once a passkey is enrolled,
 * behind Face ID as well. Expiring that every twelve hours would not make it
 * safer — it would train him to retype his password on a device several times
 * a day, which is strictly worse. It is held for thirty days and can be
 * revoked instantly per device from the Account screen.
 */
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours — browser
const APP_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — installed phone app

export const ttlFor = (client: SessionClient) => (client === 'APP' ? APP_TTL_MS : TTL_MS);

/** Touch lastSeenAt at most this often, so reading a page is not a write. */
const SEEN_INTERVAL_MS = 1000 * 60;

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
export async function signIn(
  email: string,
  password: string,
  ip?: string,
  ua?: string,
  totpToken?: string,
  /** WEB from the desktop dashboard, APP from the installed phone dashboard. */
  client: SessionClient = 'BROWSER',
  /** Device name for the Account screen, e.g. "iPhone". */
  label?: string,
) {
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

  await openSession(user.id, { client, label, ip, ua });
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip ?? null },
  });

  return { ok: true as const, user };
}

/**
 * Mint a session and set the cookie.
 *
 * Pulled out of signIn because a passkey login reaches the same finish line by
 * a different route: Face ID proves possession of a private key instead of
 * knowledge of a password, but the session it produces must be identical in
 * every other respect. One implementation means the passkey path cannot
 * accidentally get a weaker cookie or a longer life than the password path.
 *
 * The raw token is returned for callers that need it; nothing stores it.
 */
export async function openSession(
  userId: string,
  opts: { client: SessionClient; label?: string; ip?: string; ua?: string },
) {
  const raw = randomBytes(32).toString('base64url');
  const ttl = ttlFor(opts.client);

  await prisma.session.create({
    data: {
      userId,
      token: sha256(raw),
      // Stated rather than left to the column default, so the door this token
      // belongs to is visible at the place it is issued. Every session minted
      // by THIS module is an admin one; the artist portal has its own opener
      // in src/lib/account.ts and stamps ACCOUNT.
      kind: 'ADMIN',
      client: opts.client,
      label: opts.label ?? null,
      ip: opts.ip ?? null,
      userAgent: opts.ua ?? null,
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + ttl),
    },
  });

  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttl / 1000,
  });

  return raw;
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  // Revoked rather than deleted, for the same reason revokeSession stamps:
  // "this device signed out at 4pm" is worth keeping, and the row is refused
  // from that moment on either way.
  if (raw) {
    await prisma.session.updateMany({
      where: { token: sha256(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE);
}

export type AdminUser = { id: string; email: string; name: string | null; role: Role };

export async function currentAdmin(): Promise<AdminUser | null> {
  return (await currentSession())?.user ?? null;
}

/**
 * The session behind the current request, with its device.
 *
 * The phone dashboard needs to know which session it is running as, so the
 * Account screen can show "this device" next to the right row and refuse to
 * let you revoke the session you are holding without warning.
 */
export async function currentSession() {
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

  /* Throttled so a page load is a read, not a write. Failures are swallowed:
     a lost heartbeat must never sign anybody out. */
  // Nullable on the model: a session that has never been used has no last-seen
  // time, and that reads as "due a touch" rather than as an error.
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > SEEN_INTERVAL_MS) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return { id: session.id, client: session.client, label: session.label, user: session.user };
}

/** Every device currently signed in, newest first. Shown on Account. */
export async function listSessions(userId: string) {
  return prisma.session.findMany({
    // `kind: 'ADMIN'` matters as much as the expiry: the artist portal issues
    // sessions against this same table, and without it Samir's security screen
    // would list his own customers' devices alongside his.
    where: { userId, kind: 'ADMIN', revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, client: true, label: true, ip: true, userAgent: true,
              lastSeenAt: true, createdAt: true, expiresAt: true },
  });
}

/**
 * Sign one device out.
 *
 * Scoped to the owner's own sessions by the where clause rather than by a
 * check beforehand, so a guessed session id from another account deletes
 * nothing instead of deleting somebody else's session.
 */
export async function revokeSession(userId: string, sessionId: string) {
  /* Stamped, not deleted — main's convention, and the better one: signing a
     device out leaves a trace, and a revoked row is refused exactly like an
     expired one by currentAdmin(). Scoped by userId AND kind so a guessed id
     from another account, or from the artist portal, touches nothing. */
  const { count } = await prisma.session.updateMany({
    where: { id: sessionId, userId, kind: 'ADMIN', revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
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
