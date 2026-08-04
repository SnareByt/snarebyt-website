import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

/**
 * Public pages only, built from the Page rows so it cannot drift from what
 * actually exists. Empty until SITE_LIVE is "true" — advertising a preview
 * URL's contents to search engines is the thing robots.ts is preventing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL;
  if (process.env.SITE_LIVE !== 'true' || !base) return [];

  const pages = await prisma.page.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, updatedAt: true },
  });

  return pages.map((p) => ({
    url: p.slug === 'home' ? base : `${base}/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: p.slug === 'home' ? ('weekly' as const) : ('monthly' as const),
    priority: p.slug === 'home' ? 1 : 0.8,
  }));
}
