import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { publicUrl } from '@/lib/storage';
import { MediaLibrary, type Asset } from './MediaLibrary';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  await requireAdmin();

  const assets = await prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' } });

  // Checked on the server so the screen can say plainly why uploads fail,
  // rather than letting someone pick a file and watch it error.
  const storageReady = Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
  );

  const rows: Asset[] = assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    filename: a.filename,
    url: publicUrl(a.objectKey),
    alt: a.alt,
    bytes: Number(a.bytes),
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <>
      <header><div><div className="crumb">Content</div><h1>Media</h1></div></header>
      <div className="wrap">
        <MediaLibrary assets={rows} storageReady={storageReady} />

        <div className="note" style={{ marginTop: '1.6rem' }}>
          <span>🔒</span>
          <span>
            <b>This library is the public bucket only.</b> Untagged masters, WAVs, stems and licence
            PDFs go to the private bucket through the beat screen and never appear here, because
            nothing in here has access control — anything uploaded is world-readable by design.
          </span>
        </div>
      </div>
    </>
  );
}
