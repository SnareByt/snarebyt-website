import type { MetadataRoute } from 'next';

/**
 * Indexing is OFF until SITE_LIVE is explicitly "true".
 *
 * Two problems this solves. Before launch, the site runs on a
 * *.vercel.app URL; if that gets indexed, the real domain later competes
 * with it in search results for its own content. And after launch the
 * .vercel.app URL keeps working, so it needs to stay unindexed forever,
 * not just during the preview.
 *
 * Default-off rather than default-on: forgetting to disable indexing is
 * costly and silent, forgetting to enable it is obvious the first time
 * someone searches for the site.
 */
export default function robots(): MetadataRoute.Robots {
  const live = process.env.SITE_LIVE === 'true';
  const base = process.env.APP_URL ?? '';

  if (!live) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The admin is not secret — it is protected — but there is no reason
        // for it to be in an index, and /download links are single-use grants.
        disallow: ['/admin', '/api/', '/download/'],
      },
    ],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
