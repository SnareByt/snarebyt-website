import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkDownload } from '@/lib/download';
import { presignDownload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** A licence is private and is released only through the same paid-order grant. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const checked = await checkDownload(token);
  if (!checked.ok || !checked.licenceReady) {
    return new NextResponse('Licence document is not available.', {
      status: checked.ok ? 404 : 403,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  const grant = await prisma.downloadGrant.findUnique({
    where: { id: checked.grantId },
    select: { orderItemId: true },
  });
  const licence = grant ? await prisma.licenceDocument.findUnique({
    where: { orderItemId: grant.orderItemId },
    select: { pdfObjectKey: true, number: true },
  }) : null;
  if (!licence) return new NextResponse('Licence document is not available.', { status: 404 });

  const filename = `${licence.number}.pdf`;
  const url = await presignDownload(licence.pdfObjectKey, 120, filename);
  return NextResponse.redirect(url, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
