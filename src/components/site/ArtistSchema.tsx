import { prisma } from '@/lib/prisma';
import { getNav } from '@/lib/content';
import { siteUrl } from '@/lib/seo';

/**
 * Structured data describing SnareByt as a music act.
 *
 * This is what lets a search engine understand the site is an artist rather
 * than a generic page, and it is what feeds the panel that can appear beside
 * results. Every value is taken from the database — releases that are actually
 * live, profiles that actually have a URL. Nothing is asserted that is not
 * already stated on the site, and no listener or view figures appear anywhere.
 */
export async function ArtistSchema() {
  const base = await siteUrl();
  if (!base) return null;

  const [socials, releases] = await Promise.all([
    getNav('SOCIAL'),
    prisma.release.findMany({
      where: { live: true, type: { in: ['ALBUM', 'EP', 'BEAT_TAPE'] } },
      orderBy: { sortOrder: 'asc' },
      select: { title: true, releasedAt: true, spotifyUrl: true, type: true },
    }),
  ]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: 'SnareByt',
    alternateName: 'Samir Islam',
    url: base,
    description:
      'Music producer, recording artist and mixing and mastering engineer from Dhaka, Bangladesh. Member of the Wrong Side collective.',
    genre: ['Hip hop', 'Trap', 'Drill'],
    /* The mark, stated as data rather than left to be guessed from the page.
       This is what a knowledge panel draws — it is NOT the small icon beside a
       search result, which comes from <link rel="icon"> and is already served
       at 512x512. Absolute URLs, because a crawler reading this JSON has no
       page to resolve a relative path against. */
    logo: `${base}/icon.png`,
    image: `${base}/icon.png`,
    foundingLocation: { '@type': 'Place', name: 'Dhaka, Bangladesh' },
    // Only profiles with a real URL. getNav already drops empty ones.
    sameAs: socials.map((s) => s.href),
    album: releases.map((r) => ({
      '@type': 'MusicAlbum',
      name: r.title,
      ...(r.releasedAt ? { datePublished: r.releasedAt.toISOString().slice(0, 10) } : {}),
      ...(r.spotifyUrl ? { sameAs: r.spotifyUrl } : {}),
    })),
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify does not escape "<", so a title or description
      // containing "</script>" would close this tag early and everything after
      // it would run as script. Escaping the angle bracket keeps the JSON valid
      // and makes that impossible.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}
