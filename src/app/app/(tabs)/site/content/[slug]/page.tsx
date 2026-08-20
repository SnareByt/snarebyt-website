import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { SECTION_SPECS } from '@/lib/content-spec';
import { SectionEditor } from './SectionEditor';

export const dynamic = 'force-dynamic';

/**
 * One page's sections.
 *
 * The spec decides what is editable, not the stored JSON. That is the same
 * allow-list `updateField` checks on save, so this screen can never offer a
 * field the server would refuse — and a crafted request cannot inject a key
 * that was never in the spec.
 */
export default async function PageContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;

  const page = await prisma.page.findUnique({
    where: { slug },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!page) notFound();

  const specs = SECTION_SPECS[slug] ?? [];

  const sections = page.sections
    .map((s) => {
      const spec = specs.find((sp) => sp.key === s.key);
      if (!spec) return null;
      return {
        id: s.id,
        key: s.key,
        // The row carries its own name and blurb; the spec is the fallback.
        // Preferring the row means a section renamed from the desktop reads
        // the same on the phone instead of reverting to the code's wording.
        name: s.name || spec.name,
        about: s.about || spec.about,
        visible: s.visible,
        // Only the simple scalar fields are offered on a phone. Lists and
        // media pickers need a bigger canvas than a sheet, and a half-working
        // list editor is worse than an honest pointer to the desktop.
        fields: spec.fields
          .filter((f) => ['text', 'area', 'bn', 'link', 'num'].includes(f.t))
          .map((f) => ({
            k: f.k,
            l: f.l,
            t: f.t,
            h: f.h ?? '',
            v: String((s.values as Record<string, unknown>)?.[f.k] ?? ''),
          })),
        skipped: spec.fields.filter((f) => !['text', 'area', 'bn', 'link', 'num'].includes(f.t)).length,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <>
      <NavBar title={page.label} back="/app/site/content" />
      <SectionEditor pageSlug={slug} pageTitle={page.label} sections={sections} />
    </>
  );
}
