import 'server-only';
import { prisma } from './prisma';

/**
 * Reporting queries for the admin analytics screen.
 *
 * Buckets are computed in SQL rather than by pulling rows into Node and
 * grouping them there — a busy month is hundreds of thousands of rows, and
 * shipping those over the wire to count them would be slow and pointless.
 *
 * "Visitors" is always a COUNT(DISTINCT visitorId), never a row count. A
 * visitor id rotates daily, so a person who returns on three days counts as
 * three visitors over a week. That is a real limit of tracking without
 * cookies, and it is stated on the screen rather than hidden.
 */

export type Range = { from: Date; to: Date; label: string; bucket: 'hour' | 'day' };

export function rangeFor(key: string, fromISO?: string, toISO?: string): Range {
  const to = new Date();
  const day = 86_400_000;

  if (key === 'custom' && fromISO && toISO) {
    const from = new Date(`${fromISO}T00:00:00.000Z`);
    const end = new Date(`${toISO}T23:59:59.999Z`);
    const days = Math.max(1, Math.round((end.getTime() - from.getTime()) / day));
    return { from, to: end, label: `${fromISO} → ${toISO}`, bucket: days <= 2 ? 'hour' : 'day' };
  }

  switch (key) {
    case '24h': return { from: new Date(to.getTime() - day), to, label: 'Last 24 hours', bucket: 'hour' };
    case '3d': return { from: new Date(to.getTime() - 3 * day), to, label: 'Last 3 days', bucket: 'hour' };
    case '30d': return { from: new Date(to.getTime() - 30 * day), to, label: 'Last 30 days', bucket: 'day' };
    case '90d': return { from: new Date(to.getTime() - 90 * day), to, label: 'Last 90 days', bucket: 'day' };
    default: return { from: new Date(to.getTime() - 7 * day), to, label: 'Last 7 days', bucket: 'day' };
  }
}

export type Point = { t: string; views: number; visitors: number };
export type Row = { label: string; views: number; visitors?: number };

export type Report = {
  views: number;
  visitors: number;
  series: Point[];
  pages: Row[];
  referrers: Row[];
  countries: Row[];
  devices: Row[];
  /** Distinct visitors seen in the last five minutes. */
  live: number;
  liveViews: number;
  /** Same-length previous period, for the change figures. */
  prevViews: number;
  prevVisitors: number;
  bucket: 'hour' | 'day';
};

/** Fills gaps so a quiet hour draws a zero instead of vanishing from the axis. */
function fillSeries(rows: { t: Date; views: bigint; visitors: bigint }[], r: Range): Point[] {
  const step = r.bucket === 'hour' ? 3_600_000 : 86_400_000;
  const found = new Map(
    rows.map((x) => [new Date(x.t).toISOString(), { views: Number(x.views), visitors: Number(x.visitors) }]),
  );

  const out: Point[] = [];
  const start = new Date(r.from);
  if (r.bucket === 'hour') start.setUTCMinutes(0, 0, 0);
  else start.setUTCHours(0, 0, 0, 0);

  for (let t = start.getTime(); t <= r.to.getTime(); t += step) {
    const iso = new Date(t).toISOString();
    const hit = found.get(iso);
    out.push({ t: iso, views: hit?.views ?? 0, visitors: hit?.visitors ?? 0 });
  }
  return out;
}

export async function getReport(r: Range): Promise<Report> {
  const span = r.to.getTime() - r.from.getTime();
  const prevFrom = new Date(r.from.getTime() - span);
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);

  // date_trunc is parameterised through Prisma's tagged template, so the
  // bucket name cannot be injected — it is one of two literals either way.
  const seriesRows = r.bucket === 'hour'
    ? await prisma.$queryRaw<{ t: Date; views: bigint; visitors: bigint }[]>`
        SELECT date_trunc('hour', "createdAt") AS t,
               COUNT(*) AS views,
               COUNT(DISTINCT "visitorId") AS visitors
        FROM "PageView"
        WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
        GROUP BY 1 ORDER BY 1`
    : await prisma.$queryRaw<{ t: Date; views: bigint; visitors: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS t,
               COUNT(*) AS views,
               COUNT(DISTINCT "visitorId") AS visitors
        FROM "PageView"
        WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
        GROUP BY 1 ORDER BY 1`;

  const [totals, prev, live, pages, referrers, countries, devices] = await Promise.all([
    prisma.$queryRaw<{ views: bigint; visitors: bigint }[]>`
      SELECT COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}`,
    prisma.$queryRaw<{ views: bigint; visitors: bigint }[]>`
      SELECT COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageView" WHERE "createdAt" >= ${prevFrom} AND "createdAt" < ${r.from}`,
    prisma.$queryRaw<{ visitors: bigint; views: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${fiveMinAgo} AND "createdAt" <= now()`,
    prisma.$queryRaw<{ label: string; views: bigint; visitors: bigint }[]>`
      SELECT "path" AS label, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
    prisma.$queryRaw<{ label: string; views: bigint }[]>`
      SELECT COALESCE("referrer", 'Direct / none') AS label, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<{ label: string; views: bigint }[]>`
      SELECT COALESCE("country", '—') AS label, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<{ label: string; views: bigint }[]>`
      SELECT COALESCE("device", 'unknown') AS label, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
      GROUP BY 1 ORDER BY 2 DESC`,
  ]);

  const n = (v: bigint | undefined) => Number(v ?? 0);

  return {
    views: n(totals[0]?.views),
    visitors: n(totals[0]?.visitors),
    prevViews: n(prev[0]?.views),
    prevVisitors: n(prev[0]?.visitors),
    live: n(live[0]?.visitors),
    liveViews: n(live[0]?.views),
    series: fillSeries(seriesRows, r),
    pages: pages.map((x) => ({ label: x.label, views: n(x.views), visitors: n(x.visitors) })),
    referrers: referrers.map((x) => ({ label: x.label, views: n(x.views) })),
    countries: countries.map((x) => ({ label: x.label, views: n(x.views) })),
    devices: devices.map((x) => ({ label: x.label, views: n(x.views) })),
    bucket: r.bucket,
  };
}
