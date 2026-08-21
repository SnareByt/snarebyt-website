/**
 * The web app manifest, served at /app/manifest.webmanifest.
 *
 * A route handler rather than Next's `manifest.ts` convention, because that
 * convention only fires at the root of the app directory and would publish a
 * manifest for the whole site. This dashboard is private; the manifest that
 * describes it should be reachable at the dashboard's own path and nowhere
 * else.
 */
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    name: 'SnareByt Admin',
    // Under the home-screen icon. iOS truncates at roughly twelve characters,
    // so this is the one that has to be short.
    short_name: 'SnareByt',
    description: 'The SnareByt dashboard — beats, orders, releases and bookings.',

    /**
     * `start_url` and `scope` both point at /app.
     *
     * Scope is what keeps the installed app installed: tapping a link outside
     * it kicks the user out to Safari mid-task. Everything the dashboard needs
     * lives under /app, so nothing legitimate escapes — and a stray link to
     * the public site opening in Safari is the correct behaviour anyway.
     */
    start_url: '/app',
    scope: '/app/',

    /**
     * `standalone` removes the Safari address bar and toolbar entirely. This
     * single line is most of the distance between "a bookmark" and "an app".
     */
    display: 'standalone',
    orientation: 'portrait',

    /* Matches --ink. The splash screen iOS generates uses this colour, so a
       mismatch here shows as a flash of the wrong background on every launch. */
    background_color: '#040405',
    theme_color: '#040405',

    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /**
       * A maskable icon is drawn edge to edge and cropped to whatever shape
       * the platform wants. Without one, Android puts the square mark inside
       * a white circle. The safe zone is the middle 80%, which is why this is
       * generated with padding rather than reusing the file above.
       */
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],

    /* Long-press the home-screen icon. Two destinations, because a quick
       action list that needs scrolling is not a quick action. */
    shortcuts: [
      { name: 'Orders', short_name: 'Orders', url: '/app/orders' },
      { name: 'Beats', short_name: 'Beats', url: '/app/beats' },
    ],

    categories: ['business', 'productivity', 'music'],
    prefer_related_applications: false,
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
