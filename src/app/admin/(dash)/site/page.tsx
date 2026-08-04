import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { SECTION_SPECS } from '@/lib/content-spec';
import { SiteEditor, type PageRow } from './SiteEditor';

export const dynamic = 'force-dynamic';

export default async function SiteEditorPage() {
  await requireAdmin();

  // Hidden sections are included here on purpose. The public site filters them
  // out; the editor must still show them, or a section switched off would
  // become impossible to switch back on.
  const pages = await prisma.page.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });

  const rows: PageRow[] = pages.map((p) => ({
    slug: p.slug,
    label: p.label,
    sections: p.sections.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      about: s.about,
      visible: s.visible,
      values: (s.values ?? {}) as Record<string, unknown>,
    })),
  }));

  const sectionCount = rows.reduce((n, p) => n + p.sections.length, 0);
  const hidden = rows.reduce((n, p) => n + p.sections.filter((s) => !s.visible).length, 0);

  return (
    <>
      <header><div><div className="crumb">Content</div><h1>Site editor</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{rows.length} pages · {sectionCount} sections</h2>
          {hidden ? <span className="chip off">{hidden} hidden</span> : <span className="chip ok">All showing</span>}
        </div>

        <SiteEditor pages={rows} specs={SECTION_SPECS} />

        <div className="note" style={{ marginTop: '1.6rem' }}>
          <span>✎</span>
          <span>
            <b>Edits go live as soon as you click away from a box.</b> There is no separate publish
            step for text. Before a big round of changes use <b>Save a version</b> — restoring one
            touches site content only, never beats, orders, projects or customers.
          </span>
        </div>
      </div>
    </>
  );
}
