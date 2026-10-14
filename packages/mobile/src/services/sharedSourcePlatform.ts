/** Classify a user-pasted link for the existing metadata resolver, without fetching it. */
export function sharedSourcePlatformFromUrl(raw: string): 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'UNKNOWN' {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return 'UNKNOWN';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'YOUTUBE';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TIKTOK';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'INSTAGRAM';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') return 'FACEBOOK';
  } catch { /* plain text is not a link */ }
  return 'UNKNOWN';
}
