'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { INTAKE_KEYS } from '@/lib/service-intake';

export type PriceResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Money is a whole number of BDT, everywhere, always. Fractions are rejected
 * rather than rounded: a price that silently became ৳2,999.5 would print one
 * figure on the site and charge another at the gateway.
 *
 * The ceiling is a guard against a mistyped extra zero, not a business limit.
 */
const priceSchema = z.coerce
  .number({ message: 'Enter a number' })
  .int('Whole taka only — no decimals')
  .min(1, 'Price must be above zero')
  .max(1_000_000, 'That looks like a typo. Contact support if a package really costs this much.');

/** Change what one service package costs. */
export async function setServicePrice(tierId: string, formData: FormData): Promise<PriceResult> {
  const admin = await requireAdmin();

  const parsed = priceSchema.safeParse(formData.get('priceBdt'));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid price' };

  const tier = await prisma.serviceTier.findUnique({
    where: { id: tierId },
    include: { service: { select: { title: true } } },
  });
  if (!tier) return { ok: false, error: 'That package no longer exists.' };
  if (tier.priceBdt === parsed.data) return { ok: true, message: 'Unchanged.' };

  await prisma.serviceTier.update({ where: { id: tierId }, data: { priceBdt: parsed.data } });

  await audit({
    actorId: admin.id, action: 'service.price.changed', entity: 'ServiceTier', entityId: tierId,
    diff: { package: `${tier.service.title} — ${tier.name}`, from: tier.priceBdt, to: parsed.data },
  });

  // Already-placed orders are untouched: OrderItem froze its own price when the
  // order was created, so changing this never rewrites what someone already owes.
  revalidatePath('/admin/services');
  revalidatePath('/services');
  revalidatePath('/cart');
  return { ok: true, message: `Saved. ${tier.name} is now ৳${parsed.data.toLocaleString('en-US')}.` };
}

/** One line per entry. Blank lines are dropped rather than saved as empty bullets. */
const lines = (v: FormDataEntryValue | null): string[] =>
  String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

/**
 * Everything about a service except its packages.
 *
 * `slug` is deliberately NOT editable. It is in the public URL, in Google's
 * index, and in links customers already have; renaming it silently 404s every
 * one of them. Changing a service's web address is a different job from
 * editing its wording, and it should feel like one.
 */
const serviceSchema = z.object({
  title: z.string().trim().min(1, 'A service needs a name').max(80),
  tagline: z.string().trim().min(1, 'One line saying what this is').max(160),
  audience: z.string().trim().min(1, 'Say who this is for').max(200),
  deliveryDays: z.string().trim().min(1, 'How long it takes, e.g. "3–5 days"').max(60),
  revisions: z.string().trim().min(1, 'How many revisions are included').max(80),
});

export async function saveService(serviceId: string, formData: FormData): Promise<PriceResult> {
  const admin = await requireAdmin();

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };

  const before = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!before) return { ok: false, error: 'That service no longer exists.' };

  const data = {
    ...parsed.data,
    included: lines(formData.get('included')),
    required: lines(formData.get('required')),
  };

  await prisma.service.update({ where: { id: serviceId }, data });
  await audit({
    actorId: admin.id, action: 'service.updated', entity: 'Service', entityId: serviceId,
    diff: { slug: before.slug, from: { title: before.title, deliveryDays: before.deliveryDays }, to: data },
  });

  revalidatePath('/admin/services');
  revalidatePath('/services');
  revalidatePath(`/services/${before.slug}`);
  revalidatePath('/cart');
  return { ok: true, message: `Saved. ${data.title} is updated on the site.` };
}

/**
 * One package inside a service.
 *
 * Bangla is required, not optional, and that is a deliberate constraint rather
 * than an oversight: the schema makes `descriptionBn` non-nullable so that no
 * Bangladeshi buyer is ever shown an English-only description of what they are
 * paying for. Refusing an empty box here is what keeps that true.
 */
