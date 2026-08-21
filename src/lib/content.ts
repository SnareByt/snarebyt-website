import 'server-only';
import { cache } from 'react';
import { prisma } from './prisma';
import { publicUrl } from './storage';

/**
 * Public-site content readers.
 *
 * Wrapped in React's `cache` so a page that reads six sections still
 * makes one query per request, not six. `revalidatePath` in the admin
 * actions is what pushes an edit live.
 */

export type SectionValues = Record<string, unknown>;

export const getPage = cache(async (slug: string) => {
  return prisma.page.findUnique({
    where: { slug },
    include: {
      ogImage: true,
      sections: { where: { visible: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
});

/** Values for one section, or {} if it has been hidden or never created. */
export const getSection = cache(async (pageSlug: string, key: string): Promise<SectionValues> => {
  const page = await getPage(pageSlug);
  const sec = page?.sections.find((s) => s.key === key);
  return (sec?.values as SectionValues) ?? {};
});

/** Media fields store an id. Resolve it to a public URL at render time. */
export const getMedia = cache(async (id: string | null | undefined) => {
  if (!id) return null;
  const m = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!m) return null;
  return { ...m, url: `${process.env.R2_PUBLIC_BASE_URL}/${m.objectKey}`, bytes: Number(m.bytes) };
});

/** Brand tokens, with the original design as the fallback. */
export const getTheme = cache(async () => {
  const rows = await prisma.themeToken.findMany();
  const t = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    red: t.red ?? '#E01B36',
    ink: t.ink ?? '#040405',
    text: t.text ?? '#F4F4F6',
    radius: Number(t.radius ?? 18),
    motion: (t.motion ?? 'true') === 'true',
    grain: (t.grain ?? 'true') === 'true',
    displayFont: t.displayFont ?? 'Syne',
  };
});

/** Turn the theme into CSS custom properties for the <html> tag. */
export function themeStyle(t: Awaited<ReturnType<typeof getTheme>>): React.CSSProperties {
  return {
    ['--red' as string]: t.red,
    ['--ink' as string]: t.ink,
    ['--text' as string]: t.text,
    ['--radius' as string]: `${t.radius}px`,
  };
}

export const getNav = cache(async (group: 'MENU' | 'SOCIAL' | 'FOOTER') => {
  const items = await prisma.navItem.findMany({
    where: { group, visible: true },
    orderBy: { sortOrder: 'asc' },
    include: { icon: { select: { objectKey: true } } },
  });
  // An empty href is force-hidden so an unfinished profile never
  // renders as a dead icon.
  return items
    .filter((i) => i.href.trim() !== '')
    .map((i) => ({
      ...i,
      // Resolved here rather than at each call site, so the footer and the
      // contact page cannot disagree about where an icon lives.
      iconUrl: i.icon ? publicUrl(i.icon.objectKey) : null,
    }));
});
