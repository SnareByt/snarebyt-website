import 'server-only';
import { prisma } from './prisma';

/**
 * Real channel statistics from the YouTube Data API v3.
 *
 * The accuracy rules for this site forbid invented numbers, so this returns
 * null — and the section renders nothing — unless every part is genuinely
 * configured and the API actually answered. There is no placeholder mode.
 *
 * The fetch is cached for an hour through Next's data cache. Channel stats
 * move slowly, YouTube's quota is finite, and a request per page view would
 * spend it for no benefit — "live" here means live data, not a socket.
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
};

export async function getYouTubeStats(): Promise<YtStats | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const setting = await prisma.setting.findUnique({ where: { key: 'youtubeChannel' } });
  const channel = setting?.value?.trim() || process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!channel) return null;

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'statistics,snippet');
  // Both forms Samir might paste: an @handle or a raw UC… id.
  if (channel.startsWith('@')) url.searchParams.set('forHandle', channel);
  else url.searchParams.set('id', channel);
  url.searchParams.set('key', key);

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiResponse;
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
  } catch {
    // An API outage must never take the home page down with it.
    return null;
  }
}

/** 1234 → "1.2K", 1_240_000 → "1.24M". The exact figure goes in the title attr. */
export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}
