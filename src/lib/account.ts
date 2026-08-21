import 'server-only';
import { cookies, headers } from 'next/headers';
import { randomBytes, randomInt, createHash } from 'crypto';
import argon2 from 'argon2';
import { prisma } from './prisma';
import { rateLimit } from './audit';
import { sessionVerdict, otpVerdict } from './account-rules';

/**
 * Artist account authentication.
 *
 * Deliberately a separate module from lib/auth.ts even though both sit on the
 * same User table, because they are different trust domains and sharing one
 * code path is how a customer ends up holding an admin session.
 *
 * What keeps them apart:
 *   - different cookie names, so neither can be presented at the other's door;
 *   - Session.kind, checked on every read, so a token minted for the portal is
 *     refused by the dashboard even if it is copied into the admin cookie;
 *   - a role check on top of that, so neither lock is load-bearing alone.
 *
 * Everything else follows the same rules the admin side already uses: only the
 * SHA-256 of a session token is stored, failures are counted and lock the
 * account, and no message ever distinguishes "no such user" from "wrong
 * password" — otherwise the sign-in form becomes an email-enumeration oracle.
 */

const COOKIE = 'sb_account';
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — a customer portal, not a bank
const MAX_FAILED = 5;
const LOCK_MS = 1000 * 60 * 15;

const OTP_TTL_MS = 1000 * 60 * 10; // ten minutes
const RESET_TTL_MS = 1000 * 60 * 30;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Argon2id, same parameters as the admin side. */
export const hashPassword = (pw: string) =>
  argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * An OTP is stored as a hash of userId + code, never the code itself.
 *
 * The userId is in the hash for two reasons: Token.hash is unique, and six
 * digits across a busy hour would eventually collide; and it means a code is
 * only ever valid for the account it was issued to, so guessing "000000"
 * against a known email cannot accidentally match somebody else's live token.
 */
const otpHash = (userId: string, code: string) => sha256(`otp:${userId}:${code}`);

/** Six digits, from a CSPRNG. Math.random() is not acceptable for a credential. */
const newOtpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export type AccountUser = {
  id: string;
  email: string;
  name: string | null;
  artistName: string | null;
  phone: string | null;
  country: string | null;
  emailVerified: Date | null;
  suspendedAt: Date | null;
};

const SELECT = {
  id: true, email: true, name: true, artistName: true,
  phone: true, country: true, emailVerified: true, suspendedAt: true,
} as const;

/* ------------------------------------------------------------------ *
 *  Sessions
 * ------------------------------------------------------------------ */

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    ua: h.get('user-agent')?.slice(0, 400) ?? null,
  };
}

async function startSession(userId: string) {
  const { ip, ua } = await clientMeta();
  const raw = randomBytes(32).toString('base64url');

  await prisma.session.create({
    data: {
      userId,
      kind: 'ACCOUNT',
      token: sha256(raw),
      ip,
      userAgent: ua,
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

/**
 * The signed-in artist, or null.
 *
 * Every condition here is a reason to refuse: wrong session kind, revoked,
 * expired, idle too long, suspended, or not a CUSTOMER row. A suspended
 * account is refused at this level rather than page by page, so there is no
 * route that can forget to check it.
 */
export async function currentAccount(): Promise<AccountUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { token: sha256(raw) },
    include: { user: { select: { ...SELECT, role: true } } },
  });

  if (!session) return null;

  const idleSince = session.lastSeenAt ?? session.createdAt;
  const verdict = sessionVerdict({
    kind: session.kind,
    role: session.user.role,
    revokedAt: session.revokedAt,
    expiresAt: session.expiresAt,
    lastSeenAt: idleSince,
    suspendedAt: session.user.suspendedAt,
  });
  if (!verdict.ok) return null;

  // Touch at most once every few minutes: this runs on every request, and a
  // write per page view would be a database round trip nobody asked for.
  if (Date.now() - idleSince.getTime() > 5 * 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});
  }

  const { role: _role, ...user } = session.user;
  return user;
}

export async function requireAccount(): Promise<AccountUser> {
  const user = await currentAccount();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/**
 * The id of the current session, so "this device" can be labelled in the
 * device list and cannot be signed out from under itself by accident.
 */
export async function currentSessionId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const s = await prisma.session.findUnique({
    where: { token: sha256(raw) }, select: { id: true, kind: true },
  });
  return s && s.kind === 'ACCOUNT' ? s.id : null;
}

