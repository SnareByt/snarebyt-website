import { embedUrl, embedHeight, type SpotifyRef } from '@/lib/spotify';

/**
 * A real Spotify player.
 *
 * This is why a released record needs no artwork upload: the embed serves
 * Spotify's own cover art and audio. Only IDs verified against Spotify's
 * oEmbed endpoint are ever stored — a guessed ID means someone else's song
 * playing on this site.
 */
export function SpotifyEmbed({ type, id, title }: { type: SpotifyRef['type']; id: string; title: string }) {
  return (
    <iframe
      title={`${title} on Spotify`}
      src={embedUrl({ type, id })}
      width="100%"
      height={embedHeight(type)}
      style={{ borderRadius: 14, border: 0, display: 'block' }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}
