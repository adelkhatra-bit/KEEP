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


/**
 * Native WebViews do not reliably preserve custom Referer headers across the
 * YouTube iframe redirect chain. Error 153 is shown when YouTube receives no
 * usable HTTP Referer / client identity. Load a tiny document from Loki's
 * real public origin so WKWebView/Android WebView can send a valid referrer.
 * This is still YouTube's official player; Loki does not suppress its ads.
 */
export const LOKI_PUBLIC_ORIGIN = 'https://adelkhatra-bit.github.io';
export const LOKI_PUBLIC_BASE_URL = 'https://adelkhatra-bit.github.io/KEEP/';

export function buildNativeYouTubeEmbedDocument(
  player: EmbeddedMusicPlayer,
  options: { autoplay?: boolean; startSeconds?: number; endSeconds?: number } = {},
): { html: string; baseUrl: string } | null {
  if (player.provider !== 'YOUTUBE') return null;
  try {
    const url = new URL(player.url);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) return null;
    const videoId = url.pathname.split('/').filter(Boolean).at(-1) || '';
    if (!/^[\\w-]{11}$/.test(videoId)) return null;
    url.searchParams.set('origin', LOKI_PUBLIC_ORIGIN);
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('start', String(Math.max(0, Math.floor(options.startSeconds ?? 0))));
    if (options.endSeconds !== undefined) url.searchParams.set('end', String(Math.max(1, Math.floor(options.endSeconds))));
    if (options.autoplay) url.searchParams.set('autoplay', '1');
    else url.searchParams.delete('autoplay');
    const src = url.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#090713}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe id="loki-youtube-player" src="${src}" title="Lecteur YouTube dans Loki Music" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body>
</html>`;
    return { html, baseUrl: LOKI_PUBLIC_BASE_URL };
  } catch {
    return null;
  }
}
