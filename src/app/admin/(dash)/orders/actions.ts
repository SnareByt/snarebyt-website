'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { issueDownloadGrant } from '@/lib/storage';
import { siteUrl } from '@/lib/seo';

/**
 * Re-issue a download link for a purchased item.
 *
 * This exists because links expire and attempts run out, and a buyer whose
 * link died has still paid. It is the counterpart to there being no "mark as
 * paid" button: an admin may re-deliver what was bought, never decide that
 * something was bought.
 *
 * The order must actually be PAID. A pending order has no deliverable, and an
 * admin clicking through a list should not be able to hand out files that were
 * never paid for.
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
  if (item.order.status !== 'PAID') {
    return { ok: false, error: `This order is ${item.order.status.replace(/_/g, ' ').toLowerCase()}, so there is nothing to deliver yet.` };
  }

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
export async function revokeDownloadGrant(
  grantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const grant = await prisma.downloadGrant.findUnique({ where: { id: grantId } });
  if (!grant) return { ok: false, error: 'That link no longer exists.' };

  await prisma.downloadGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date() },
  });
  await audit({ action: 'download.revoked', entity: 'DownloadGrant', entityId: grantId, diff: {} });

  const item = await prisma.orderItem.findUnique({
    where: { id: grant.orderItemId }, select: { orderId: true },
  });
  if (item) revalidatePath(`/admin/orders/${item.orderId}`);
  return { ok: true };
}
