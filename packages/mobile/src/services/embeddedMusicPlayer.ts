/**
 * Provider-owned embedded music player, shared by web and iOS/Android.
 * Accept the video's real ID, not a platform-specific desktop/mobile URL.
 * Never load arbitrary user-supplied pages in a WebView/iframe.
 */
export type EmbeddedMusicPlayer = {
  provider: 'YOUTUBE' | 'SPOTIFY' | 'DEEZER';
  url: string;
  label: string;
};

export function resolveEmbeddedMusicPlayer(raw: string | null | undefined): EmbeddedMusicPlayer | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host === 'youtube-nocookie.com';
    if (isYouTube) {
      const videoId = host === 'youtu.be' ? parts[0] :
        (url.searchParams.get('v') || (['shorts', 'live', 'embed', 'v'].includes(parts[0]) ? parts[1] : null));
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
      return { provider: 'YOUTUBE', url: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`, label: 'Vidéo YouTube dans Loki Music' };
    }
    if (host === 'open.spotify.com' && ['track', 'album', 'playlist', 'episode'].includes(parts[0])) {
      const id = parts[1];
      if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null;
      return { provider: 'SPOTIFY', url: `https://open.spotify.com/embed/${parts[0]}/${id}`, label: 'Lecteur Spotify dans Loki Music' };
    }
    if ((host === 'deezer.com' || host.endsWith('.deezer.com')) && parts[parts.length - 2] === 'track') {
      const id = parts[parts.length - 1];
      if (!/^\d{1,20}$/.test(id)) return null;
      return { provider: 'DEEZER', url: `https://widget.deezer.com/widget/dark/track/${id}`, label: 'Lecteur Deezer dans Loki Music' };
    }
  } catch {
    // Lien incomplet, raccourci non résolu ou protocole interdit.
  }
  return null;
}
