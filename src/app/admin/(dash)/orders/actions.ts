'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { issueDownloadGrant } from '@/lib/storage';
import { siteUrl } from '@/lib/seo';
import { generateLicenceDocument } from '@/lib/licence-pdf';
import {
  canTransition, canRemoveItem, canRefund, canDelete, canDeliver,
  refundIsFull, type OrderFacts,
} from '@/lib/order-rules';

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * What an admin may and may not do to an order.
 *
 * An order is a financial record, so the edits are split by whether money has
 * moved. Contact details and notes are always editable — a mistyped WhatsApp
 * number is the single most common reason a paid customer never receives
 * anything. What was bought, and for how much, is frozen the moment it is paid.
 *
 * Nothing here can move an order INTO the paid state. That transition belongs
 * to a verified gateway callback and nowhere else, which is why there is no
 * "mark as paid" button anywhere in this admin.
 */

const contactSchema = z.object({
  billingName: z.string().trim().min(1, 'A name is required').max(120),
  billingEmail: z.string().trim().email('Enter a valid email').max(160),
  billingPhone: z.string().trim().max(40).optional().default(''),
  billingCountry: z.string().trim().max(80).optional().default(''),
  adminNote: z.string().trim().max(4000).optional().default(''),
});

/** Always allowed, paid or not. This is how a failed delivery gets fixed. */
export async function updateOrderContact(orderId: string, formData: FormData): Promise<Result> {
  await requireAdmin();

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }
  const d = parsed.data;

  const before = await prisma.order.findUnique({
    where: { id: orderId },
    select: { billingName: true, billingEmail: true, billingPhone: true, billingCountry: true },
  });
  if (!before) return { ok: false, error: 'That order no longer exists.' };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      billingName: d.billingName,
      billingEmail: d.billingEmail.toLowerCase(),
      billingPhone: d.billingPhone || null,
      billingCountry: d.billingCountry || null,
      adminNote: d.adminNote || null,
    },
  });

  await audit({
    action: 'order.contact.updated', entity: 'Order', entityId: orderId,
    diff: { before, after: { ...d, adminNote: undefined } },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: 'Customer details saved.' };
}

/**
 * Every decision below is made by src/lib/order-rules.ts, which knows nothing
 * about Prisma or auth and is therefore testable on its own. These functions
 * gather the facts, ask, and only then write.
 */
const facts = (o: {
  status: string; totalBdt?: number; items?: unknown[];
  refunds?: { amountBdt: number }[]; licences?: unknown[];
  payments?: { status: string }[];
}): OrderFacts => ({
  status: o.status,
  itemCount: o.items?.length ?? 0,
  totalBdt: o.totalBdt ?? 0,
  refundedBdt: (o.refunds ?? []).reduce((n, r) => n + r.amountBdt, 0),
  hasLicence: Boolean(o.licences?.length),
  hasValidatedPayment: (o.payments ?? []).some((p) => p.status === 'VALIDATED'),
});

export async function setOrderStatus(orderId: string, next: string): Promise<Result> {
  await requireAdmin();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, number: true },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };

  const verdict = canTransition(facts(order), next);
  if (!verdict.ok) return verdict;

  await prisma.order.update({ where: { id: orderId }, data: { status: next as never } });
  await audit({
    action: 'order.status.changed', entity: 'Order', entityId: orderId,
    diff: { number: order.number, from: order.status, to: next },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  return { ok: true, message: `Order marked ${next.replace(/_/g, ' ').toLowerCase()}.` };
}

/**
 * Remove a line from an order that has not been paid, and recompute the total.
 *
 * Refused once paid: the items are what the licence and the receipt describe,
 * and editing them afterwards would make our record disagree with what the
 * customer actually bought and can prove they bought.
 */
export async function removeOrderItem(itemId: string): Promise<Result> {
  await requireAdmin();

  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { id: true, status: true, items: { select: { id: true, priceBdt: true } } } } },
  });
  if (!item) return { ok: false, error: 'That item no longer exists.' };
  const verdict = canRemoveItem(facts(item.order));
  if (!verdict.ok) return verdict;

  const remaining = item.order.items.filter((i) => i.id !== itemId);
  const subtotal = remaining.reduce((n, i) => n + i.priceBdt, 0);

  await prisma.$transaction([
    prisma.orderItem.delete({ where: { id: itemId } }),
    prisma.order.update({
      where: { id: item.order.id },
      data: { subtotalBdt: subtotal, totalBdt: subtotal },
    }),
  ]);

  await audit({
    action: 'order.item.removed', entity: 'Order', entityId: item.order.id,
    diff: { item: item.titleSnapshot, priceBdt: item.priceBdt, newTotal: subtotal },
  });
  revalidatePath(`/admin/orders/${item.order.id}`);
  return { ok: true, message: 'Item removed and the total recalculated.' };
}

const refundSchema = z.object({
  amountBdt: z.coerce.number().int().positive('Enter an amount above zero'),
  reason: z.string().trim().min(3, 'Say why — this is the record of the refund').max(500),
});

/**
 * Record a refund against a paid order.
 *
 * This RECORDS a refund; it does not send money. SSLCOMMERZ refunds are issued
 * from their merchant panel, and pretending otherwise here would let an admin
 * believe a customer had been paid back when nothing had moved.
 *
 * A full refund undoes delivery: download links are revoked, and an exclusive
 * goes back on sale — otherwise a refunded beat stays off the store forever and
 * the buyer keeps working files they were paid back for.
 */
