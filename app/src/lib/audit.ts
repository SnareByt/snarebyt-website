import 'server-only';
import { prisma } from './prisma';

/**
 * Every write goes through here. When something looks wrong six
 * months from now, this is the only record of who changed what.
 */
export async function audit(opts: {
  actorId?: string | null;
  action: string;          // 'beat.update' | 'order.refund' | 'release.publish'
  entity: string;          // 'Beat' | 'Order'
  entityId: string;
  diff?: unknown;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId,
      diffJson: (opts.diff ?? null) as never,
      ip: opts.ip ?? null,
    },
  });
}

/** Simple database-backed rate limit. No Redis needed at this scale. */
export async function rateLimit(bucket: string, max: number, windowMs: number) {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { bucket } });

  if (!existing || existing.expiresAt < now) {
    await prisma.rateLimit.upsert({
      where: { bucket },
      create: { bucket, count: 1, expiresAt: new Date(now.getTime() + windowMs) },
      update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) },
    });
    return { ok: true, remaining: max - 1 };
  }
  if (existing.count >= max) return { ok: false, remaining: 0 };

  await prisma.rateLimit.update({ where: { bucket }, data: { count: { increment: 1 } } });
  return { ok: true, remaining: max - existing.count - 1 };
}
