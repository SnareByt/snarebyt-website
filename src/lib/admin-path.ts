/**
 * Where the admin front door is, and who is allowed to know it exists.
 *
 * Two separate ideas, deliberately kept apart:
 *
 *  - PROTECTION is `requireAdmin()` in every page and every server action.
 *    That is what stops someone getting in, and none of this replaces it.
 *  - PRIVACY is this file. A locked door that announces itself invites
 *    people to rattle the handle: credential-stuffing bots find admin panels
 *    by looking for the login page, and a redirect from /admin to /admin/login
 *    confirms one is there. Signed out, every admin URL now answers 404 —
 *    the same thing any nonexistent path answers — so there is nothing to
 *    find and nothing to attack.
 *
 * The login page itself can be moved to a path only Samir knows by setting
 * ADMIN_SECRET_PATH in the server environment. It is OPTIONAL on purpose:
 *
 *  - unset  → the login page stays at /admin/login, exactly as before.
 *  - set    → /admin/login answers 404 too, and the form lives at
 *             /admin/<that value>.
 *
 * Opt-in because a secret nobody wrote down is a lockout. It lives in an
 * environment variable rather than the database so it can always be read back
 * from the Vercel dashboard, and changed or removed there without a password,
 * without this code, and without me.
 */

/** Lowercase letters, numbers and hyphens — the shape of a URL segment. */
const VALID = /^[a-z0-9][a-z0-9-]{2,63}$/;

/**
 * The secret segment, or null when none is configured.
 *
 * A malformed value is treated as unset rather than used as-is. Half a secret
 * is worse than none: a path containing a slash or an uppercase letter would
 * never match an incoming request, so the door would simply cease to exist.
 */
export function secretSegment(): string | null {
  const raw = (process.env.ADMIN_SECRET_PATH ?? '').trim().toLowerCase();
  if (!raw) return null;
  // "login" would collide with the default door and make the rule circular.
  if (raw === 'login') return null;
  return VALID.test(raw) ? raw : null;
}

/** The path the sign-in form is served from right now. */
export function loginPath(): string {
  const secret = secretSegment();
  return secret ? `/admin/${secret}` : '/admin/login';
}

/**
 * Is this path the front door?
 *
 * Everything else under /admin is answered with 404 when signed out. Note that
 * /admin/login stops being the door the moment a secret is set — otherwise
 * setting one would hide nothing.
 */
export function isLoginPath(pathname: string): boolean {
  return pathname === loginPath();
}
