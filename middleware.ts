import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap gate: no session cookie, no admin pages. The real
 * authorisation check happens in the page and in every server
 * action via requireAdmin() — middleware alone is not security,
 * because a server action can be called without loading a page.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!req.cookies.get('sb_session')) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = { matcher: ['/admin/:path*', '/app/:path*'] };
