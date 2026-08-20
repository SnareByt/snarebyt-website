/**
 * The decisions that guard an artist account.
 *
 * Pure functions over plain facts — no Prisma, no cookies, no request context —
 * for the same reason src/lib/order-rules.ts is: these are the rules that
 * decide whether a stranger sees somebody's licences, and a rule you cannot
 * run in a test is a rule you are trusting rather than checking.
 *
 * account.ts gathers the facts and applies the verdict. It does not decide.
 */

export type SessionFacts = {
  kind: 'ADMIN' | 'ACCOUNT';
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date;
  suspendedAt: Date | null;
};

export type SessionVerdict =
  | { ok: true }
  | { ok: false; reason: 'wrong_door' | 'revoked' | 'expired' | 'idle' | 'not_customer' | 'suspended' };

/** Untouched for this long and a session is dead regardless of its expiry. */
export const IDLE_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * Every condition is a reason to refuse, and they are checked in this order so
 * the most specific answer wins when several apply.
 *
 * `wrong_door` is the one that is easy to leave out and expensive to omit. The
 * dashboard and the portal both issue sessions against the same User table, so
 * without it a token obtained legitimately at one door is a valid token at the
 * other — the holder need only move it between cookies.
 */
export function sessionVerdict(f: SessionFacts, now: Date = new Date()): SessionVerdict {
  if (f.kind !== 'ACCOUNT') return { ok: false, reason: 'wrong_door' };
  if (f.revokedAt) return { ok: false, reason: 'revoked' };
  if (f.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (now.getTime() - f.lastSeenAt.getTime() > IDLE_MS) return { ok: false, reason: 'idle' };
  if (f.role !== 'CUSTOMER') return { ok: false, reason: 'not_customer' };
  if (f.suspendedAt) return { ok: false, reason: 'suspended' };
  return { ok: true };
}

export type OtpFacts = {
  usedAt: Date | null;
  expiresAt: Date;
  attempts: number;
  storedHash: string;
  presentedHash: string;
};

export type OtpVerdict =
  | { ok: true }
  | { ok: false; reason: 'used' | 'expired' | 'locked' | 'mismatch'; burn: boolean };

export const OTP_MAX_ATTEMPTS = 5;

/**
 * `burn` says whether the token should be destroyed rather than merely
 * counted against. A wrong guess leaves the code alive so an honest typo can
 * be corrected; everything else kills it.
 *
 * The attempt cap is checked BEFORE the hash comparison. Checking it after
 * would let an attacker keep guessing forever as long as they were wrong,
 * since only a match would ever end the loop.
 */
export function otpVerdict(f: OtpFacts, now: Date = new Date()): OtpVerdict {
  if (f.usedAt) return { ok: false, reason: 'used', burn: true };
  if (f.expiresAt <= now) return { ok: false, reason: 'expired', burn: true };
  if (f.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'locked', burn: true };
  if (f.storedHash !== f.presentedHash) return { ok: false, reason: 'mismatch', burn: false };
  return { ok: true };
}

/**
 * Password policy for artist accounts.
 *
 * Length carries most of the strength, so the floor is 10 rather than 8. The
 * character-class rules are here because they are what people expect to see
 * and their absence reads as a site that does not care, not because they add
 * much on their own.
 */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push('At least 10 characters');
  if (!/[A-Z]/.test(pw)) out.push('One uppercase letter');
  if (!/[a-z]/.test(pw)) out.push('One lowercase letter');
  if (!/[0-9]/.test(pw)) out.push('One number');
  return out;
}

/**
 * A handful of passwords that pass every rule above and are still terrible.
 * Cheap to check, and it catches the most common thing people type when told
 * "ten characters with a capital and a number".
 */
const OBVIOUS = new Set([
  'password1a', 'password123', 'passw0rd123', 'qwerty12345', 'welcome123a',
  'letmein1234', 'snarebyt123', 'abcd1234efg', 'iloveyou123', 'admin123456',
]);

export function isObviousPassword(pw: string): boolean {
  return OBVIOUS.has(pw.toLowerCase().replace(/\s+/g, ''));
}

/**
 * Whether a row of history may be adopted by a newly verified account.
 *
 * The three conditions are all load-bearing:
 *   - the address must match, or this is somebody else's order;
 *   - the row must be unclaimed, or an existing owner loses it;
 *   - the address must have been PROVEN, or typing a stranger's email into
 *     the register form hands over their receipts and download links.
 *
 * The third is the one with no second chance, which is why it is stated as a
 * rule here rather than left implicit in the order the caller happens to do
 * things.
 */
export function mayAdoptHistory(f: {
  rowEmail: string | null;
  accountEmail: string;
  rowUserId: string | null;
  emailVerified: boolean;
}): boolean {
  if (!f.emailVerified) return false;
  if (f.rowUserId !== null) return false;
  if (!f.rowEmail) return false;
  return f.rowEmail.trim().toLowerCase() === f.accountEmail.trim().toLowerCase();
}

/**
 * Whether a stored file may be served to a requester.
 *
 * Ownership is the only thing that grants access; being signed in is not
 * enough, and neither is knowing the id. Admins are allowed through because
 * the studio has to be able to see what it was sent.
 */
export function mayAccessFile(f: {
  viewerId: string | null;
  viewerIsAdmin: boolean;
  ownerId: string | null;
  viewerSuspended: boolean;
}): boolean {
  if (f.viewerIsAdmin) return true;
  if (f.viewerSuspended) return false;
  if (!f.viewerId || !f.ownerId) return false;
  return f.viewerId === f.ownerId;
}
