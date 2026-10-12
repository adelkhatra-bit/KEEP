import fs from 'fs';
import path from 'path';
import { canonicalYouTubeMusicUrl, extractMusicShareLink } from '../musicShareLink';
import { sharedSourcePlatformFromUrl } from '../sharedSourcePlatform';

const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');

describe('PC and iPhone YouTube share parity; temporary result only', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    'https://www.youtube.com/watch?v='+id+'&t=42',
    'https://m.youtube.com/watch?v='+id,
    'https://youtu.be/'+id+'?si=example',
    'https://youtube.com/shorts/'+id,
    'https://music.youtube.com/watch?v='+id,
    'https://www.youtube.com/live/'+id,
  ])('normalizes %s to the same video without navigation or persistence', (url) => {
    expect(canonicalYouTubeMusicUrl(url)).toBe('https://www.youtube.com/watch?v='+id);
    expect(sharedSourcePlatformFromUrl(url)).toBe('YOUTUBE');
  });
  it('extracts a URL inside an iPhone share caption', () => {
    expect(extractMusicShareLink('À écouter ! https://youtu.be/'+id+'?si=abc')).toBe('https://www.youtube.com/watch?v='+id);
  });
  it('keeps playlist links and malicious lookalike domains distinct', () => {
    const playlist = 'https://www.youtube.com/playlist?list=PL1234';
    expect(canonicalYouTubeMusicUrl(playlist)).toBe(playlist);
    const spoof = 'https://youtube.com.evil.example/watch?v='+id;
    expect(canonicalYouTubeMusicUrl(spoof)).toBe(spoof);
    expect(sharedSourcePlatformFromUrl(spoof)).toBe('UNKNOWN');
  });
  it('never writes pasted or copied link results to the live session', () => {
    const first = home.slice(home.indexOf('const runManualSearch = async () => {'), home.indexOf('const refreshCreditBadge = async () => {'));
    const second = home.slice(home.indexOf('const recordSharedLinkResult = async (url: string)'), home.indexOf('const importCopiedMusicLink = () => {'));
    for (const block of [first, second]) {
      expect(block).toContain('searchTrackByText(');
      expect(block).not.toMatch(/await (?:submitManualSearch|submitSharedLinkRecognition|startSession)\(/);
      expect(block).not.toContain('persistLiveSession');
    }
    expect(home).toContain('testID="close-manual-search-preview"');
    expect(home).toContain("navigation?.addListener?.('blur', closeManualSearchPreview)");
    expect(home).toContain('onPress={closeManualSearchPreview}');
  });
});
