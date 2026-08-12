/**
 * Turn a pasted Spotify URL into an embed type + id.
 *
 * This is the whole reason releases need no artwork upload: the
 * embed renders Spotify's own cover art and audio. Accepts the
 * localised URLs Spotify hands out (/intl-fr/track/...) and strips
 * any ?si= tracking parameter.
 */
export type SpotifyRef = { type: 'album' | 'track' | 'playlist'; id: string };

const RE =
  /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(album|track|playlist)\/([A-Za-z0-9]{22})/;

export function parseSpotifyUrl(input: string | null | undefined): SpotifyRef | null {
  if (!input) return null;
  const m = RE.exec(input.trim());
  if (!m) return null;
  return { type: m[1] as SpotifyRef['type'], id: m[2] };
}

export function embedUrl(ref: SpotifyRef) {
  return `https://open.spotify.com/embed/${ref.type}/${ref.id}?utm_source=oembed`;
}

/**
 * Player height, decided by how many tracks there are — NOT by whether the
 * link happens to be an /album/ or a /track/ URL.
 *
 * Several singles here are published on Spotify as one-track albums, so the
 * link is an album link. Sizing off the URL gave them the tall player, which
 * renders a single row and then a large empty panel underneath. Sizing off the
 * track count gives every one-track release the compact player, which is what
 * it actually is.
 */
export const FULL_PLAYER = 352;
export const COMPACT_PLAYER = 152;

export const embedHeight = (trackCount?: number | null) =>
  (trackCount ?? 1) > 1 ? FULL_PLAYER : COMPACT_PLAYER;

/** True when a release earns the tall player with its tracklist. */
export const isFullPlayer = (trackCount?: number | null) => (trackCount ?? 1) > 1;

/**
 * Optional: confirm the link is what the user thinks it is before
 * saving. oEmbed is public, needs no API key, and returns the real
 * title — which is how we caught that one "album" ID being TOO TOXIC
 * and KATSUKI actually belonging to WRONG TAPE.
 */
export async function verifySpotify(ref: SpotifyRef): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const r = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/${ref.type}/${ref.id}`,
      { next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; thumbnail_url?: string };
    return { title: j.title ?? '', thumbnail: j.thumbnail_url ?? '' };
  } catch {
    return null;
  }
}
