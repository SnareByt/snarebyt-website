import Link from 'next/link';
import { currentAccount } from '@/lib/account';

/**
 * The way into the artist portal, in the top bar.
 *
 * A server component on purpose. Whether someone is signed in is a fact the
 * server already knows while rendering the header, so the button arrives in
 * its final state — no flash of the signed-out version, and no client fetch
 * on every page load just to decide which icon to draw.
 *
 * Signed out it is an outlined icon that matches the cart beside it. Signed
 * in it becomes the artist's initials in the brand gradient: a name is more
 * reassuring than a generic silhouette, because it tells you *whose* account
 * you are looking at on a shared machine, and it makes the header say
 * something no competitor's does.
 */

/** "Samir Islam" → SI, "SNAREBYT" → SN. Never more than two characters. */
function initials(name: string | null, artist: string | null, email: string): string {
  const source = (artist || name || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export async function AccountButton() {
  // Never throws: currentAccount returns null for every refusal, so a bad
  // cookie renders the signed-out button rather than a broken header.
  const me = await currentAccount().catch(() => null);

  if (!me) {
    return (
      <Link href="/account/login" className="icon-btn acct-btn" aria-label="Sign in to your artist account">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>
    );
  }

  const who = me.artistName || me.name || me.email;

  return (
    <Link
      href="/account"
      className="acct-chip"
      aria-label={`Your account — signed in as ${who}`}
      title={who}
    >
      <span className="acct-ini" aria-hidden="true">
        {initials(me.name, me.artistName, me.email)}
      </span>
      {/* Hidden below the nav breakpoint, where the bar has no room for it. */}
      <span className="acct-name">{who}</span>
    </Link>
  );
}