export async function signOutAccount() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    await prisma.session.updateMany({
      where: { token: sha256(raw) },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE);
}

/* ------------------------------------------------------------------ *
 *  Registration and verification
 * ------------------------------------------------------------------ */

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create an account, or quietly re-issue a code for one that already exists
 * but was never verified.
 *
 * Registering an email that already has a verified account does NOT say so.
 * It returns the same "check your email" outcome as a new registration and
 * sends nothing, because a register form that distinguishes the two is a
 * membership oracle — anyone could test whether a given artist has an account
 * here. The person who owns that address can already sign in or reset.
 */
export async function registerAccount(input: {
  email: string;
  password: string;
  name: string;
  artistName?: string;
  phone?: string;
  country?: string;
}): Promise<{ ok: true; pending: true; userId: string | null } | { ok: false; error: string; field?: string }> {
  const email = input.email.toLowerCase().trim();
  const { ip } = await clientMeta();

  const limit = await rateLimit(`register:${ip ?? 'unknown'}`, 6, 60 * 60_000);
  if (!limit.ok) return { ok: false, error: 'Too many attempts from this connection. Try again in an hour.' };

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, emailVerified: true, suspendedAt: true },
  });

  if (existing) {
    // An address that belongs to the dashboard is never turned into a customer
    // account, and a verified account is not disclosed.
    if (existing.role !== 'CUSTOMER' || existing.emailVerified || existing.suspendedAt) {
      return { ok: true, pending: true, userId: null };
    }
    // Unverified: it is not yet proven that anyone owns this address, so the
    // details are updated and a fresh code sent. Nothing is disclosed either
    // way, and an abandoned half-registration does not block the real owner.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await hashPassword(input.password),
        name: input.name.trim(),
        artistName: input.artistName?.trim() || null,
        phone: input.phone?.trim() || null,
        country: input.country?.trim() || null,
      },
    });
    return { ok: true, pending: true, userId: existing.id };
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      name: input.name.trim(),
      artistName: input.artistName?.trim() || null,
      phone: input.phone?.trim() || null,
      country: input.country?.trim() || null,
      role: 'CUSTOMER',
    },
    select: { id: true },
  });

  return { ok: true, pending: true, userId: user.id };
}

/**
 * Mint a one-time code and return it to the caller to email.
 *
 * The code is returned rather than sent from here so this module stays free of
 * transport concerns and can be tested without a mail provider. Any previous
 * unused code for the account is burned first — two live codes doubles the
 * guessing surface for no benefit.
 */
export async function issueOtp(userId: string): Promise<
  { ok: true; code: string; expiresAt: Date } | { ok: false; error: string }
