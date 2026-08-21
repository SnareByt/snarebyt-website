/**
 * A user-agent string, turned into something a person recognises.
 *
 * "iPhone · Safari" is the point. A session list that reads
 * "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)…" is a list nobody
 * audits, and a device list nobody reads is not a security feature.
 *
 * Deliberately rough. This is for recognising your own devices, not for
 * analytics or fingerprinting, so a wrong guess costs a slightly odd label and
 * nothing more. Order matters throughout: Edge claims to be Chrome, Chrome
 * claims to be Safari, and iPadOS claims to be a Mac.
 */

export type DeviceName = { name: string; detail: string };

export function deviceName(ua: string | null, label: string | null): DeviceName {
  // A label set at sign-in ("iPhone") beats anything guessed from the string.
  const named = (label ?? '').trim();
  const agent = ua ?? '';

  if (!agent) {
    return { name: named || 'Unknown device', detail: 'No browser details recorded' };
  }

  const os = osOf(agent);
  const browser = browserOf(agent);

  return {
    name: named || os,
    detail: named && named !== os ? `${os} · ${browser}` : browser,
  };
}

function osOf(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  // iPadOS reports itself as Macintosh; touch points are what separate them,
  // and those are not in the user-agent string, so an iPad in desktop mode
  // will read as a Mac here. Acceptable: both are his.
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows PC';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

function browserOf(ua: string): string {
  // Edge before Chrome, and Chrome before Safari: each impersonates the next.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown browser';
}

/** "3 minutes ago" — a session list is read for recency, not for timestamps. */
export function ago(then: Date | null, now: Date = new Date()): string {
  if (!then) return 'never';

  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/** "in 12 days" — the other direction, for an expiry. */
export function until(then: Date, now: Date = new Date()): string {
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return 'expired';

  const hours = Math.round(seconds / 3600);
  if (hours < 1) return 'within the hour';
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
