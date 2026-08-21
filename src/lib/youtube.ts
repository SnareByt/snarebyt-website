import 'server-only';
import { prisma } from './prisma';

/**
 * Real channel statistics from the YouTube Data API v3.
 *
 * The accuracy rules for this site forbid invented numbers, so this returns
 * null — and the section renders nothing — unless every part is genuinely
 * configured and the API actually answered. There is no placeholder mode.
 *
 * The API key stays server-side. The browser only ever receives the two
 * numbers, already formatted.
 */

export type YtStats = {
  subscribers: number;
  views: number;
  videos: number;
  title: string;
  url: string;
  /** YouTube hides subscriber counts on some channels; respect that. */
  subscribersHidden: boolean;
};

type ApiResponse = {
  items?: {
    id?: string;
    snippet?: { title?: string; customUrl?: string };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      videoCount?: string;
    };
  }[];
  error?: { code?: number; message?: string; errors?: { reason?: string }[] };
};

/** Resolved once so the page and the diagnostic can never disagree. */
async function resolveChannel(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: 'youtubeChannel' } });
  return setting?.value?.trim() || process.env.YOUTUBE_CHANNEL_ID?.trim() || null;
}

function buildUrl(channel: string, key: string): URL {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'statistics,snippet');
  // Both forms Samir might paste: an @handle or a raw UC… id.
  if (channel.startsWith('@')) url.searchParams.set('forHandle', channel);
  else url.searchParams.set('id', channel);
  url.searchParams.set('key', key);
  return url;
}

function toStats(data: ApiResponse): YtStats | null {
  const item = data.items?.[0];
  if (!item?.statistics) return null;
  const s = item.statistics;
  return {
    subscribers: Number(s.subscriberCount ?? 0),
    views: Number(s.viewCount ?? 0),
    videos: Number(s.videoCount ?? 0),
    title: item.snippet?.title ?? '',
    url: item.snippet?.customUrl
      ? `https://www.youtube.com/${item.snippet.customUrl}`
      : `https://www.youtube.com/channel/${item.id ?? ''}`,
    subscribersHidden: Boolean(s.hiddenSubscriberCount),
  };
}

export async function getYouTubeStats(): Promise<YtStats | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const channel = await resolveChannel();
  if (!channel) return null;

  try {
    // Ten minutes, not an hour. Next caches the fetch RESPONSE whatever its
    // status, so a single 403 from a half-configured key would otherwise keep
    // the section hidden long after the key was fixed. Channel stats barely
    // move, and 144 calls a day is nothing against a 10,000-unit quota.
    const res = await fetch(buildUrl(channel, key), { next: { revalidate: 600 } });
    if (!res.ok) return null;
    return toStats((await res.json()) as ApiResponse);
  } catch {
    // An API outage must never take the home page down with it.
    return null;
  }
}

export type YtDiagnosis =
  | { ok: true; stats: YtStats }
  | { ok: false; problem: string; fix: string };

/**
 * Why the home page strip is or is not showing, in plain language.
 *
 * Deliberately uncached and deliberately specific: "it does not work" is not
 * something anyone can act on, and the three real causes — no key, a key
 * restricted to the wrong thing, a channel the API cannot find — all look
 * identical from the outside. The key itself is never returned, only whether
 * one exists.
 */
export async function diagnoseYouTube(): Promise<YtDiagnosis> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return {
      ok: false,
      problem: 'No API key is set on the server.',
      fix: 'Add YOUTUBE_API_KEY in Vercel → Settings → Environment Variables (tick Production), then redeploy. A variable only reaches a build that starts after it is saved.',
    };
  }

  const channel = await resolveChannel();
  if (!channel) {
    return {
      ok: false,
      problem: 'No channel is set.',
      fix: 'Enter your @handle or UC… channel id in the field above and save.',
    };
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(channel, key), { cache: 'no-store' });
  } catch (e) {
    return { ok: false, problem: `Could not reach YouTube: ${String(e)}`, fix: 'Try again in a moment.' };
  }

  const data = (await res.json().catch(() => ({}))) as ApiResponse;

  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason ?? '';
    const message = data.error?.message ?? `HTTP ${res.status}`;

    if (res.status === 403 && /blocked|referer|restrict/i.test(`${reason} ${message}`)) {
      return {
        ok: false,
        problem: `YouTube refused the key: ${message}`,
        fix: 'The key is restricted to a website or IP. Calls come from the server, which sends no referer and has no fixed IP. In Google Cloud → Credentials → your key, set Application restrictions to "None" and keep API restrictions limited to YouTube Data API v3.',
      };
    }
    if (res.status === 403 && /disabled|not been used|SERVICE_DISABLED/i.test(message)) {
      return {
        ok: false,
        problem: `The API is not enabled for this key's project: ${message}`,
        fix: 'In Google Cloud, make sure YouTube Data API v3 is enabled in the SAME project the key belongs to.',
      };
    }
    if (res.status === 403 && /quota/i.test(`${reason} ${message}`)) {
      return { ok: false, problem: 'Daily YouTube quota exceeded.', fix: 'It resets at midnight Pacific time.' };
    }
    if (res.status === 400) {
      return {
        ok: false,
        problem: `YouTube rejected the request: ${message}`,
        fix: 'The API key is probably malformed or truncated. Copy it again from Google Cloud → Credentials.',
      };
    }
    return { ok: false, problem: `YouTube returned ${res.status}: ${message}`, fix: 'Check the key in Google Cloud → Credentials.' };
  }

  const stats = toStats(data);
  if (!stats) {
    return {
      ok: false,
      problem: `The API answered, but found no channel matching "${channel}".`,
      fix: 'Check the handle or channel id. A UC… id is the most reliable — it is in your YouTube Studio URL.',
    };
  }

  return { ok: true, stats };
}

/** 1234 → "1.2K", 1_240_000 → "1.24M". The exact figure goes in the title attr. */
export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}

/* ------------------------------------------------------------------ *
 *  Per-video statistics
 * ------------------------------------------------------------------ */

export type YtVideoStats = { views: number; published: string | null };

type VideoApiResponse = {
  items?: { id?: string; statistics?: { viewCount?: string }; snippet?: { publishedAt?: string } }[];
};

/**
 * View counts for a set of video ids, from YouTube itself.
 *
 * The project's rule is that no statistic appears on this site unless it can
 * be sourced, so this is the only way a view count is allowed to be shown. A
 * missing id simply does not appear in the result and its card shows nothing
 * — an absent number is honest, an invented one is not.
 *
 * One request for up to fifty ids rather than one per video: the API takes a
 * comma-separated list, and a portfolio page would otherwise spend a quota
 * unit per card on every revalidation.
 */
export async function getVideoStats(ids: string[]): Promise<Map<string, YtVideoStats>> {
  const out = new Map<string, YtVideoStats>();

  const key = process.env.YOUTUBE_API_KEY;
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (!key || !unique.length) return out;

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'statistics,snippet');
  url.searchParams.set('id', unique.join(','));
  url.searchParams.set('key', key);

  try {
    // An hour. View counts move slowly enough that fresher is pointless, and
    // this runs on a page a search engine may crawl repeatedly.
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return out;

    const data = (await res.json()) as VideoApiResponse;
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      const views = Number(item.statistics?.viewCount ?? NaN);
      // A video with statistics disabled reports no viewCount at all. Better
      // to show nothing than to print a zero that reads as "nobody watched".
      if (!Number.isFinite(views)) continue;
      out.set(item.id, { views, published: item.snippet?.publishedAt ?? null });
    }
    return out;
  } catch {
    // The portfolio must render with or without YouTube being reachable.
    return out;
  }
}