export async function recordRefund(orderId: string, formData: FormData): Promise<Result> {
  const admin = await requireOwner();

  const parsed = refundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the refund details.' };
  }
  const { amountBdt, reason } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { licenceTier: true } }, refunds: true },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  const f = facts(order);
  const verdict = canRefund(f, amountBdt);
  if (!verdict.ok) return verdict;

  const already = f.refundedBdt;
  const full = refundIsFull(f, amountBdt);

  await prisma.$transaction(async (tx) => {
    await tx.refund.create({
      data: { orderId, amountBdt, reason, issuedBy: admin.id },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });

    if (full) {
      await tx.downloadGrant.updateMany({
        where: { orderItemId: { in: order.items.map((i) => i.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (const item of order.items) {
        if (item.beatId && item.licenceTier?.isExclusive) {
          await tx.beat.update({
            where: { id: item.beatId },
            data: { status: 'PUBLISHED', exclusiveAvailable: true },
          });
        }
      }
    }
  });

  await audit({
    action: full ? 'order.refunded' : 'order.refunded.partial', entity: 'Order', entityId: orderId,
    diff: { number: order.number, amountBdt, reason, totalRefunded: already + amountBdt },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  return {
    ok: true,
    message: full
      ? 'Full refund recorded. Download links revoked and any exclusive is back on sale. Issue the money in the SSLCOMMERZ panel.'
      : 'Partial refund recorded. Issue the money in the SSLCOMMERZ panel.',
  };
}

/**
 * Delete an order outright.
 *
 * Only ever an order that no money reached. A paid order backs a licence
 * somebody holds, and deleting it would destroy the proof that they bought
 * what they own — the same reason a beat with sales is archived, not deleted.
 */
export async function deleteOrder(orderId: string): Promise<Result> {
  await requireOwner();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { id: true } },
      licences: { select: { id: true } },
      payments: { select: { status: true } },
      projects: { select: { id: true } },
    },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };

  const verdict = canDelete(facts(order));
  if (!verdict.ok) return verdict;

  const itemIds = order.items.map((i) => i.id);
  await prisma.$transaction([
    prisma.downloadLog.deleteMany({ where: { orderId } }),
    prisma.downloadGrant.deleteMany({ where: { orderItemId: { in: itemIds } } }),
    prisma.project.deleteMany({ where: { orderId } }),
    prisma.payment.deleteMany({ where: { orderId } }),
    prisma.order.delete({ where: { id: orderId } }),
  ]);

  await audit({
    action: 'order.deleted', entity: 'Order', entityId: orderId,
    diff: { number: order.number, status: order.status, items: itemIds.length },
  });
  revalidatePath('/admin/orders');
  return { ok: true, message: `Order ${order.number} deleted.` };
}

/**
 * Re-issue a download link for a purchased item.
 *
 * Links expire and attempts run out, and a buyer whose link died has still
 * paid. The counterpart to there being no "mark as paid" button: an admin may
 * re-deliver what was bought, never decide that something was bought.
 */
export async function reissueDownloadLink(
  orderItemId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: { select: { id: true, number: true, status: true } } },
  });
  if (!item) return { ok: false, error: 'That order item no longer exists.' };
  if (!item.beatId) return { ok: false, error: 'Only beat licences have download links.' };
  const verdict = canDeliver(facts(item.order));
  if (!verdict.ok) return verdict;

  const base = await siteUrl();
  if (!base) return { ok: false, error: 'The site address could not be determined.' };

  const url = await issueDownloadGrant(orderItemId, base);

  await audit({
    action: 'download.reissued', entity: 'OrderItem', entityId: orderItemId,
    diff: { order: item.order.number, title: item.titleSnapshot },
  });
  revalidatePath(`/admin/orders/${item.order.id}`);
  return { ok: true, url };
}

/** Kill a link that was shared too widely. The licence is untouched. */
export async function revokeDownloadGrant(grantId: string): Promise<Result> {
  await requireAdmin();

  const grant = await prisma.downloadGrant.findUnique({ where: { id: grantId } });
  if (!grant) return { ok: false, error: 'That link no longer exists.' };

  await prisma.downloadGrant.update({
    where: { id: grantId }, data: { revokedAt: new Date() },
  });
  await audit({ action: 'download.revoked', entity: 'DownloadGrant', entityId: grantId, diff: {} });

  const item = await prisma.orderItem.findUnique({
    where: { id: grant.orderItemId }, select: { orderId: true },
  });
  if (item) revalidatePath(`/admin/orders/${item.orderId}`);
  return { ok: true, message: 'Link revoked.' };
}

/** Generate or replace the immutable PDF for an already-paid licence. */
export async function regenerateLicencePdf(licenceId: string): Promise<Result> {
  await requireAdmin();
  const licence = await prisma.licenceDocument.findUnique({
    where: { id: licenceId },
    select: { number: true, orderId: true, order: { select: { status: true } } },
  });
  if (!licence) return { ok: false, error: 'That licence no longer exists.' };
  if (licence.order.status !== 'PAID') {
    return { ok: false, error: 'Licence PDFs can only be issued for paid orders.' };
  }
  try {
    const result = await generateLicenceDocument(licenceId);
    await audit({
      action: 'licence.pdf.generated', entity: 'LicenceDocument', entityId: licenceId,
      diff: { number: licence.number, sha256: result.signatureHash, bytes: result.bytes },
    });
    revalidatePath(`/admin/orders/${licence.orderId}`);
    return { ok: true, message: 'Licence PDF generated and stored securely.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'PDF generation failed.' };
  }
}
