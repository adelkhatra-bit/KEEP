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
    const pathParts = url.pathname.split('/').filter(Boolean);
    const videoId = pathParts[pathParts.length - 1] || '';
    if (!/^[\\w-]{11}$/.test(videoId)) return null;
    const start = Math.max(0, Math.floor(options.startSeconds ?? 0));
    const end = options.endSeconds === undefined ? undefined : Math.max(start + 1, Math.floor(options.endSeconds));
    const playerVars = {
      autoplay: options.autoplay ? 1 : 0,
      controls: 1,
      enablejsapi: 1,
      playsinline: 1,
      rel: 0,
      start,
      ...(end === undefined ? {} : { end }),
      origin: LOKI_PUBLIC_ORIGIN,
    };
    const config = JSON.stringify({ videoId, playerVars });
    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body,#loki-youtube-player{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#090713}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<div id="loki-youtube-player" aria-label="Lecteur YouTube dans Loki Music"></div>
<script>
(function () {
  var config = ${JSON.stringify(config)};
  window.onYouTubeIframeAPIReady = function () {
    try {
      var settings = JSON.parse(config);
      settings.events = { onError: function (event) {
        try {
          var message = JSON.stringify({ type: 'youtube-error', code: event.data });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(message);
        } catch (_) {}
      }};
      new YT.Player('loki-youtube-player', settings);
    } catch (_) {}
  };
}());
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>`;
    return { html, baseUrl: LOKI_PUBLIC_BASE_URL };
  } catch {
    return null;
  }
}
