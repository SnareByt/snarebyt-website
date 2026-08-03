'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { specFor } from '@/lib/content-spec';

/**
 * Every edit is a targeted patch of one section's JSON, not a full
 * document overwrite. Two tabs open at once therefore cannot silently
 * wipe each other's work.
 */

const PATHS: Record<string, string> = {
  home: '/', music: '/music', beats: '/beats', services: '/services',
  portfolio: '/portfolio', about: '/about', contact: '/contact',
};
function bust(slug: string) {
  revalidatePath(PATHS[slug] ?? `/${slug}`);
  revalidatePath('/admin/site');
}

/** Set one field. `path` is a dotted key: "proof.1.n" for list items. */
export async function updateField(input: {
  pageSlug: string; sectionKey: string; path: string; value: unknown;
}) {
  const user = await requireAdmin();

  const page = await prisma.page.findUnique({ where: { slug: input.pageSlug } });
  if (!page) return { ok: false as const, error: 'Unknown page' };

  const section = await prisma.pageSection.findUnique({
    where: { pageId_key: { pageId: page.id, key: input.sectionKey } },
  });
  if (!section) return { ok: false as const, error: 'Unknown section' };

  // The spec is the allow-list. An arbitrary key cannot be injected
  // into the JSON blob by a crafted request.
  const spec = specFor(input.pageSlug, input.sectionKey);
  const rootKey = input.path.split('.')[0];
  if (spec && !spec.fields.some((f) => f.k === rootKey)) {
    return { ok: false as const, error: `Unknown field "${rootKey}"` };
  }

  const values = { ...(section.values as Record<string, unknown>) };
  setPath(values, input.path, input.value);

  await prisma.pageSection.update({ where: { id: section.id }, data: { values: values as never } });
  await audit({ actorId: user.id, action: 'content.update', entity: 'PageSection',
    entityId: section.id, diff: { path: input.path } });

  bust(input.pageSlug);
  return { ok: true as const };
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let node: any = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (node[k] == null) node[k] = nextIsIndex ? [] : {};
    node = node[k];
  }
  node[parts[parts.length - 1]] = value;
}

/** Hide a whole block without deleting a word of it. */
export async function toggleSection(sectionId: string, visible: boolean) {
  const user = await requireAdmin();
  const sec = await prisma.pageSection.update({
    where: { id: sectionId }, data: { visible }, include: { page: true },
  });
  await audit({ actorId: user.id, action: visible ? 'content.section.show' : 'content.section.hide',
    entity: 'PageSection', entityId: sectionId });
  bust(sec.page.slug);
  return { ok: true as const };
}

export async function reorderSections(pageSlug: string, orderedIds: string[]) {
  const user = await requireAdmin();
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.pageSection.update({ where: { id }, data: { sortOrder: i } }))
  );
  await audit({ actorId: user.id, action: 'content.section.reorder', entity: 'Page', entityId: pageSlug });
  bust(pageSlug);
  return { ok: true as const };
}

export async function updateSeo(pageSlug: string, data: {
  seoTitle: string; seoDescription: string; ogImageId: string | null;
}) {
  const user = await requireAdmin();
  await prisma.page.update({ where: { slug: pageSlug }, data });
  await audit({ actorId: user.id, action: 'content.seo', entity: 'Page', entityId: pageSlug });
  bust(pageSlug);
  return { ok: true as const };
}

export async function setTheme(tokens: Record<string, string>) {
  const user = await requireAdmin();
  await prisma.$transaction(
    Object.entries(tokens).map(([key, value]) =>
      prisma.themeToken.upsert({ where: { key }, create: { key, value }, update: { value } })
    )
  );
  await audit({ actorId: user.id, action: 'content.theme', entity: 'ThemeToken', entityId: 'theme', diff: tokens });
  revalidatePath('/', 'layout'); // tokens live on <html>, so the whole tree
  return { ok: true as const };
}

export async function saveNav(group: 'MENU' | 'SOCIAL' | 'FOOTER',
  items: { id?: string; label: string; href: string; visible: boolean }[]) {
  const user = await requireAdmin();
  await prisma.$transaction([
    prisma.navItem.deleteMany({ where: { group } }),
    prisma.navItem.createMany({
      data: items.map((it, i) => ({ group, label: it.label, href: it.href, visible: it.visible, sortOrder: i })),
    }),
  ]);
  await audit({ actorId: user.id, action: 'content.nav', entity: 'NavItem', entityId: group });
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/* ---------------- versions ---------------- */

/** Snapshot all site content. Cheap insurance before a big edit. */
export async function saveVersion(summary: string) {
  const user = await requireAdmin();
  const [pages, theme, nav] = await Promise.all([
    prisma.page.findMany({ include: { sections: true } }),
    prisma.themeToken.findMany(),
    prisma.navItem.findMany(),
  ]);
  const rev = await prisma.contentRevision.create({
    data: { actorId: user.id, summary, snapshot: { pages, theme, nav } as never },
  });
  // Keep the last twelve; older ones are noise.
  const old = await prisma.contentRevision.findMany({ orderBy: { createdAt: 'desc' }, skip: 12, select: { id: true } });
  if (old.length) await prisma.contentRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  await audit({ actorId: user.id, action: 'content.version', entity: 'ContentRevision', entityId: rev.id });
  return { ok: true as const, id: rev.id };
}

/**
 * Restore content only. Beats, orders, projects and customers are
 * never part of a snapshot, so a rollback cannot destroy trading data.
 */
export async function restoreVersion(revisionId: string) {
  const user = await requireOwner();
  const rev = await prisma.contentRevision.findUnique({ where: { id: revisionId } });
  if (!rev) return { ok: false as const, error: 'Version not found' };

  const snap = rev.snapshot as unknown as {
    pages: { id: string; slug: string; seoTitle: string | null; seoDescription: string | null;
             ogImageId: string | null; sections: { id: string; values: unknown; visible: boolean; sortOrder: number }[] }[];
    theme: { key: string; value: string }[];
    nav: { group: 'MENU' | 'SOCIAL' | 'FOOTER'; label: string; href: string; visible: boolean; sortOrder: number }[];
  };

  await prisma.$transaction(async (tx) => {
    for (const p of snap.pages) {
      await tx.page.update({
        where: { id: p.id },
        data: { seoTitle: p.seoTitle, seoDescription: p.seoDescription, ogImageId: p.ogImageId },
      });
      for (const s of p.sections) {
        await tx.pageSection.update({
          where: { id: s.id },
          data: { values: s.values as never, visible: s.visible, sortOrder: s.sortOrder },
        });
      }
    }
    for (const t of snap.theme) {
      await tx.themeToken.upsert({ where: { key: t.key }, create: t, update: { value: t.value } });
    }
    await tx.navItem.deleteMany({});
    await tx.navItem.createMany({ data: snap.nav });
  });

  await audit({ actorId: user.id, action: 'content.restore', entity: 'ContentRevision', entityId: revisionId });
  revalidatePath('/', 'layout');
  return { ok: true as const };
}
