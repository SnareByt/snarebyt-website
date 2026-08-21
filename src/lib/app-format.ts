/**
 * Display helpers shared across the phone dashboard.
 *
 * Pure functions with no imports, so they are usable from server components
 * and client components alike without dragging Prisma into a bundle.
 */

/** Which chip colour a status earns. Empty string means the neutral chip. */
export function orderChip(status: string) {
  if (status === 'PAID') return 'ok';
  if (status === 'PENDING_PAYMENT') return 'warn';
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'REFUNDED') return 'red';
  return '';
}

export function projectChip(status: string) {
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'ok';
  if (status === 'REVISION_REQUESTED' || status === 'ORDER_RECEIVED') return 'warn';
  return 'info';
}

export function beatChip(status: string) {
  if (status === 'PUBLISHED') return 'ok';
  if (status === 'SOLD_EXCLUSIVE') return 'red';
  if (status === 'ARCHIVED') return '';
  return 'warn'; // DRAFT
}

/** SCREAMING_SNAKE to something a human reads. */
export function humanStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Relative time, to the nearest useful unit.
 *
 * Everything on this screen is either minutes old or days old, and "3 days
 * ago" is what he actually needs to know about an unpaid order. Beyond a week
 * the absolute date is more useful than a count of days, so it switches.
 */
export function ago(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);

  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** A date, in the form used on every detail screen. */
export function shortDate(date: Date | string | null | undefined) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A file size a human reads.
 *
 * `bytes` arrives as a BigInt from Prisma — stems archives run past the 2GB
 * that a 32-bit int can hold, which is why the column is what it is.
 */
export function fileSize(bytes: bigint | number | null | undefined) {
  if (bytes == null) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * A human name for a device, guessed from its user agent.
 *
 * Derived rather than asked for: a prompt at the login screen is friction for
 * a value nobody wants to type. It only has to be good enough to recognise a
 * row in a list before revoking it — "iPhone" is enough to know which line is
 * the phone in your hand.
 */
export function deviceLabel(ua: string) {
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Unknown device';
}
