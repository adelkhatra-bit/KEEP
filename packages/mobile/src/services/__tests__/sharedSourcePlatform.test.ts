import { sharedSourcePlatformFromUrl } from '../sharedSourcePlatform';

describe('pasted YouTube link detection for music metadata resolver', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123', 'YOUTUBE'],
    ['https://youtu.be/abc123?t=30', 'YOUTUBE'],
    ['https://m.youtube.com/shorts/abc123', 'YOUTUBE'],
    ['https://music.youtube.com/watch?v=abc123', 'YOUTUBE'],
    ['https://www.tiktok.com/@dj/video/123', 'TIKTOK'],
    ['https://www.instagram.com/reel/abc/', 'INSTAGRAM'],
    ['https://www.facebook.com/watch/?v=123', 'FACEBOOK'],
    ['https://open.spotify.com/track/123', 'UNKNOWN'],
    ['https://youtube.com.evil.test/watch?v=123', 'UNKNOWN'],
    ['javascript:alert(1)', 'UNKNOWN'],
    ['Artiste - Titre', 'UNKNOWN'],
  ])('maps %s to %s', (input, expected) => {
    expect(sharedSourcePlatformFromUrl(input)).toBe(expected);
  });
});
