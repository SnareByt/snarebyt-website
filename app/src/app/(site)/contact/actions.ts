'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/audit';
import { briefSchema } from '@/lib/validators';

export type BriefState = {
  ok: boolean;
  number?: string;
  errors?: Record<string, string>;
  message?: string;
  /**
   * What was submitted, echoed back so a rejected form can be re-rendered
   * with the answers still in it. Without this, missing one required field
   * throws away everything the person typed â€” and a project brief is long.
   */
  values?: Record<string, string>;
  /**
   * Increments on every submission. The form uses it as a React key so the
   * inputs remount and pick up the echoed values â€” `defaultValue` is only
   * read on mount, so without this the re-render would show a blank form.
   */
  attempt: number;
};

/**
 * Public project brief â†’ a Project row in the admin pipeline.
 *
 * A server action is a public HTTP endpoint, so nothing here trusts the
 * browser: the payload is re-validated with zod regardless of what the form
 * checked, and the submission is rate limited per IP.
 *
 * No payment is taken at this step. The deposit is requested from the admin
 * once the quote is agreed.
 */
export async function submitBrief(prev: BriefState, formData: FormData): Promise<BriefState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );

  // Five briefs per IP per hour. Enough for a genuine person who makes a
  // mistake, not enough to be worth automating.
  const limit = await rateLimit(`brief:ip:${ip}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      attempt,
      values,
      message: 'Too many submissions from this connection. Try again in an hour.',
    };
  }

  const parsed = briefSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, attempt, errors, values };
  }
  const d = parsed.data;

  // The service must exist and be active â€” a crafted request cannot attach a
  // brief to an arbitrary id.
  const service = await prisma.service.findFirst({
    where: { id: d.serviceId, active: true },
    select: { id: true },
  });
  if (!service) return { ok: false, attempt, errors: { serviceId: 'Choose a service' }, values };

  const year = new Date().getUTCFullYear();
  const count = await prisma.project.count();
  const number = `PRJ-${year}-${String(count + 1).padStart(6, '0')}`;

  const project = await prisma.project.create({
    data: {
      number,
      serviceId: service.id,
      contactName: d.name,
      artistName: d.artistName || null,
      email: d.email.toLowerCase(),
      phone: d.phone || null,
      country: d.country || null,
      projectTitle: d.projectTitle || null,
      genre: d.genre || null,
      referenceLinks: d.referenceLinks
        ? d.referenceLinks.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      description: d.description,
      deadline: d.deadline,
      budgetBdt: d.budgetBdt,
      formatsWanted: d.formatsWanted || null,
      // Enquiry type has no column of its own; it belongs with the brief.
      notes: `Enquiry type: ${d.enquiryType}`,
      status: 'ORDER_RECEIVED',
    },
    select: { id: true, number: true },
  });

  await prisma.projectEvent.create({
    data: { projectId: project.id, status: 'ORDER_RECEIVED', note: 'Submitted through the website' },
  });

  return { ok: true, attempt, number: project.number };
}

