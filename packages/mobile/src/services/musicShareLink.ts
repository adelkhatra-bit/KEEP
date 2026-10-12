/**
 * Parse the contents of a platform's "Share -> Copy link" action.
 *
 * A copied message often contains a caption, a shortened URL and trailing
 * punctuation. Both web and native use this parser; the server validates the
 * destination and resolves safe provider short links.
 */
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
    return url.toString();
  } catch {
    return null;
  }
}

/** Preserve plain artist/title input instead of mistakenly treating a caption as a link. */
export function parseMusicShareInput(value: string): { url: string; rawText: string } | { title: string } {
  const input = String(value ?? '').trim();
  const url = extractMusicShareLink(input);
  return url ? { url, rawText: input.slice(0, 1500) } : { title: input };
}
