import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHead } from '@/components/site/PageHead';
import { renderMarkdown, firstParagraph } from '@/lib/markdown';

export const dynamic = 'force-dynamic';

/**
 * Terms, privacy, refunds — whatever has been written in the admin.
 *
 * One route for all of them rather than a file per page, because these get
 * added over time and adding one must never need a deploy. The page is the
 * database row; there is no copy of it in the code to drift out of step.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.legalPage.findUnique({ where: { slug } });
  if (!page) return { title: 'Not found — SnareByt' };

  return {
    title: `${page.title} — SnareByt`,
    description: firstParagraph(page.bodyMarkdown) || undefined,
  };
}

const day = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function LegalPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.legalPage.findUnique({ where: { slug } });
  if (!page) notFound();

  return (
    <>
      <PageHead eyebrow="Legal" h1={page.title} />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <article className="prose">
            {/* Safe: renderMarkdown escapes the source before producing any
                markup, and writes only the tags it generates itself. */}
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(page.bodyMarkdown) }} />
          </article>
          <p className="note" style={{ marginTop: '2rem' }}>
            Version {page.version} · in effect from {day(page.effectiveFrom)} · last updated{' '}
            {day(page.updatedAt)}
          </p>
        </div>
      </section>
    </>
  );
}
