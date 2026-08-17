'use server';

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';

export type Pulse = {
  live: number;
  liveViews: number;
  todayViews: number;
  todayVisitors: number;
  recent: { path: string; country: string | null; device: string | null; ago: string }[];
};

const ago = (d: Date) => {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

/**
 * The live figure, polled by the page every few seconds.
 *
 * "Live" is distinct visitors in the last five minutes — the same window every
 * analytics tool uses, because a page view is instantaneous and nobody is
 * "currently on the site" in any measurable sense.
 *
 * requireAdmin is not decoration: a server action is a public HTTP endpoint,
 * and without it anyone could poll a competitor's traffic.
 */
export async function getPulse(): Promise<Pulse> {
  await requireAdmin();

  const fiveMin = new Date(Date.now() - 5 * 60_000);
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);

  const [live, today, recent] = await Promise.all([
    prisma.$queryRaw<{ visitors: bigint; views: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${fiveMin} AND "createdAt" <= now()`,
    prisma.$queryRaw<{ visitors: bigint; views: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${midnight} AND "createdAt" <= now()`,
    prisma.pageView.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { path: true, country: true, device: true, createdAt: true },
    }),
  ]);

  return {
    live: Number(live[0]?.visitors ?? 0),
    liveViews: Number(live[0]?.views ?? 0),
    todayViews: Number(today[0]?.views ?? 0),
    todayVisitors: Number(today[0]?.visitors ?? 0),
    recent: recent.map((r) => ({
      path: r.path, country: r.country, device: r.device, ago: ago(r.createdAt),
    })),
  };
}
