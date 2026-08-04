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

  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = { matcher: ['/admin/:path*'] };
