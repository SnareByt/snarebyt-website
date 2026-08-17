import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { siteUrl } from '@/lib/seo';

/**
 * Rendered per request, never at build time.
 *
 * It reads Page rows, and prerendering it made the whole build depend on the
 * database being reachable with credentials present. That is a bad trade for
 * a file that changes when content changes: a build would fail for a reason
 * that has nothing to do with the code, which is exactly what happened on the
 * first preview deployment — no DATABASE_URL in that environment, so the
 * build died on /sitemap.xml.
 *
 * siteUrl() already reads request headers, so this route was never really
 * static anyway.
 */
export const dynamic = 'force-dynamic';

/**
 * Public pages only, built from the Page rows so it cannot drift from what
 * actually exists. Empty until SITE_LIVE is "true" — advertising a preview
 * URL's contents to search engines is the thing robots.ts is preventing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  // Matches robots.ts: live unless explicitly switched off.
  if (process.env.SITE_LIVE === 'false' || !base) return [];

  // A sitemap is worth serving empty rather than failing the request if the
  // database is briefly unreachable.
  const pages = await prisma.page
    .findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, updatedAt: true } })
    .catch(() => []);

  return pages.map((p) => ({
    url: p.slug === 'home' ? base : `${base}/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: p.slug === 'home' ? ('weekly' as const) : ('monthly' as const),
    priority: p.slug === 'home' ? 1 : 0.8,
  }));
}
