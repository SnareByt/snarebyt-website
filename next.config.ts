import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * Written from what the site actually loads, checked against the rendered
 * pages rather than guessed: Spotify embeds, R2 for cover art and audio, and
 * presigned PUTs straight from the browser to R2 for uploads.
 *
 * `script-src` still needs 'unsafe-inline' because Next.js inlines its
 * hydration payload and there is no nonce pipeline here. That weakens the
 * anti-XSS value, but the rest of the policy is doing real work regardless:
 *
 *   frame-ancestors 'none'  — nobody can put the admin in an invisible iframe
 *                             and trick a signed-in Samir into clicking
 *                             "delete order" or "record refund".
 *   base-uri 'self'         — an injected <base> cannot re-point every
 *                             relative URL on the page at another host.
 *   form-action 'self'      — an injected form cannot post the admin's input
 *                             somewhere else.
 *   object-src 'none'       — no Flash-era plugin surface.
 *   connect-src             — exfiltration by fetch() is limited to origins we
 *                             actually talk to.
 */
/**
 * Development needs two relaxations that production must never get.
 *
 * React Fast Refresh compiles modules with eval, so under the production
 * `script-src` the dev bundle throws before hydration finishes and every page
 * renders as dead HTML — buttons do nothing, no client component mounts. That
 * is not a warning in the console; it is the whole app being untestable
 * locally, which is how it went unnoticed.
 *
 * `ws:` is the HMR socket. Neither is emitted in a production build.
 */
const DEV = process.env.NODE_ENV === 'development';

const scriptSrc = DEV
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const connectSrc = [
  "connect-src 'self' https://cdn.snarebyt.com https://*.r2.dev https://*.r2.cloudflarestorage.com",
  DEV ? 'ws: http://localhost:*' : '',
].filter(Boolean).join(' ');

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://cdn.snarebyt.com https://*.r2.dev https://i.scdn.co https://*.spotifycdn.com https://i.ytimg.com",
  "media-src 'self' blob: https://cdn.snarebyt.com https://*.r2.dev",
  // youtube-nocookie is the privacy-preserving host; youtube.com is still
  // needed because the player redirects to it for some content.
  "frame-src https://open.spotify.com https://www.youtube-nocookie.com https://www.youtube.com",
  connectSrc,
  // Would force the dev server's http://localhost to https, which has no
  // certificate — so it is a production-only directive.
  DEV ? '' : 'upgrade-insecure-requests',
].filter(Boolean).join('; ');

const nextConfig: NextConfig = {
  // Native HarfBuzz/Skia shaping is used only on the server to render the
  // Bangla licence page. Let Node load its platform binary directly.
  serverExternalPackages: ['@napi-rs/canvas'],
  // Spotify embeds and R2 assets are the only external origins we allow.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '*.spotifycdn.com' },
      { protocol: 'https', hostname: 'cdn.snarebyt.com' },
    ],
  },
  // 2GB stems never go through the server, but briefs and images do.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  outputFileTracingIncludes: {
    '/api/payments/sslcommerz/ipn': ['./src/assets/fonts/*.ttf'],
    '/admin/orders/*': ['./src/assets/fonts/*.ttf'],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: CSP },
          // frame-ancestors covers this for anything current; kept for the
          // browsers that only understand the older header.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stops a full URL leaking to another site in the Referer header.
          // Matters most on /download/<token>, where the path IS the secret.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Belt and braces on the pages that must never be indexed or cached
        // by anything in between: the token is in the URL.
        source: '/download/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // The phone dashboard is as private as /admin and shows the same live
        // business state, so it gets the same treatment: never indexed, never
        // held by a proxy or by the browser's back-forward cache.
        source: '/app/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        /**
         * The service worker is the one file under /app that must be cached
         * for zero seconds and re-checked on every launch. A worker pinned by
         * a stale cache keeps serving its old push handler after a fix ships,
         * and there is no way for a user to force it.
         */
        source: '/app/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/app/' },
        ],
      },
    ];
  },
};

export default nextConfig;
