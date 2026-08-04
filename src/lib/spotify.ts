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

/** Album players need more height than single-track players. */
export const embedHeight = (type: SpotifyRef['type']) => (type === 'track' ? 152 : 352);

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
