import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';
import { SECTION_SPECS } from '@/lib/content-spec';

export const dynamic = 'force-dynamic';

/**
 * The seven public pages, as a list.
 *
 * Content editing is the one area where the phone is honestly the weaker
 * tool, and this screen says so rather than pretending otherwise. Fixing a
 * typo or swapping an image from a phone is genuinely useful; rewriting the
 * About page on a 6-inch screen is not, and the desktop dashboard is two taps
 * away on a laptop.
 */
export default async function ContentPage() {
  await requireAdmin();

  const pages = await prisma.page.findMany({
    orderBy: { slug: 'asc' },
    include: { sections: { select: { id: true, key: true, visible: true } } },
  });

  return (
    <>
      <NavBar title="Page content" back="/app/site" />

      <div className="big-title">
        <h2>Page content</h2>
        <p>{pages.length} pages</p>
      </div>

      <div className="wrap stack-lg">
        <div className="list">
          {pages.map((p) => {
            const hidden = p.sections.filter((s) => !s.visible).length;
            /* Only sections that have a spec are editable — the spec is the
               allow-list `updateField` enforces, so a section without one
               cannot be edited from anywhere, and counting it here would
               promise something the next screen cannot deliver. */
            const editable = p.sections.filter(
              (s) => (SECTION_SPECS[p.slug] ?? []).some((spec) => spec.key === s.key),
            ).length;

            return (
              <Link key={p.id} href={`/app/site/content/${p.slug}`} className="row">
                <div className="row-main">
                  <div className="row-t">{p.label}</div>
                  <div className="row-s">
                    /{p.slug === 'home' ? '' : p.slug} · {editable} editable section
                    {editable === 1 ? '' : 's'}
                    {hidden ? ` · ${hidden} hidden` : ''}
                  </div>
                </div>
                <span className="row-x"><IcNext /></span>
              </Link>
            );
          })}
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Every word on the site is a database row, so a change is live as soon as it
          saves. Hiding a section keeps its text — nothing is deleted.
        </p>
      </div>
    </>
  );
}
