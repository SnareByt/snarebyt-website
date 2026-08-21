'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';

export type LegalResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Terms, privacy, refunds — the pages that say what someone is agreeing to.
 *
 * `slug` is not editable and pages are not deletable from here. Every one of
 * these is linked from the cart's terms checkbox and from the licence; a page
 * that moves or disappears turns a checkbox someone ticked into a promise
 * nobody can read back. Adding a page is possible, removing one is not.
 */
const schema = z.object({
  title: z.string().trim().min(1, 'A page needs a title').max(120),
  bodyMarkdown: z.string().trim().min(1, 'An empty legal page is worse than none').max(60_000),
  version: z.string().trim().min(1, 'Give it a version, e.g. 1.1').max(20),
  effectiveFrom: z.string().trim().min(1, 'When does this version take effect?'),
});

export async function saveLegalPage(id: string, formData: FormData): Promise<LegalResult> {
  const admin = await requireAdmin();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };

  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) return { ok: false, error: 'That date could not be read.' };

  const before = await prisma.legalPage.findUnique({ where: { id } });
  if (!before) return { ok: false, error: 'That page no longer exists.' };

  // The lawyer-review flag is cleared deliberately and separately, never as a
  // side effect of an edit — otherwise saving a typo would silently mark an
  // unreviewed page as reviewed.
  const lawyerReviewNeeded = formData.get('lawyerReviewNeeded') === 'on';

  await prisma.legalPage.update({
    where: { id },
    data: {
      title: parsed.data.title,
      bodyMarkdown: parsed.data.bodyMarkdown,
      version: parsed.data.version,
      effectiveFrom,
      lawyerReviewNeeded,
    },
  });

  await audit({
    actorId: admin.id, action: 'legal.updated', entity: 'LegalPage', entityId: id,
    diff: {
      slug: before.slug,
      from: { version: before.version, length: before.bodyMarkdown.length },
      to: { version: parsed.data.version, length: parsed.data.bodyMarkdown.length, lawyerReviewNeeded },
    },
  });

  revalidatePath('/admin/legal');
  revalidatePath(`/legal/${before.slug}`);
  revalidatePath('/legal');
  return { ok: true, message: `Saved. ${parsed.data.title} v${parsed.data.version} is live.` };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Add a page. Slugs are fixed once created, for the reason above. */
export async function createLegalPage(_id: string, formData: FormData): Promise<LegalResult> {
  const admin = await requireAdmin();

  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const title = String(formData.get('title') ?? '').trim();

  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Web address: lowercase letters, numbers and hyphens only, e.g. refund-policy' };
  }
  if (!title) return { ok: false, error: 'Give the page a title' };

  const clash = await prisma.legalPage.findUnique({ where: { slug } });
  if (clash) return { ok: false, error: `There is already a page at /legal/${slug}.` };

  const page = await prisma.legalPage.create({
    data: {
      slug, title,
      bodyMarkdown: `# ${title}\n\nWrite this page before linking to it.`,
      // True by default and stated here rather than left implicit: a page
      // created in thirty seconds has certainly not been through a lawyer.
      lawyerReviewNeeded: true,
    },
  });

  await audit({
    actorId: admin.id, action: 'legal.created', entity: 'LegalPage', entityId: page.id,
    diff: { slug, title },
  });

  revalidatePath('/admin/legal');
  revalidatePath('/legal');
  return { ok: true, message: `Created /legal/${slug}. Write it before you link to it.` };
}
