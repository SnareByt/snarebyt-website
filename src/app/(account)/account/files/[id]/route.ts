import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/account';
import { getOwnedFile } from '@/lib/account-data';
import { presignDownload } from '@/lib/storage';
import { prisma } from '@/lib/prisma';

/**
 * Serve one project file to the artist who owns it.
 *
 * This is the most dangerous route in the portal: it reaches into the private
 * bucket, which holds unreleased masters, stems and licence PDFs belonging to
 * every customer. So it is deliberately small, and every line of it is a
 * refusal until the last one.
 *
 * The access decision is a single query — `getOwnedFile(userId, fileId)` joins
 * the file to its project to its owner. There is no version that takes a file
 * id on its own, so this route cannot accidentally be written the unsafe way.
 *
 * Nothing is streamed through the server. A short-lived signed URL is issued
 * and the browser fetches from R2 directly, so a 2GB stems archive is not a
 * function timeout waiting to happen. The URL lasts two minutes: long enough
 * to start a download, short enough that a copied address is worthless by the
 * time it is pasted anywhere.
 *
 * A missing file and a file belonging to somebody else return the same 404.
 * Distinguishing them would confirm that a given id exists, which is itself a
 * disclosure.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const me = await currentAccount();
  if (!me) {
    return NextResponse.redirect(
      new URL(`/account/login?next=/account/files/${id}`, process.env.APP_URL || 'http://localhost:3000'),
    );
  }

  const file = await getOwnedFile(me.id, id);
  if (!file) return new NextResponse('Not found', { status: 404 });

  // Logged before the URL is handed over, so an abnormal pattern is visible
  // even if the download itself never completes.
  await prisma.downloadLog.create({
    data: {
      userId: me.id,
      objectKey: file.objectKey,
      ip: null,
      success: true,
    },
  }).catch(() => {});

  const url = await presignDownload(file.objectKey, 120, file.filename);
  return NextResponse.redirect(url, { status: 302 });
}
