import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { publicUrl } from '@/lib/storage';
import { fileSize, ago } from '@/lib/app-format';
import { MediaGrid } from './MediaGrid';

export const dynamic = 'force-dynamic';

/**
 * The media library.
 *
 * Uploading from a phone is the feature that genuinely does not exist on the
 * desktop: the camera roll is where the artwork and the studio photos already
 * are, and getting them onto a laptop first is the step that stops them ever
 * being posted.
 */
export default async function MediaPage() {
  await requireAdmin();

  const assets = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: 'desc' },
    take: 120,
  });

  return (
    <>
      <NavBar title="Media" back="/app/site" />

      <MediaGrid
        assets={assets.map((a) => ({
          id: a.id,
          filename: a.filename,
          kind: a.kind,
          alt: a.alt,
          size: fileSize(a.bytes),
          added: ago(a.createdAt),
          url: publicUrl(a.objectKey),
        }))}
        missingAlt={assets.filter((a) => a.kind === 'IMAGE' && !a.alt.trim()).length}
      />
    </>
  );
}
