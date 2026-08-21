'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';

export type SocialResult = { ok: true; message: string } | { ok: false; error: string };

/** http(s) only. A javascript: URL in a profile link is the obvious attack. */
const SAFE_HREF = /^https?:\/\/\S+$/i;

/**
 * Edit one profile link.
 *
 * These are NavItem rows in the SOCIAL group, the same rows the footer and the
 * contact page read. saveNav in the site editor deletes and recreates the
 * whole group, which would drop the icon assignments — so these actions update
 * rows in place instead, and never go near that path.
 */
export async function saveSocialLink(id: string, formData: FormData): Promise<SocialResult> {
  const admin = await requireAdmin();

  const label = String(formData.get('label') ?? '').trim().slice(0, 40);
  const href = String(formData.get('href') ?? '').trim();
  const visible = formData.get('visible') === 'on';

  if (!label) return { ok: false, error: 'Give the link a name — it is the icon’s label for screen readers.' };
  if (href && !SAFE_HREF.test(href)) {
    return { ok: false, error: 'The address must start with https:// and have no spaces.' };
  }

  const before = await prisma.navItem.findFirst({ where: { id, group: 'SOCIAL' } });
  if (!before) return { ok: false, error: 'That link no longer exists.' };

  await prisma.navItem.update({ where: { id }, data: { label, href, visible } });
  await audit({
    actorId: admin.id, action: 'social.updated', entity: 'NavItem', entityId: id,
    diff: { from: { label: before.label, href: before.href }, to: { label, href, visible } },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/social');
  return {
    ok: true,
    // An empty address is not an error — it is how a profile is parked. Said
    // out loud, because the link silently vanishing from the site otherwise
    // looks like the save failed.
    message: href ? `${label} saved.` : `${label} saved with no address, so it is hidden from the site.`,
  };
}

/** Point a link at an uploaded image, or clear it back to the built-in mark. */
export async function setSocialIcon(id: string, mediaId: string | null): Promise<SocialResult> {
  const admin = await requireAdmin();

  const link = await prisma.navItem.findFirst({ where: { id, group: 'SOCIAL' } });
  if (!link) return { ok: false, error: 'That link no longer exists.' };

  if (mediaId) {
    // Only an image, and only one that exists. A DOCUMENT or AUDIO id here
    // would render as a broken picture in the footer of every page.
    const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) return { ok: false, error: 'That upload could not be found. Try again.' };
    if (asset.kind !== 'IMAGE') return { ok: false, error: 'An icon has to be an image.' };
  }

  await prisma.navItem.update({ where: { id }, data: { iconMediaId: mediaId } });
  await audit({
    actorId: admin.id, action: mediaId ? 'social.icon.set' : 'social.icon.cleared',
    entity: 'NavItem', entityId: id, diff: { label: link.label, mediaId },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/social');
  return {
    ok: true,
    message: mediaId
      ? `Icon set for ${link.label}. It is live on the site now.`
      : `${link.label} is back to its built-in icon.`,
  };
}

/** Add a profile. Starts hidden-by-empty-address until one is filled in. */
export async function addSocialLink(): Promise<SocialResult> {
  const admin = await requireAdmin();

  const last = await prisma.navItem.findFirst({
    where: { group: 'SOCIAL' },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const created = await prisma.navItem.create({
    data: {
      group: 'SOCIAL',
      label: 'New profile',
      href: '',
      visible: true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await audit({ actorId: admin.id, action: 'social.created', entity: 'NavItem', entityId: created.id });
  revalidatePath('/admin/social');
  return { ok: true, message: 'Added. Give it a name and an address.' };
}

/** Remove a profile link entirely. The uploaded image stays in the library. */
export async function deleteSocialLink(id: string): Promise<SocialResult> {
  const admin = await requireAdmin();

  const link = await prisma.navItem.findFirst({ where: { id, group: 'SOCIAL' } });
  if (!link) return { ok: false, error: 'That link no longer exists.' };

  await prisma.navItem.delete({ where: { id } });
  await audit({
    actorId: admin.id, action: 'social.deleted', entity: 'NavItem', entityId: id,
    diff: { label: link.label, href: link.href },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/social');
  return { ok: true, message: `${link.label} removed. The uploaded image is still in Media.` };
}

/** Move one link up or down. The row order is the order on the site. */
export async function moveSocialLink(id: string, direction: 'up' | 'down'): Promise<SocialResult> {
  const admin = await requireAdmin();

  const all = await prisma.navItem.findMany({
    where: { group: 'SOCIAL' },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });

  const i = all.findIndex((x) => x.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= all.length) return { ok: false, error: 'That link cannot move any further.' };

  // Rewrite every row's sortOrder from the reordered list rather than swapping
  // two values. Seeded rows can share a sortOrder, and swapping two equal
  // numbers changes nothing — which reads as a button that does not work.
  const next = [...all];
  [next[i], next[j]] = [next[j], next[i]];

  await prisma.$transaction(
    next.map((row, order) => prisma.navItem.update({ where: { id: row.id }, data: { sortOrder: order } })),
  );

  await audit({ actorId: admin.id, action: 'social.reordered', entity: 'NavItem', entityId: id });
  revalidatePath('/', 'layout');
  revalidatePath('/admin/social');
  return { ok: true, message: 'Order saved.' };
}
