import { NextResponse, type NextRequest } from 'next/server';
import { isLoginPath } from '@/lib/admin-path';

/**
 * Cheap gate: no session cookie, no admin pages. The real
 * authorisation check happens in the page and in every server
 * action via requireAdmin() — middleware alone is not security,
 * because a server action can be called without loading a page.
 *
 * What changed here is only what a SIGNED-OUT visitor is told. It used to be
 * redirected to the login page, which confirms an admin panel exists and hands
 * scanners a form to attack. Now every admin URL answers 404, the same as any
 * path that was never built. See src/lib/admin-path.ts for the reasoning and
 * for the optional secret door.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const notFound = () => {
    // Rewrite, not redirect: the URL stays put and the response is a genuine
    // 404 page, so there is no redirect chain to follow and nothing in the
    // address bar hinting that the path meant something.
    const url = req.nextUrl.clone();
    url.pathname = '/404-admin';
    // The status comes from the rewritten route calling notFound(), not from
    // an init option — rewrite does not honour one, and a 200 here would be a
    // 404 page that every crawler treats as a real page.
    return harden(NextResponse.rewrite(url));
  };

  if (pathname.startsWith('/admin')) {
    const signedIn = Boolean(req.cookies.get('sb_session'));

    // The old login URL is not merely hidden once a secret is set — it is
    // gone. Leaving it working would make the secret decorative.
    if (!signedIn && !isLoginPath(pathname)) return notFound();

    // Already signed in and standing at the front door: go to the dashboard
    // rather than showing a sign-in form to someone who is signed in.
    if (signedIn && isLoginPath(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return harden(NextResponse.redirect(url));
    }
  }

  /**
   * The phone dashboard gets the same cheap gate, with two carve-outs.
   *
   * The service worker and the manifest must stay reachable while signed out.
   * iOS decides whether a site is installable by fetching both BEFORE anyone
   * has logged in; redirecting them to a login page means "Add to Home Screen"
   * never offers the app at all — it silently saves a bookmark instead. That
   * is not a security hole: neither file contains anything private, and the
   * pages they lead to are each protected by requireAdmin() on the server.
   *
   * This one still redirects rather than 404s. It is an installed app on his
   * phone: the icon has to lead somewhere he can sign in, and a 404 on the
   * home screen is indistinguishable from a broken app.
   */
  if (pathname.startsWith('/app')
      && pathname !== '/app/login'
      && pathname !== '/app/sw.js'
      && pathname !== '/app/manifest.webmanifest') {
    if (!req.cookies.get('sb_session')) {
      const url = req.nextUrl.clone();
      url.pathname = '/app/login';
      // Only in-app paths are ever echoed back, so a crafted ?next= cannot
      // bounce a freshly signed-in admin to somebody else's URL.
      if (pathname.startsWith('/app/')) url.searchParams.set('next', pathname);
      return harden(NextResponse.redirect(url));
    }
  }

  return harden(NextResponse.next());
}

/**
 * Headers every admin and app response carries.
 *
 * X-Robots-Tag belongs here rather than only in robots.txt: robots.txt asks a
 * crawler not to fetch a URL, but a link from anywhere else can still get one
 * indexed. This header is the instruction that travels with the page itself.
 */
function harden(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  return res;
}

export const config = { matcher: ['/admin/:path*', '/app/:path*'] };
