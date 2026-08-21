'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { portfolioSchema } from '@/lib/validators';
import { serialiseOrder } from '@/lib/portfolio-order';

/**
 * Production credits.
 *
 * New — the Portfolio screen has been read-only since it was built, so adding
 * a credit meant editing the seed and redeploying. `portfolioSchema` already
 * existed and already made `role` required; this is what finally enforces it
 * on a real write.
 *
 * That requirement is the whole point of this file. A credit card cannot
 * render without stating exactly what SnareByt did, which is what stops a mix
 * credit ever being displayed as a production credit. Kotha Ko is mixed and
 * mastered for SHEZAN; Awaaz Utha is produced. Those are not interchangeable,
 * and getting one wrong is a claim about someone else's record.
 */

export type Result = { ok: true; message?: string } | { ok: false; errors: Record<string, string> };

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function savePortfolioItem(formData: FormData): Promise<Result> {
  const admin = await requireAdmin();

  const parsed = portfolioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
    return { ok: false, errors };
  }
  const d = parsed.data;

  const data = {
    title: d.title,
    clientName: d.clientName,
    category: d.category,
    role: d.role,
    externalUrl: d.externalUrl || null,
    videoUrl: d.videoUrl || null,
    ctaLabel: d.ctaLabel,
    majorCredit: d.majorCredit,
    summary: d.summary,
    published: d.published,
  };

  let item;
  if (d.id) {
    const existing = await prisma.portfolioItem.findUnique({
      where: { id: d.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, errors: { _: 'That credit no longer exists.' } };
    item = await prisma.portfolioItem.update({ where: { id: d.id }, data });
  } else {
    // Two credits can legitimately share a title — the same song mixed and
    // produced, or two different artists' tracks with the same name. The slug
    // is unique, so without this a second one throws a raw Prisma constraint
    // error at someone who has done nothing wrong.
    const base = slugify(d.title) || 'credit';
    let slug = base;
    for (let n = 2; await prisma.portfolioItem.findUnique({ where: { slug }, select: { id: true } }); n++) {
      slug = `${base}-${n}`;
    }
    item = await prisma.portfolioItem.create({ data: { ...data, slug } });
  }

  await audit({
    actorId: admin.id, action: d.id ? 'portfolio.update' : 'portfolio.create',
    entity: 'PortfolioItem', entityId: item.id, diff: data,
  });

  revalidatePath('/admin/portfolio');
  revalidatePath('/app/portfolio');
  revalidatePath('/portfolio');
  revalidatePath('/');
  return { ok: true, message: 'Saved.' };
}

export type ToggleResult = { ok: true; message: string } | { ok: false; error: string };

/** Show or hide a credit on the public site. */
export async function togglePortfolioPublished(id: string): Promise<ToggleResult> {
  const admin = await requireAdmin();

  const item = await prisma.portfolioItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: 'That credit no longer exists.' };

  // The schema makes role required, but a row seeded before that rule existed
  // could still be blank. Refusing here means an unlabelled credit can never
  // reach the public site, whatever route it took into the database.
  if (!item.published && !item.role.trim()) {
    return {
      ok: false,
      error: 'This credit has no role. Say exactly what SnareByt did before publishing it — a mix credit shown as a production credit is a false claim about someone else’s record.',
    };
  }

  await prisma.portfolioItem.update({
    where: { id }, data: { published: !item.published },
  });
  await audit({
    actorId: admin.id, action: 'portfolio.published.changed',
    entity: 'PortfolioItem', entityId: id,
    diff: { title: item.title, to: !item.published },
  });

  revalidatePath('/admin/portfolio');
  revalidatePath('/app/portfolio');
  revalidatePath('/portfolio');
  revalidatePath('/');
  return {
    ok: true,
    message: item.published ? `${item.title} is now hidden.` : `${item.title} is now on the site.`,
  };
}

export async function deletePortfolioItem(id: string): Promise<ToggleResult> {
  const admin = await requireOwner();

  const item = await prisma.portfolioItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: 'That credit no longer exists.' };

  await prisma.portfolioItem.delete({ where: { id } });
  await audit({
    actorId: admin.id, action: 'portfolio.delete', entity: 'PortfolioItem', entityId: id,
    diff: { title: item.title, role: item.role },
  });

  revalidatePath('/admin/portfolio');
  revalidatePath('/app/portfolio');
  revalidatePath('/portfolio');
  return { ok: true, message: `${item.title} deleted.` };
}

/**
 * The order the portfolio's sections appear in on the public page.
 *
 * Stored as one Setting row rather than a column on each category, because
 * the categories are an enum — there is no row to hang a sortOrder on. The
 * value is normalised through serialiseOrder before it is written, so what
 * lands in the database is always a complete, deduplicated list even if the
 * browser sent something odd.
 */
export async function setPortfolioOrder(order: string[]): Promise<ToggleResult> {
  const admin = await requireAdmin();

  if (!Array.isArray(order)) return { ok: false, error: 'That order could not be read.' };

  const value = serialiseOrder(order);

  await prisma.setting.upsert({
    where: { key: 'portfolioOrder' },
    update: { value },
    create: { key: 'portfolioOrder', value },
  });

  await audit({
    actorId: admin.id, action: 'portfolio.reordered', entity: 'Setting', entityId: 'portfolioOrder',
    diff: { order: value },
  });

  revalidatePath('/admin/portfolio');
  revalidatePath('/portfolio');
  revalidatePath('/');
  return { ok: true, message: 'Order saved.' };
}
