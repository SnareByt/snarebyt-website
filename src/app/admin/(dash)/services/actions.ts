'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';

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
