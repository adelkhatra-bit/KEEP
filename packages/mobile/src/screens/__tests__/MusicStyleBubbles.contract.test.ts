// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Music style bubbles contract', () => {
  const owner = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const home = readNormalized(__dirname, '..', 'HomeScreenCompact.tsx');

  it('keeps the owner profile music styles as compact pills, not only large tiles', () => {
    expect(owner).toContain('<View style={s.chips}>{dna.topGenres.slice(0,6).map');
    expect(owner).toContain('style={s.chip}');
    expect(owner).toContain('style={s.chipText}');
    expect(owner).toContain('openSelectionSwipe');
  });

  it('keeps music-style pills visible on a visited profile even while DNA is collapsed', () => {
    expect(visitor).toContain('profile.favoriteGenres.slice(0, 4).map');
    expect(visitor).toContain('<View style={styles.chips}>');
    expect(visitor).toContain("openBrowseSwipe({ type: 'genre'");
  });

  it('shows the same musical identity at the bottom of Loki Music home', () => {
    expect(home).toContain('LOKI MUSIC DNA');
    expect(home).toContain('Tes styles musicaux');
    expect(home).toContain('homeStyleBubbles.map');
    expect(home).toContain('homeDnaBubble');
  });

  it('hydrates home style bubbles from persistent Supabase keeps, not only device cache', () => {
    expect(home).toContain("loadOwnProfileKeeps");
    expect(home).toContain('serverHomeStyles');
    expect(home).toContain('navigation?.addListener?.(\'focus\'');
    expect(home).toContain('entry.track.genres');
  });
});
