/**
 * Parse the contents of a platform's "Share -> Copy link" action.
 *
 * A copied message often contains a caption, a shortened URL and trailing
 * punctuation. Both web and native use this parser; the server validates the
 * destination and resolves safe provider short links.
 */
/** Un même morceau YouTube possède des liens PC, application, Shorts, Live et Music.
 * Le serveur reçoit toujours le format vidéo canonique lorsqu'un identifiant sûr existe.
 * Ne modifie jamais les playlists ni les URL dont l'identifiant n'est pas reconnu.
 */
export function canonicalYouTubeMusicLink(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\\./, '');
    if (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com')) return value;
    const components = url.pathname.split('/').filter(Boolean);
    const videoId = host === 'youtu.be'
      ? components[0]
      : (url.searchParams.get('v') || (['shorts', 'live', 'embed', 'v'].includes(components[0]) ? components[1] : null));
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return value;
    return 'https://www.youtube.com/watch?v=' + videoId;
  } catch { return value; }
}

export function extractMusicShareLink(value: string): string | null {
  const text = String(value ?? '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!text) return null;

  // Spotify sometimes copies a native URI instead of a browser URL.
  const spotifyUri = text.match(/(?:^|\s)spotify:(track|album|playlist|artist):([a-zA-Z0-9]{10,40})(?=$|\s|[),;.!?])/i);
  if (spotifyUri) return `https://open.spotify.com/${spotifyUri[1].toLowerCase()}/${spotifyUri[2]}`;

  const match = text.match(/https?:\/\/[^\s<>"'«»]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[)\]},;.!?]+$/g, '').replace(/&amp;/gi, '&');
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return canonicalYouTubeMusicLink(url.toString());
  } catch {
    return null;
  }
}

/**
 * Normalize links copied from YouTube PC, iOS/Android, Shorts and YouTube Music.
 * Same video ID always reaches the same server cache and oEmbed resolver.
 * A playlist-only or clip link is NOT silently interpreted as a video.
 */
export function canonicalYouTubeMusicUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return raw;
    const host = url.hostname.toLowerCase();
    const isShort = host === 'youtu.be';
    const isYoutube = host === 'youtube.com' || host.endsWith('.youtube.com');
    if (!isShort && !isYoutube) return raw;
    const segments = url.pathname.split('/').filter(Boolean);
    const candidate = isShort
      ? segments[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : ['shorts', 'live', 'embed', 'v'].includes(segments[0] ?? '') ? segments[1] : null;
    if (!candidate || !/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return raw;
    return `https://www.youtube.com/watch?v=${candidate}`;
  } catch {
    return raw;
  }
}

/** Preserve plain artist/title input instead of mistakenly treating a caption as a link. */
export function parseMusicShareInput(value: string): { url: string; rawText: string } | { title: string } {
  const input = String(value ?? '').trim();
  const url = extractMusicShareLink(input);
  return url ? { url: canonicalYouTubeMusicUrl(url), rawText: input.slice(0, 1500) } : { title: input };
}
