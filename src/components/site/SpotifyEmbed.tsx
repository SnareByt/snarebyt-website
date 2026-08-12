import { embedUrl, embedHeight, type SpotifyRef } from '@/lib/spotify';

/**
 * A real Spotify player.
 *
 * This is why a released record needs no artwork upload: the embed serves
 * Spotify's own cover art and audio. Only IDs verified against Spotify's
 * oEmbed endpoint are ever stored — a guessed ID means someone else's song
 * playing on this site.
 *
 * The height comes from the track count, so a single published as a one-track
 * album gets the compact player instead of a tall one with an empty panel
 * under its only row. Callers group players of equal height together; mixing
 * both sizes in one grid is what made the section look ragged.
 */
export function SpotifyEmbed({
  type, id, title, trackCount,
}: {
  type: SpotifyRef['type'];
  id: string;
  title: string;
  trackCount?: number | null;
}) {
  const height = embedHeight(trackCount);
  return (
    <iframe
      title={`${title} on Spotify`}
      src={embedUrl({ type, id })}
      width="100%"
      height={height}
      // The iframe is told its height twice — the attribute for Spotify, and
      // the style so the grid row reserves exactly that space before the
      // player loads and nothing shifts underneath it.
      style={{ height, borderRadius: 14, border: 0, display: 'block' }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}
