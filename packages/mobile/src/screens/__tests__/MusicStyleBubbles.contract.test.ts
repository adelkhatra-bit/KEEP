// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Music style bubbles contract', () => {
  const bubbles = readNormalized(__dirname, '..', '..', 'components', 'MusicStyleBubbles.tsx');
  const owner = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const home = readNormalized(__dirname, '..', 'HomeScreenCompact.tsx');

  it('keeps one reusable compact style-bubble renderer', () => {
    expect(bubbles).toContain('export default function MusicStyleBubbles');
    expect(bubbles).toContain('horizontal');
    expect(bubbles).toContain('borderRadius:18');
    expect(bubbles).toContain('max = 8');
  });

  it('keeps the owner profile bubbles visible from persisted tastes, not only loaded tracks', () => {
    expect(owner).toContain('profileStyleBubbles');
    expect(owner).toContain('...(user?.favoriteGenres ?? [])');
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).toContain('<MusicStyleBubbles');
    expect(owner).toContain('openSelectionSwipe');
  });

  it('keeps music-style pills visible on a visited profile even while DNA is collapsed', () => {
    expect(visitor).toContain('visitorStyleBubbles');
    expect(visitor).toContain('testID="visitor-music-style-bubbles"');
    expect(visitor).toContain('<MusicStyleBubbles');
    expect(visitor).toContain("openBrowseSwipe({ type: 'genre'");
  });

  it('shows the same musical identity at the bottom of Loki Music home', () => {
    expect(home).toContain('LOKI MUSIC DNA');
    expect(home).toContain('Tes styles musicaux');
    expect(home).toContain('testID="home-music-style-bubbles"');
    expect(home).toContain('<MusicStyleBubbles');
  });

  it('hydrates home style bubbles from persistent Supabase keeps, not only device cache', () => {
    expect(home).toContain("loadOwnProfileKeeps");
    expect(home).toContain('serverHomeStyles');
    expect(home).toContain('navigation?.addListener?.(\'focus\'');
    expect(home).toContain('entry.track.genres');
  });
});
