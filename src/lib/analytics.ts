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
  /** City-level, where the edge could resolve one. Coarse and often absent. */
  cities: Row[];
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

  const [totals, prev, live, pages, referrers, countries, devices, cities] = await Promise.all([
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
    /* Rows with no city are excluded rather than gathered into an "unknown"
       bar. A VPN, a mobile carrier or a corporate gateway leaves it blank, and
       on a small site that blank would usually be the tallest bar on the
       chart — telling you nothing while crowding out the cities that are real.
       The screen reports how many were unplaceable instead. */
    prisma.$queryRaw<{ label: string; views: bigint }[]>`
      SELECT
        CASE
          WHEN "region" IS NULL OR "region" = '' THEN "city"
          ELSE "city" || ', ' || "region"
        END AS label,
        COUNT(*) AS views
      FROM "PageView"
      WHERE "createdAt" >= ${r.from} AND "createdAt" <= ${r.to}
        AND "city" IS NOT NULL AND "city" <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
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
    cities: cities.map((x) => ({ label: x.label, views: n(x.views) })),
    devices: devices.map((x) => ({ label: x.label, views: n(x.views) })),
    bucket: r.bucket,
  };
}

/* ============================================================
   The home-screen pulse
   ============================================================ */

export type PulsePoint = { day: string; money: number; visitors: number };

export type Pulse = {
  points: PulsePoint[];
  money: { total: number; prev: number };
  visitors: { total: number; prev: number };
  days: number;
};

/**
 * Fourteen days of money and visitors, for the card on Today.
 *
 * Deliberately NOT `getReport`. That runs eight queries — top pages, referrers,
 * countries, devices, a live count — because the analytics screen shows all of
 * it. Putting that behind the home screen would make the first thing Samir
 * opens the slowest thing in the app, to draw two lines.
 *
 * Two queries, both hitting an index, both grouped in SQL. A busy month is
 * hundreds of thousands of PageView rows and none of them need to reach Node.
 *
 * WHY THE TWO SERIES ARE NEVER DRAWN TOGETHER
 *
 * Revenue is thousands of taka; visitors are tens of people. Plotting both on
 * one chart needs two y-axes, and the alignment between two y-scales is
 * arbitrary — it invents a correlation that is not in the data ("look, traffic
 * spikes when sales do") purely from where the axes happen to be pinned. So
 * the card shows one series at a time and a control switches between them.
 * That is the reason for the toggle; it is not decoration.
 */
export async function getPulse(days = 14): Promise<Pulse> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);

  const [moneyRows, visitorRows, prevMoney, prevVisitors] = await Promise.all([
    /* Only orders SSLCOMMERZ validated server-side, keyed on paidAt rather
       than createdAt: an order placed on Monday and paid on Wednesday is
       Wednesday's revenue, because that is the day the money arrived. */
    prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "paidAt") AS day, SUM("totalBdt")::bigint AS total
      FROM "Order"
      WHERE "status" = 'PAID' AND "paidAt" >= ${from} AND "paidAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ day: Date; visitors: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(DISTINCT "visitorId") AS visitors
      FROM "PageView"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM("totalBdt"), 0)::bigint AS total FROM "Order"
      WHERE "status" = 'PAID' AND "paidAt" >= ${prevFrom} AND "paidAt" < ${from}`,
    prisma.$queryRaw<{ visitors: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors FROM "PageView"
      WHERE "createdAt" >= ${prevFrom} AND "createdAt" < ${from}`,
  ]);

  const num = (v: bigint | null | undefined) => Number(v ?? 0);
  const key = (d: Date) => d.toISOString().slice(0, 10);

  const moneyBy = new Map(moneyRows.map((r) => [key(r.day), num(r.total)]));
  const visitorsBy = new Map(visitorRows.map((r) => [key(r.day), num(r.visitors)]));

  /**
   * Every day gets a point, including the empty ones.
   *
   * SQL returns no row for a day with no orders. Plotting only the rows that
   * came back would draw a straight line between two sales a week apart and
   * make a quiet week look like steady trade — the chart would be lying about
   * the shape of the business. A zero is a fact and has to be drawn.
   */
  const points: PulsePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(to.getTime() - i * 86_400_000);
    const k = key(d);
    points.push({ day: k, money: moneyBy.get(k) ?? 0, visitors: visitorsBy.get(k) ?? 0 });
  }

  return {
    points,
    money: {
      total: points.reduce((n, p) => n + p.money, 0),
      prev: num(prevMoney[0]?.total),
    },
    visitors: {
      total: points.reduce((n, p) => n + p.visitors, 0),
      prev: num(prevVisitors[0]?.visitors),
    },
    days,
  };
}
