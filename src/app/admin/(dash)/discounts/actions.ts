'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { normaliseCode, isValidCodeFormat } from '@/lib/discount-rules';

export type CodeResult = { ok: true; message: string } | { ok: false; error: string };

/** Blank means "no limit", which is not the same as zero. */
const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number({ message: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} looks like a typo`)
      .nullable(),
  );

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.string().nullable(),
);

const schema = z.object({
  percentOff: optionalInt(1, 100, 'Percent off'),
  amountOffBdt: optionalInt(1, 1_000_000, 'Amount off'),
  minSpendBdt: optionalInt(1, 1_000_000, 'Minimum spend'),
  maxUses: optionalInt(1, 1_000_000, 'Total uses'),
  perUserLimit: optionalInt(1, 1_000, 'Uses per person'),
  startsAt: optionalDate,
  endsAt: optionalDate,
});

type Parsed = z.infer<typeof schema>;

/**
 * The two ways of shaping a discount are mutually exclusive.
 *
 * Both set would have to be resolved by some precedence rule, and a rule
 * nobody remembers is how a "20% off" code quietly gives ৳500 instead.
 */
function shapeErrors(d: Parsed): string | null {
  if (d.percentOff && d.amountOffBdt) {
    return 'Choose one: a percentage OR a fixed amount, not both.';
  }
  if (!d.percentOff && !d.amountOffBdt) {
    return 'Set either a percentage or a fixed amount off.';
  }
  if (d.startsAt && d.endsAt && new Date(d.startsAt) > new Date(d.endsAt)) {
    return 'The end date is before the start date.';
  }
  return null;
}

const toDate = (v: string | null) => (v ? new Date(v) : null);

/** Create a code. The code itself is fixed once made — it is printed on things. */
export async function createDiscount(_id: string, formData: FormData): Promise<CodeResult> {
  const admin = await requireAdmin();

  const code = normaliseCode(String(formData.get('code') ?? ''));
  if (!isValidCodeFormat(code)) {
    return {
      ok: false,
      error: 'Codes are 3–24 characters: letters, numbers and hyphens, e.g. LAUNCH25.',
    };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };

  const shape = shapeErrors(parsed.data);
  if (shape) return { ok: false, error: shape };

  const clash = await prisma.discountCode.findUnique({ where: { code } });
  if (clash) return { ok: false, error: `${code} already exists.` };

  const created = await prisma.discountCode.create({
    data: {
      code,
      percentOff: parsed.data.percentOff,
      amountOffBdt: parsed.data.amountOffBdt,
      minSpendBdt: parsed.data.minSpendBdt,
      maxUses: parsed.data.maxUses,
      perUserLimit: parsed.data.perUserLimit,
      startsAt: toDate(parsed.data.startsAt),
      endsAt: toDate(parsed.data.endsAt),
      active: formData.get('active') === 'on',
    },
  });

  await audit({
    actorId: admin.id, action: 'discount.created', entity: 'DiscountCode', entityId: created.id,
    diff: { code, percentOff: created.percentOff, amountOffBdt: created.amountOffBdt },
  });

  revalidatePath('/admin/discounts');
  return { ok: true, message: `${code} created.` };
}

/**
 * Edit a code.
 *
 * `usedCount` is never editable. It is the record of money already discounted,
 * and a figure an admin can type is not a record of anything.
 */
export async function updateDiscount(id: string, formData: FormData): Promise<CodeResult> {
  const admin = await requireAdmin();

  const before = await prisma.discountCode.findUnique({ where: { id } });
  if (!before) return { ok: false, error: 'That code no longer exists.' };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };

  const shape = shapeErrors(parsed.data);
  if (shape) return { ok: false, error: shape };

  // Lowering the cap below what has already been redeemed would make the code
  // read as over-used and stop working with no explanation.
  if (parsed.data.maxUses !== null && parsed.data.maxUses < before.usedCount) {
    return {
      ok: false,
      error: `${before.code} has already been used ${before.usedCount} times, so the limit cannot be lower than that.`,
    };
  }

  await prisma.discountCode.update({
    where: { id },
    data: {
      percentOff: parsed.data.percentOff,
      amountOffBdt: parsed.data.amountOffBdt,
      minSpendBdt: parsed.data.minSpendBdt,
      maxUses: parsed.data.maxUses,
      perUserLimit: parsed.data.perUserLimit,
      startsAt: toDate(parsed.data.startsAt),
      endsAt: toDate(parsed.data.endsAt),
      active: formData.get('active') === 'on',
    },
  });

  await audit({
    actorId: admin.id, action: 'discount.updated', entity: 'DiscountCode', entityId: id,
    diff: {
      code: before.code,
      from: { percentOff: before.percentOff, amountOffBdt: before.amountOffBdt, active: before.active },
      to: { percentOff: parsed.data.percentOff, amountOffBdt: parsed.data.amountOffBdt, active: formData.get('active') === 'on' },
    },
  });

  revalidatePath('/admin/discounts');
  revalidatePath('/cart');
  return { ok: true, message: `${before.code} saved.` };
}

/** Switch a code on or off. The fastest thing to want at 2am. */
export async function toggleDiscount(id: string): Promise<CodeResult> {
  const admin = await requireAdmin();

  const row = await prisma.discountCode.findUnique({ where: { id } });
  if (!row) return { ok: false, error: 'That code no longer exists.' };

  await prisma.discountCode.update({ where: { id }, data: { active: !row.active } });
  await audit({
    actorId: admin.id, action: 'discount.visibility', entity: 'DiscountCode', entityId: id,
    diff: { code: row.code, active: !row.active },
  });

  revalidatePath('/admin/discounts');
  revalidatePath('/cart');
  return {
    ok: true,
    message: row.active ? `${row.code} is off. It stops working now.` : `${row.code} is live.`,
  };
}

/**
 * Delete a code.
 *
 * Refused once it has been used. An order records WHICH code discounted it,
 * and deleting the row would leave a paid order saying it was reduced by
 * something that no longer exists — the receipt stops adding up. Switch it off
 * instead; that stops it working and keeps the history intact.
 */
export async function deleteDiscount(id: string): Promise<CodeResult> {
  const admin = await requireAdmin();

  const row = await prisma.discountCode.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!row) return { ok: false, error: 'That code no longer exists.' };

  if (row.usedCount > 0 || row._count.orders > 0) {
    return {
      ok: false,
      error: `${row.code} has been used on ${row._count.orders} order${row._count.orders === 1 ? '' : 's'}, so it cannot be deleted — the receipts refer to it. Switch it off instead.`,
    };
  }

  await prisma.discountCode.delete({ where: { id } });
  await audit({
    actorId: admin.id, action: 'discount.deleted', entity: 'DiscountCode', entityId: id,
    diff: { code: row.code },
  });

  revalidatePath('/admin/discounts');
  return { ok: true, message: `${row.code} deleted.` };
}
