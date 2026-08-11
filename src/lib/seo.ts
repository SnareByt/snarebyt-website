import type { Metadata } from 'next';
import { getPage } from './content';

/**
 * Metadata for a public page, built from its own Page row.
 *
 * The canonical URL matters more here than on most sites: this app answers on
 * snarebyt.com, www.snarebyt.com and a permanent *.vercel.app address. Without
 * a canonical, a search engine sees three copies of every page and has to guess
 * which one is real — and it may not guess the domain you want ranking.
 */
const PATHS: Record<string, string> = {
  home: '/', music: '/music', beats: '/beats', services: '/services',
  portfolio: '/portfolio', about: '/about', contact: '/contact',
};

export async function pageMetadata(slug: string): Promise<Metadata> {
  const page = await getPage(slug);
  const path = PATHS[slug] ?? `/${slug}`;
  const base = process.env.APP_URL ?? '';

  const title = page?.seoTitle ?? 'SnareByt';
  const description = page?.seoDescription ?? undefined;
  const url = base ? new URL(path, base).toString() : path;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url,
      siteName: 'SnareByt',
      type: slug === 'home' ? 'website' : 'article',
      locale: 'en_GB',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