> {
  const limit = await rateLimit(`otp:issue:${userId}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return { ok: false, error: 'Too many codes requested. Wait fifteen minutes and try again.' };
  }

  await prisma.token.deleteMany({ where: { userId, kind: 'EMAIL_OTP' } });

  const code = newOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.token.create({
    data: { userId, kind: 'EMAIL_OTP', hash: otpHash(userId, code), expiresAt },
  });

  return { ok: true, code, expiresAt };
}

/**
 * Check a code, and on success verify the address, attach any guest history
 * and open a session.
 *
 * The order matters: verification must happen before the history is attached,
 * because attaching orders is the moment this account gains access to somebody
 * else's receipts and licences if the address was never proven.
 */
export async function verifyOtp(userId: string, code: string): Promise<AuthResult> {
  const { ip } = await clientMeta();
  const limit = await rateLimit(`otp:verify:${ip ?? 'unknown'}`, 20, 15 * 60_000);
  if (!limit.ok) return { ok: false, error: 'Too many attempts. Wait fifteen minutes and try again.' };

  const clean = code.replace(/\D/g, '');
  const token = await prisma.token.findFirst({
    where: { userId, kind: 'EMAIL_OTP' },
  });

  const generic = { ok: false as const, error: 'That code is not right, or it has expired. Request a new one.' };
  if (!token) return generic;

  const verdict = otpVerdict({
    usedAt: token.usedAt,
    expiresAt: token.expiresAt,
    attempts: token.attempts,
    storedHash: token.hash,
    presentedHash: otpHash(userId, clean),
  });

  if (!verdict.ok) {
    if (verdict.burn) {
      await prisma.token.deleteMany({ where: { id: token.id } });
    } else {
      // Compare-and-set, so parallel guesses cannot each read the same count
      // and collectively spend only one attempt.
      await prisma.token.updateMany({
        where: { id: token.id, attempts: token.attempts },
        data: { attempts: { increment: 1 } },
      });
    }
    return verdict.reason === 'locked'
      ? { ok: false, error: 'Too many wrong codes. Request a new one.' }
      : generic;
  }

  await prisma.token.deleteMany({ where: { id: token.id } });

  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { id: true, email: true, role: true, suspendedAt: true, emailVerified: true },
  });
  if (!user || user.role !== 'CUSTOMER') return generic;
  if (user.suspendedAt) return { ok: false, error: 'This account is suspended. Contact SnareByt.' };

  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    await attachGuestHistory(user.id, user.email);

    /* Tell Samir a real artist account now exists.
     *
     * HERE, on verification, and deliberately not at registration. An
     * unverified row proves only that somebody typed an address — it may not
     * even be theirs. Alerting on that would hand anyone a button that makes
     * his phone buzz as fast as they can submit a form, which is the exact
     * spam vector this OTP step exists to close.
     *
     * Fire-and-forget, and imported here rather than at the top of the file:
     * notify pulls in the mail and push clients, and none of that belongs in
     * the module that decides whether a sign-in succeeds. An alert must never
     * be able to fail a verification. */
    void (async () => {
      try {
        const { notifyAdmin } = await import('./notify');
        const full = await prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true, artistName: true, country: true, phone: true, createdAt: true },
        });
        await notifyAdmin({
          event: 'account.created',
          subject: `New artist account — ${full?.name ?? user.email}`,
          title: 'Artist account verified',
          rows: [
            ['Name', full?.name ?? '—'],
            ['Email', user.email],
            ...(full?.artistName ? [['Artist name', full.artistName] as [string, string]] : []),
            ...(full?.country ? [['Country', full.country] as [string, string]] : []),
            ...(full?.phone ? [['WhatsApp', full.phone] as [string, string]] : []),
          ],
          appUrl: '/app/customers',
        });
      } catch {
        /* An account that verified is worth more than an alert about it. */
      }
    })();
  }

  await startSession(user.id);
  return { ok: true, userId: user.id };
}

/**
 * Adopt orders and projects placed as a guest with this address.
 *
 * Only ever called after the address has been proven by a code sent to it.
 * Before verification this would hand a stranger's receipts, licences and
 * download links to anyone willing to type someone else's email into the
 * register form.
 *
 * Rows that already belong to a user are left alone — `userId: null` in the
 * filter is the whole safety property, because it means this can only ever
 * claim history that is currently unclaimed.
 */
export async function attachGuestHistory(userId: string, email: string) {
  const addr = email.toLowerCase().trim();

  const [orders, projects] = await prisma.$transaction([
    prisma.order.updateMany({
      where: {
        userId: null,
        OR: [
          { billingEmail: { equals: addr, mode: 'insensitive' } },
          { guestEmail: { equals: addr, mode: 'insensitive' } },
        ],
      },
      data: { userId },
    }),
    prisma.project.updateMany({
      where: { userId: null, email: { equals: addr, mode: 'insensitive' } },
      data: { userId },
    }),
  ]);

  return { orders: orders.count, projects: projects.count };
}

/* ------------------------------------------------------------------ *
 *  Sign in
 * ------------------------------------------------------------------ */

export type SignInResult =
  | { ok: true }
  | { ok: false; needsVerification: true; userId: string }
  | { ok: false; error: string };

export async function signInAccount(email: string, password: string): Promise<SignInResult> {
  const addr = email.toLowerCase().trim();
  const { ip } = await clientMeta();

  const limit = await rateLimit(`login:${ip ?? 'unknown'}`, 20, 15 * 60_000);
  if (!limit.ok) return { ok: false, error: 'Too many sign-in attempts. Try again in fifteen minutes.' };

  const user = await prisma.user.findUnique({ where: { email: addr } });
  const generic = { ok: false as const, error: 'Email or password is incorrect.' };

  if (!user || !user.passwordHash || user.role !== 'CUSTOMER') {
    // Keep the response time flat so a missing account is not detectable by
    // how quickly the form comes back.
    await argon2.hash('decoy-to-equalise-timing');
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
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

  // Suspension is stated plainly. Unlike a wrong password this is not
  // guessable information — they already proved the password — and silently
  // failing would just generate support messages.
  if (user.suspendedAt) {
    return { ok: false, error: 'This account is suspended. Contact SnareByt and it will be sorted.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  });

  if (!user.emailVerified) return { ok: false, needsVerification: true, userId: user.id };

  await startSession(user.id);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 *  Password reset
 * ------------------------------------------------------------------ */

/**
 * Returns the raw token to email, or null when there is nothing to send.
 *
 * The caller must report success either way. "No account with that email" on
 * a reset form is the same membership oracle as on the register form.
 */
export async function issueResetToken(email: string): Promise<{ token: string; userId: string } | null> {
  const addr = email.toLowerCase().trim();
  const { ip } = await clientMeta();

  const limit = await rateLimit(`reset:${ip ?? 'unknown'}`, 6, 60 * 60_000);
  if (!limit.ok) return null;

  const user = await prisma.user.findUnique({
    where: { email: addr }, select: { id: true, role: true, suspendedAt: true },
  });
  if (!user || user.role !== 'CUSTOMER' || user.suspendedAt) return null;

  await prisma.token.deleteMany({ where: { userId: user.id, kind: 'PASSWORD_RESET' } });

  const raw = randomBytes(32).toString('base64url');
  await prisma.token.create({
    data: {
      userId: user.id,
      kind: 'PASSWORD_RESET',
      hash: sha256(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  return { token: raw, userId: user.id };
}

/**
 * Complete a reset.
 *
 * Every other session is revoked. If the reason for the reset was that someone
 * else had the password, leaving their session alive makes the whole exercise
 * pointless.
 */
export async function completeReset(rawToken: string, newPassword: string): Promise<AuthResult> {
  const token = await prisma.token.findUnique({
    where: { hash: sha256(rawToken) },
    include: { user: { select: { id: true, role: true, suspendedAt: true, emailVerified: true, email: true } } },
  });

  const dead = { ok: false as const, error: 'This reset link has expired or has already been used. Request another.' };
  if (!token || !token.user) return dead;
  if (token.kind !== 'PASSWORD_RESET') return dead;
  if (token.usedAt || token.expiresAt < new Date()) return dead;
  if (token.user.role !== 'CUSTOMER') return dead;
  if (token.user.suspendedAt) return { ok: false, error: 'This account is suspended. Contact SnareByt.' };

  const user = token.user;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        failedLogins: 0,
        lockedUntil: null,
        // Reaching the inbox proves the address as surely as a code does.
        emailVerified: user.emailVerified ?? new Date(),
      },
    }),
    prisma.token.deleteMany({ where: { id: token.id } }),
    prisma.session.updateMany({
      where: { userId: user.id, kind: 'ACCOUNT', revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  if (!user.emailVerified) await attachGuestHistory(user.id, user.email);

  return { ok: true, userId: user.id };
}

/* ------------------------------------------------------------------ *
 *  Device / session management
 * ------------------------------------------------------------------ */

export type DeviceRow = {
  id: string;
  current: boolean;
  label: string;
  ip: string | null;
  lastSeenAt: Date;
  createdAt: Date;
};

/** A readable device name from the user agent. Best effort, never a promise. */
export function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

export async function listDevices(userId: string): Promise<DeviceRow[]> {
  const current = await currentSessionId();
  const rows = await prisma.session.findMany({
    where: { userId, kind: 'ACCOUNT', revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, lastSeenAt: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    current: r.id === current,
    label: describeAgent(r.userAgent),
    ip: r.ip,
    lastSeenAt: r.lastSeenAt ?? r.createdAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Revoke one session, or every session but this one.
 *
 * Scoped by userId in the where clause rather than looked up by id and then
 * checked, so there is no window in which the wrong row could be touched and
 * no way for a crafted id to reach somebody else's session.
 */
export async function revokeDevice(userId: string, sessionId: string) {
  const current = await currentSessionId();
  if (sessionId === current) return { ok: false as const, error: 'That is the device you are using now. Sign out instead.' };

  const res = await prisma.session.updateMany({
    where: { id: sessionId, userId, kind: 'ACCOUNT', revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count ? { ok: true as const } : { ok: false as const, error: 'That device is already signed out.' };
}

export async function revokeOtherDevices(userId: string) {
  const current = await currentSessionId();
  const res = await prisma.session.updateMany({
    where: { userId, kind: 'ACCOUNT', revokedAt: null, id: current ? { not: current } : undefined },
    data: { revokedAt: new Date() },
  });
  return { ok: true as const, count: res.count };
}
