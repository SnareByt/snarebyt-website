import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

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
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Default is now LIVE. This started as opt-in so an unfinished preview could
  // not be indexed, but the site has been publicly serving on its own domain
  // for a while and the switch was quietly keeping it out of search. Opting
  // OUT is still one variable away.
  const live = process.env.SITE_LIVE !== 'false';
  const base = await siteUrl();

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
