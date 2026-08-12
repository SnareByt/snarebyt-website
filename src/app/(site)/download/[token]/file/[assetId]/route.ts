import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkDownload } from '@/lib/download';
import { presignDownload } from '@/lib/storage';

/**
 * The actual file fetch.
 *
 * Every rule is re-checked here rather than trusted from the page that linked
 * here. The page is just HTML; this URL can be called directly, and the asset
 * id in it can be edited by hand — so the check that the file belongs to the
 * purchased licence tier has to happen at this end, not the rendering end.
 *
 * The counter is incremented BEFORE the signed URL is handed out, with a
 * conditional update. If two requests arrive together only one can move the
 * counter from n to n+1, so the cap cannot be walked past by opening the link
 * in ten tabs at once.
 *
 * The file itself is never proxied. R2 serves it from a signed URL that dies
 * in five minutes, so a 2 GB stems zip never passes through the server.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; assetId: string }> },
) {
  const { token, assetId } = await params;
  const origin = req.nextUrl.origin;

  const log = (objectKey: string, success: boolean, reason?: string, orderId?: string) =>
    prisma.downloadLog.create({
      data: {
        orderId: orderId ?? null,
        objectKey,
        success,
        reason: reason ?? null,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    }).catch(() => {});

  const res = await checkDownload(token);
  if (!res.ok) {
    await log(assetId, false, res.reason);
    // Back to the page, which explains the reason properly and offers a way
    // to ask for a new link.
    return NextResponse.redirect(new URL(`/download/${token}`, origin), 303);
  }

  const file = res.files.find((f) => f.assetId === assetId);
  if (!file) {
    // Either a stale id, or someone editing the URL to reach a file the tier
    // they paid for does not include.
    await log(assetId, false, 'not_in_licence');
    return NextResponse.redirect(new URL(`/download/${token}`, origin), 303);
  }

  // Spend the attempt. `attempts: current` makes this a compare-and-set: a
  // racing request finds a different value and updates nothing.
  const grant = await prisma.downloadGrant.findUnique({ where: { id: res.grantId } });
  if (!grant) return NextResponse.redirect(new URL(`/download/${token}`, origin), 303);

  const claimed = await prisma.downloadGrant.updateMany({
    where: { id: grant.id, attempts: grant.attempts, revokedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    await log(file.objectKey, false, 'race_lost');
    return NextResponse.redirect(new URL(`/download/${token}`, origin), 303);
  }

  const url = await presignDownload(file.objectKey, 300);
  await log(file.objectKey, true);

  return NextResponse.redirect(url, 303);
}
