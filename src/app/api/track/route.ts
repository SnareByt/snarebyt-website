import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Page-view collector for the public site.
 *
 * Anonymous by construction, not by promise:
 *
 *   · No cookie is ever set, so nothing follows anyone between visits.
 *   · The IP address is never stored. It goes into a hash together with the
 *     user agent and a salt that changes every day, which makes the same
 *     person countable within a day and uncorrelatable across days.
 *   · Only the referrer's HOSTNAME is kept. A full referring URL can carry
 *     search terms and private query strings.
 *
 * Everything a visitor sends is treated as hostile: the path is validated
 * against the site's own routes rather than stored as given, since this
 * endpoint is public and would otherwise happily record any string an
 * attacker posted and render it back inside the admin.
 */

// A per-process salt so hashes cannot be recomputed from a leaked database
// with a guessed IP. Rotating daily on top of this is what breaks linkage.
const PROCESS_SALT = randomBytes(16).toString('hex');

/** Public routes worth counting. Anything else is ignored, not stored. */
const TRACKED = new Set([
  '/', '/music', '/beats', '/services', '/portfolio', '/about', '/contact', '/cart',
]);

const isTracked = (p: string) =>
  TRACKED.has(p) || /^\/(beats|music|portfolio)\/[a-z0-9-]{1,80}$/.test(p);

/** Crawlers are traffic, but they are not visitors. */
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|preview|curl|wget|python-requests|axios|node-fetch/i;

function deviceFrom(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Vercel percent-encodes the city header, because a header cannot carry a
 * non-ASCII byte. Without this, Dhaka's neighbours arrive as "Chattogram" but
 * anywhere with an accent arrives as "S%C3%A3o%20Paulo".
 */
function decodeEdge(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const value = decodeURIComponent(raw).trim();
    return value ? value.slice(0, 80) : null;
  } catch {
    // A malformed sequence is not worth losing the whole page view over.
    return raw.slice(0, 80);
  }
}

function hostnameOf(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return h.length <= 100 ? h : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // A tracker must never be the reason a page breaks, so every failure ends
  // as a quiet 204 rather than an error the browser could surface.
  try {
    const ua = req.headers.get('user-agent') ?? '';
    if (!ua || BOT.test(ua)) return new NextResponse(null, { status: 204 });

    // Honour the browser's own preference. Counting someone who asked not to
    // be counted is the whole thing this is trying not to be.
    if (req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await req.json().catch(() => null)) as
      | { path?: unknown; referrer?: unknown }
      | null;
    if (!body || typeof body.path !== 'string') return new NextResponse(null, { status: 204 });

    const path = body.path.split('?')[0].split('#')[0].slice(0, 120);
    if (!isTracked(path)) return new NextResponse(null, { status: 204 });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const visitorId = createHash('sha256')
      .update(`${ip}|${ua}|${day}|${PROCESS_SALT}`)
      .digest('hex')
      .slice(0, 32);

    const referrer = hostnameOf(typeof body.referrer === 'string' ? body.referrer : null);
    // Our own pages are not referrers; that is just someone moving around.
    const host = req.headers.get('host')?.replace(/^www\./, '').split(':')[0] ?? '';
    const externalReferrer = referrer && referrer !== host ? referrer : null;

    await prisma.pageView.create({
      data: {
        path,
        referrer: externalReferrer,
        /* Vercel resolves these at the edge from the IP, before the request
           reaches this code. The IP itself is used for one thing — the daily
           visitor hash above — and is never stored.

           City is often missing or wrong: a VPN, a mobile carrier routing
           through Dhaka, or a corporate gateway all place someone somewhere
           they are not. It is a rough picture of where interest is coming
           from, not a location for any individual, and the admin says so. */
        country: req.headers.get('x-vercel-ip-country'),
        city: decodeEdge(req.headers.get('x-vercel-ip-city')),
        region: req.headers.get('x-vercel-ip-country-region'),
        device: deviceFrom(ua),
        visitorId,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
