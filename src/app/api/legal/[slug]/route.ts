import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderMarkdown } from '@/lib/markdown';

/**
 * One legal page's rendered text, for the footer panel.
 *
 * Returns HTML the server produced, never the raw Markdown: renderMarkdown
 * escapes its input before writing any markup, and doing that here means the
 * browser never has to be trusted to do it. The panel drops the result into
 * the DOM, so this endpoint is the boundary that makes that safe.
 *
 * Public on purpose — these are the terms customers are asked to accept, and a
 * page nobody can read is not a term anybody agreed to.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const page = await prisma.legalPage.findUnique({
    where: { slug },
    select: { title: true, bodyMarkdown: true, version: true, updatedAt: true },
  });

  if (!page) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(
    {
      title: page.title,
      version: page.version,
      html: renderMarkdown(page.bodyMarkdown),
    },
    {
      // Cheap to regenerate and read far more often than it changes, but never
      // so stale that a correction takes a day to appear.
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
    },
  );
}