const tierSchema = z.object({
  name: z.string().trim().min(1, 'A package needs a name').max(60),
  description: z.string().trim().min(1, 'Say what this package includes').max(600),
  descriptionBn: z.string().trim().min(1, 'Bangla is required — a buyer must not be shown English only').max(600),
  priceBdt: z.coerce.number({ message: 'Enter a number' })
    .int('Whole taka only — no decimals')
    .min(1, 'Price must be above zero')
    .max(1_000_000, 'That looks like a typo.'),
});

export async function saveServiceTier(tierId: string, formData: FormData): Promise<PriceResult> {
  const admin = await requireAdmin();

  const parsed = tierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };

  const before = await prisma.serviceTier.findUnique({
    where: { id: tierId },
    include: { service: { select: { id: true, slug: true, title: true } } },
  });
  if (!before) return { ok: false, error: 'That package no longer exists.' };

  const recommended = formData.get('recommended') === 'on';

  // Only one package per service can carry the badge. Two "recommended"
  // options recommend nothing, so setting this clears the others rather than
  // leaving the page to pick one arbitrarily.
  if (recommended && !before.recommended) {
    await prisma.serviceTier.updateMany({
      where: { serviceId: before.service.id, id: { not: tierId } },
      data: { recommended: false },
    });
  }

  await prisma.serviceTier.update({
    where: { id: tierId },
    data: { ...parsed.data, recommended },
  });

  await audit({
    actorId: admin.id, action: 'service.tier.updated', entity: 'ServiceTier', entityId: tierId,
    diff: {
      package: `${before.service.title} — ${before.name}`,
      from: { name: before.name, priceBdt: before.priceBdt },
      to: { name: parsed.data.name, priceBdt: parsed.data.priceBdt, recommended },
    },
  });

  // Orders already placed are untouched: OrderItem froze its own title and
  // price at checkout, so editing this never rewrites what someone owes or
  // what they were told they were buying.
  revalidatePath('/admin/services');
  revalidatePath('/services');
  revalidatePath(`/services/${before.service.slug}`);
  revalidatePath('/cart');
  return { ok: true, message: `Saved. ${parsed.data.name} is now ৳${parsed.data.priceBdt.toLocaleString('en-US')}.` };
}

/**
 * Change what a service demands from the customer before it can be ordered.
 *
 * Unknown keys are dropped rather than stored, because a key nothing knows how
 * to render would be a required field the checkout cannot show — an order that
 * can never be completed and no visible reason why.
 */
export async function setServiceIntake(
  serviceId: string,
  formData: FormData,
): Promise<PriceResult> {
  const admin = await requireAdmin();

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return { ok: false, error: 'That service no longer exists.' };

  const chosen = INTAKE_KEYS.filter((k) => formData.get(`f:${k}`) === 'on');

  const before = [...service.intakeFields].sort().join(',');
  if (before === [...chosen].sort().join(',')) return { ok: true, message: 'Unchanged.' };

  await prisma.service.update({ where: { id: serviceId }, data: { intakeFields: chosen } });
  await audit({
    actorId: admin.id, action: 'service.intake.changed', entity: 'Service', entityId: serviceId,
    diff: { title: service.title, from: service.intakeFields, to: chosen },
  });

  // Orders already placed keep the brief they were asked for; this only
  // changes what the next customer is required to supply.
  revalidatePath('/admin/services');
  revalidatePath('/cart');
  return {
    ok: true,
    message: chosen.length
      ? `Saved. ${service.title} now asks for ${chosen.length} ${chosen.length === 1 ? 'thing' : 'things'} before it can be ordered.`
      : `Saved. ${service.title} can now be ordered without a brief.`,
  };
}

/** Show or hide an entire service on the public site. */
export async function toggleService(serviceId: string): Promise<PriceResult> {
  const admin = await requireAdmin();

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return { ok: false, error: 'That service no longer exists.' };

  await prisma.service.update({ where: { id: serviceId }, data: { active: !service.active } });
  await audit({
    actorId: admin.id, action: 'service.visibility', entity: 'Service', entityId: serviceId,
    diff: { title: service.title, active: !service.active },
  });

  revalidatePath('/admin/services');
  revalidatePath('/services');
  return {
    ok: true,
    message: service.active
      ? `${service.title} is now hidden from the site.`
      : `${service.title} is now visible on the site.`,
  };
}
