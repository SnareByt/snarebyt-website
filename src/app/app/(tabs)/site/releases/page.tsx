import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { ReleaseList } from './ReleaseList';

export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  await requireAdmin();

  const releases = await prisma.release.findMany({
    orderBy: [{ live: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <>
      <NavBar title="Releases" back="/app/site" />

      <ReleaseList
        releases={releases.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          /* A dash, never a guessed year. The column is nullable precisely so
             "we do not know" is representable, and the public page prints a
             dash — this screen must not quietly invent one either. */
          year: r.releasedAt ? String(r.releasedAt.getFullYear()) : '—',
          releasedAt: r.releasedAt ? r.releasedAt.toISOString().slice(0, 10) : '',
          trackCount: r.trackCount ?? 1,
          about: r.about ?? '',
          credits: r.credits ?? '',
          spotifyUrl: r.spotifyUrl ?? '',
          youtubeUrl: r.youtubeUrl ?? '',
          appleMusicUrl: r.appleMusicUrl ?? '',
          hasSpotifyEmbed: Boolean(r.spotifyEmbedId),
          hasCover: Boolean(r.coverKey),
          live: r.live,
          featured: r.featured,
        }))}
      />
    </>
  );
}
