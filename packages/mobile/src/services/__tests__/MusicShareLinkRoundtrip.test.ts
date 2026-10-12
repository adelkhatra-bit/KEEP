import { extractMusicShareLink, parseMusicShareInput } from '../musicShareLink';
import { supportedSharedMusicUrl } from '../sharedMusicSourceService';
import { resolveEmbeddedMusicPlayer } from '../embeddedMusicPlayer';
import fs from 'fs';
import path from 'path';

const videoId = 'dQw4w9WgXcQ';
const canonical = 'https://www.youtube.com/watch?v=' + videoId;

describe('PC/mobile social links reach the same preview search', () => {
  it.each([
    'https://www.youtube.com/watch?v=' + videoId + '&si=desktop',
    'https://youtu.be/' + videoId + '?si=mobile',
    'https://m.youtube.com/watch?v=' + videoId,
    'https://music.youtube.com/watch?v=' + videoId + '&feature=share',
    'https://www.youtube.com/shorts/' + videoId,
    'https://youtube.com/live/' + videoId,
    'Je partage ce morceau : https://youtu.be/' + videoId + '?si=mobile !',
  ])('normalizes YouTube shared video: %s', (input) => {
    expect(parseMusicShareInput(input)).toMatchObject({ url: canonical });
  });

  it.each([
    'Écoute ça https://spotify.link/ABCD1234',
    'https://spotify.app.link/ABCD1234',
    'https://open.spotify.com/track/1234567890123456789012?si=test',
    'Voici ma musique https://deezer.page.link/ABCD1234',
    'https://link.deezer.com/s/ABCD123',
    'https://dzr.page.link/ABCD',
    'https://on.soundcloud.com/ABCD123',
    'https://music.apple.com/fr/song/morceau/123456789',
  ])('recognizes provider link in copied sharing text: %s', (input) => {
    expect(extractMusicShareLink(input)).not.toBeNull();
    expect(supportedSharedMusicUrl(input)).not.toBeNull();
  });

  it('replaces the first YouTube video instead of reusing its embedded player', () => {
    const first = resolveEmbeddedMusicPlayer('https://youtu.be/dQw4w9WgXcQ?si=first');
    const second = resolveEmbeddedMusicPlayer('https://www.youtube.com/watch?v=9bZkp7q19f0');
    expect(first?.provider).toBe('YOUTUBE');
    expect(second?.provider).toBe('YOUTUBE');
    expect(first?.url).toContain('/embed/dQw4w9WgXcQ');
    expect(second?.url).toContain('/embed/9bZkp7q19f0');
    expect(second?.url).not.toBe(first?.url);
  });

  it('keeps the second-link input inside the player and resets the old result', () => {
    const component = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'TemporaryMusicPreview.tsx'), 'utf8');
    const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
    expect(component).toContain('temporary-music-next-link-input');
    expect(component).toContain('temporary-music-next-link-search');
    expect(component).toContain('onReplaceLink(nextLink.trim())');
    expect(home).toContain('onReplaceLink={(link) => { void runManualSearch(link); }}');
    expect(home).toContain('setManualSearchResult(null);');
    expect(home).toContain('const generation = ++searchGeneration.current;');
    expect(home).not.toContain('ⓘ Comment ça marche ?');
  });

  it('does not mistake a playlist-only URL for a specific YouTube video', () => {
    expect(parseMusicShareInput('https://youtube.com/playlist?list=PL123')).toMatchObject({
      url: 'https://youtube.com/playlist?list=PL123',
    });
  });

  it('keeps an artist/title query as text', () => {
    expect(parseMusicShareInput('Daft Punk - One More Time')).toEqual({ title: 'Daft Punk - One More Time' });
  });

  it('never accepts an unrelated website for clipboard import', () => {
    expect(supportedSharedMusicUrl('https://youtube.com.evil.example/watch?v=' + videoId)).toBeNull();
    expect(supportedSharedMusicUrl('https://example.com')).toBeNull();
  });
});
