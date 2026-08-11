import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getPage } from './content';

/**
 * The site's own origin.
 *
 * APP_URL is used when it is set, because it is the deliberate answer and the
 * one thing that stays right if the site is ever reached through something
 * else. When it is missing, the request's own host is used rather than
 * emitting a relative canonical — a canonical of "/" tells a search engine
 * nothing, and the site spent a week doing exactly that because one
 * environment variable had never been filled in.
 */
export async function siteUrl(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

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
  const base = await siteUrl();

  const title = page?.seoTitle ?? 'SnareByt';
  const description = page?.seoDescription ?? undefined;
  const url = base ? new URL(path, base).toString() : path;

  return {
    title,
    description,
    // Absolute, not the path. Relative only resolves against metadataBase, and
    // if that is unset it ships as href="/" — which is worse than none.
    alternates: { canonical: url },
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
