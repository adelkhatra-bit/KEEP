import fs from 'fs';
import path from 'path';
import { resolveEmbeddedMusicPlayer } from '../embeddedMusicPlayer';

describe('Loki Music in-app players: same video on desktop and mobile', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=20',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=shared',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ])('converts %s to the same embedded video without leaving Loki', (url) => {
    const player = resolveEmbeddedMusicPlayer(url);
    expect(player?.provider).toBe('YOUTUBE');
    expect(player?.url).toContain('/embed/dQw4w9WgXcQ');
    expect(player?.url).not.toMatch(/\/watch\?/);
  });

  it('embeds exact Spotify tracks and Deezer tracks without arbitrary URL navigation', () => {
    expect(resolveEmbeddedMusicPlayer('https://open.spotify.com/track/7GhIk7Il098yCjg4BQjzvb')?.url)
      .toBe('https://open.spotify.com/embed/track/7GhIk7Il098yCjg4BQjzvb');
    expect(resolveEmbeddedMusicPlayer('https://www.deezer.com/fr/track/3135556')?.url)
      .toBe('https://widget.deezer.com/widget/dark/track/3135556');
    expect(resolveEmbeddedMusicPlayer('https://bad.youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(resolveEmbeddedMusicPlayer('javascript:alert(1)')).toBeNull();
    expect(resolveEmbeddedMusicPlayer('https://www.youtube.com/playlist?list=PLfake')).toBeNull();
  });
});

describe('Manual link search is ephemeral on desktop and mobile', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
  const modal = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TemporaryMusicPreview.tsx'), 'utf8');

  it('never calls session-saving methods from manual link lookup', () => {
    const search = home.slice(home.indexOf('const runManualSearch = async () =>'), home.indexOf('const refreshCreditBadge ='));
    const importLink = home.slice(home.indexOf('const recordSharedLinkResult = async ('), home.indexOf('const importCopiedMusicLink ='));
    for (const code of [search, importLink]) {
      expect(code).not.toContain('submitManualSearch(');
      expect(code).not.toContain('submitSharedLinkRecognition(');
      expect(code).not.toContain('startSession(');
      expect(code).toContain('openTemporaryMusicPreview(');
    }
  });

  it('clears the transient result when modal closes and when navigation changes', () => {
    const close = home.slice(home.indexOf('const closeManualSearchPreview = () =>'), home.indexOf('const openTemporaryMusicPreview'));
    expect(close).toContain('setManualSearchResult(null)');
    expect(close).toContain('setManualResultOpen(false)');
    expect(home).toContain("navigation?.addListener?.('blur', closeManualSearchPreview)");
    expect(home).toContain('visible={manualSearchOpen || manualResultOpen}');
  });

  it('keeps official players inside the original modal and releases them on close', () => {
    expect(home).toContain('<TemporaryMusicPreview visible={manualResultOpen}');
    expect(modal).toContain("require('react-native-webview').WebView");
    expect(modal).toContain("React.createElement('iframe' as any");
    expect(modal).toContain('Fermer efface ce résultat.');
    expect(modal).not.toContain('Linking.openURL(');
  });
});
