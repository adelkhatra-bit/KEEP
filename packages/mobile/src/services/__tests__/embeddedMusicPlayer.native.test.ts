import { buildNativeYouTubeEmbedDocument, resolveEmbeddedMusicPlayer } from '../embeddedMusicPlayer';

describe('native provider embeds', () => {
  it('builds a native YouTube document with a valid public referrer and origin for Error 153', () => {
    const player = resolveEmbeddedMusicPlayer('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(player?.provider).toBe('YOUTUBE');
    const document = buildNativeYouTubeEmbedDocument(player!, { autoplay: true, startSeconds: 0, endSeconds: 30 });
    expect(document).not.toBeNull();
    expect(document?.baseUrl).toBe('https://adelkhatra-bit.github.io/KEEP/');
    expect(document?.html).toContain('new YT.Player');
    expect(document?.html).toContain('videoId');
    expect(document?.html).toContain('https://adelkhatra-bit.github.io');
    expect(document?.html).toContain('enablejsapi');
    expect(document?.html).toContain('onError');
    expect(document?.html).toContain('referrer" content="strict-origin-when-cross-origin"');
    expect(document?.html).toContain('start');
    expect(document?.html).toContain('end');
  });

  it('does not build a YouTube HTML document for Spotify or arbitrary hosts', () => {
    const spotify = resolveEmbeddedMusicPlayer('https://open.spotify.com/track/1234567890');
    expect(spotify?.provider).toBe('SPOTIFY');
    expect(buildNativeYouTubeEmbedDocument(spotify!)).toBeNull();
    expect(buildNativeYouTubeEmbedDocument({ provider: 'YOUTUBE', url: 'https://attacker.example/embed/dQw4w9WgXcQ', label: 'bad' })).toBeNull();
  });
});

describe('couche de geste sur le lecteur YouTube iPhone (Adel 20/10/2026)', () => {
  it('ajoute la couche qui renvoie le swipe à Loki, sans toucher au document de base', () => {
    const { buildNativeYouTubeEmbedDocument, resolveEmbeddedMusicPlayer, withSwipeLayer } = require('../embeddedMusicPlayer');
    const player = resolveEmbeddedMusicPlayer('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const base = buildNativeYouTubeEmbedDocument(player, { autoplay: true, startSeconds: 0, endSeconds: 30 });
    expect(base.html).not.toContain('loki-swipe-layer');
    const layered = withSwipeLayer(base);
    expect(layered.html).toContain('loki-swipe-layer');
    expect(layered.html).toContain("type: 'loki-swipe'");
    expect(layered.html.indexOf('loki-swipe-layer')).toBeLessThan(layered.html.indexOf('</body>'));
    expect(withSwipeLayer(base, false)).toBe(base);
    expect(withSwipeLayer(null)).toBeNull();
  });
});
