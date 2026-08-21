import type { SiteMode } from './site-mode';

/**
 * What each site mode does, as pure decisions.
 *
 * Separated from site-mode.ts for the same reason order-rules.ts and
 * account-rules.ts are separated: this is the logic that can take the whole
 * business offline, and a rule you cannot run in a test is a rule you are
 * trusting rather than checking.
 */

/** Anything that is not exactly a known closed mode means open. */
export function normaliseMode(raw: string | null | undefined): SiteMode {
  return raw === 'soon' || raw === 'maintenance' ? raw : 'live';
}

export type Audience = { isAdmin: boolean };

export type GateDecision =
  | { show: 'site' }
  | { show: 'site'; preview: true }
  | { show: 'gate'; blurBehind: boolean };

/**
 * What a given visitor sees.
 *
 * An admin always passes through. Without that, turning the site off would
 * also lock Samir out of looking at it, and the only way to check a change
 * would be to reopen the site first — exactly when you least want to.
 */
export function decideGate(mode: SiteMode, who: Audience): GateDecision {
  if (mode === 'live') return { show: 'site' };
  if (who.isAdmin) return { show: 'site', preview: true };
  // Both closed modes keep the real site behind the panel, blurred and inert.
  // The blur is what makes it read as a site that exists and is temporarily
  // out of reach, rather than a dead end — and that is as true of an hour of
  // maintenance as it is of a launch.
  return { show: 'gate', blurBehind: true };
}

/**
 * Whether a write should be refused.
 *
 * Deliberately ignores who is asking. Previewing the closed site is reading;
 * taking a real order while the shop is shut is not something to do by
 * accident, admin or not.
 */
export function writesBlocked(mode: SiteMode): boolean {
  return mode !== 'live';
}

/**
 * Signing in is never blocked.
 *
 * Closing the shop is not the same as locking existing customers out of the
 * licences and files they have already paid for. Registration is blocked;
 * authentication is not.
 */
export function signInBlocked(_mode: SiteMode): boolean {
  return false;
}
