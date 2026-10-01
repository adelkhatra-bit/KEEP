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

  it('keeps owner profile bubbles visible even while details are collapsed', () => {
    expect(owner).toContain('profileStyleBubbles');
    expect(owner).toContain('buildMusicStyleBubbles([');
    expect(owner).toContain('user?.favoriteGenres');
    expect(owner).toContain('!profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('testID="profile-music-style-bubbles-preview"');
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).toContain('openSelectionSwipe');
  });

  it('keeps visited profile bubbles available behind its compact expansion', () => {
    expect(visitor).toContain('visitorStyleBubbles');
    expect(visitor).toContain('visitorPulseExpanded && visitorStyleBubbles.length > 0');
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
    expect(visitor).toContain('<MusicStyleBubbles');
    expect(visitor).toContain("openBrowseSwipe({ type: 'genre'");
  });

  it('shows the same musical identity on Listen home without extra DNA/Pulse branding', () => {
    expect(home).not.toContain('<Text style={s.homeDnaTitle}>Tes bulles musicales</Text>');
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).toContain('<MusicStyleBubbles');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
  });

  it('hydrates home style bubbles from persistent Supabase keeps, not only device cache', () => {
    expect(home).toContain('loadOwnProfileKeeps');
    expect(home).toContain('serverHomeStyles');
    expect(home).toContain("navigation?.addListener?.('focus'");
    expect(home).toContain('entry.track.genres');
  });
});
