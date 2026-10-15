import { buildNativeYouTubeEmbedDocument, resolveEmbeddedMusicPlayer } from '../embeddedMusicPlayer';

describe('native provider embeds', () => {
  it('builds a native YouTube document with a valid public referrer and origin for Error 153', () => {
    const player = resolveEmbeddedMusicPlayer('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(player?.provider).toBe('YOUTUBE');
    const document = buildNativeYouTubeEmbedDocument(player!, { autoplay: true, startSeconds: 0, endSeconds: 30 });
    expect(document).not.toBeNull();
    expect(document?.baseUrl).toBe('https://adelkhatra-bit.github.io/KEEP/');
    expect(document?.html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(document?.html).toContain('origin=https%3A%2F%2Fadelkhatra-bit.github.io');
    expect(document?.html).toContain('enablejsapi=1');
    expect(document?.html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(document?.html).toContain('start=0');
    expect(document?.html).toContain('end=30');
  });

  it('does not build a YouTube HTML document for Spotify or arbitrary hosts', () => {
    const spotify = resolveEmbeddedMusicPlayer('https://open.spotify.com/track/1234567890');
    expect(spotify?.provider).toBe('SPOTIFY');
    expect(buildNativeYouTubeEmbedDocument(spotify!)).toBeNull();
    expect(buildNativeYouTubeEmbedDocument({ provider: 'YOUTUBE', url: 'https://attacker.example/embed/dQw4w9WgXcQ', label: 'bad' })).toBeNull();
  });
});
