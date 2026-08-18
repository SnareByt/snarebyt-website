import 'server-only';
import { prisma } from './prisma';

/**
 * Whether the beat store is open.
 *
 * A Setting row rather than an environment variable, so Samir can close and
 * reopen the store himself without a deploy — the same rule the rest of this
 * project follows: if changing it needs a developer, it is not finished.
 *
 * Closed is opt-IN. A missing row means open, so a database hiccup can never
 * silently take the store offline.
 */
export async function beatStoreClosed(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: 'beatsComingSoon' } });
  return row?.value === 'true';
}
