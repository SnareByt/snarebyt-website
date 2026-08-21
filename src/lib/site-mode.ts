import 'server-only';
import { prisma } from './prisma';
import { currentAdmin } from './prisma-safe-auth';
import { normaliseMode, decideGate, writesBlocked } from './site-mode-rules';

/**
 * Whether the public site is open, and if not, how it is closed.
 *
 * One setting with three values rather than two independent switches. "Coming
 * soon" and "under maintenance" say contradictory things — one means "not open
 * yet", the other "open, but not right now" — and two booleans make it
 * possible to have both on at once, which has no meaning and would have to be
 * resolved by some arbitrary precedence rule nobody would remember. A single
 * mode cannot contradict itself.
 *
 * Open is the default. A missing row, an unrecognised value or a database
 * hiccup all resolve to `live`, so the site can never take itself offline by
 * accident — the same rule the beat store already follows.
 */
export type SiteMode = 'live' | 'soon' | 'maintenance';

export async function getSiteMode(): Promise<SiteMode> {
  const row = await prisma.setting.findUnique({ where: { key: 'siteMode' } });
  return normaliseMode(row?.value);
}

export type Gate =
  | { gated: false; mode: 'live' }
  | { gated: true; mode: 'soon' | 'maintenance'; preview: false }
  /** An admin looking at a gated site. Everything works; a banner says why. */
  | { gated: false; mode: 'soon' | 'maintenance'; preview: true };

/**
 * What this visitor should see.
 *
 * A signed-in admin passes straight through. Without that, switching the site
 * off would also lock Samir out of looking at it, and the only way to check a
 * change would be to make the site public again first — which is precisely
 * when you least want to.
 */
export async function siteGate(): Promise<Gate> {
  const mode = await getSiteMode();
  if (mode === 'live') return { gated: false, mode: 'live' };

  // currentAdmin() reads a cookie and hits the database; a failure here must
  // mean "not an admin", not a crash that takes the whole page with it.
  const admin = await currentAdmin().catch(() => null);
  const decision = decideGate(mode, { isAdmin: Boolean(admin) });

  return decision.show === 'site'
    ? { gated: false, mode, preview: true }
    : { gated: true, mode, preview: false };
}

/**
 * The check for server actions — ordering, enquiries, registration.
 *
 * The gate a visitor sees is a rendering decision, and rendering decisions are
 * not security. A blurred page has still been sent to the browser, and a form
 * that is merely hidden can still be posted to by anyone who knows the shape
 * of it. So anything that writes calls this and refuses on its own account.
 *
 * Admins are NOT exempt here. Previewing the site is reading; placing a real
 * order while the shop is closed is not something to do by accident.
 */
export async function siteClosedForBusiness(): Promise<boolean> {
  return writesBlocked(await getSiteMode());
}

/** What to tell someone whose submission was refused. */
export function closedMessage(mode: SiteMode): string {
  return mode === 'maintenance'
    ? 'The site is down for maintenance for a short while. Nothing was sent — please try again shortly.'
    : 'SnareByt is not open for orders yet. Nothing was sent — get in touch on WhatsApp and it can be arranged directly.';
}

/**
 * The WhatsApp number, digits only.
 *
 * Lives here because the gate is the one screen with no other way to reach
 * Samir — every other page has a contact form behind it.
 */
export async function whatsappNumber(): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });
  const digits = (row?.value ?? '').replace(/[^0-9]/g, '');
  return digits || undefined;
}
