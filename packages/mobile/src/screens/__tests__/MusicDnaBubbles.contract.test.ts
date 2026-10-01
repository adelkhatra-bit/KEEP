const fs = require('fs');
const path = require('path');

function read(...parts: string[]) { return fs.readFileSync(path.join(...parts), 'utf8'); }

describe('music style bubbles', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const bubbles = read(__dirname, '..', '..', 'components', 'MusicStyleBubbles.tsx');

  it('keeps one canonical bubble component', () => {
    expect(bubbles).toContain('export default function MusicStyleBubbles');
    expect(bubbles).toContain('borderRadius:18');
    expect(bubbles).toContain('horizontal');
    expect(bubbles).toContain('Style musical');
  });

  it('keeps owner bubbles visible even while the compact Pulse details are collapsed', () => {
    expect(profile).toContain('testID="profile-music-style-bubbles"');
    expect(profile).not.toContain('testID="profile-loki-pulse-preview"');
    expect(profile).not.toContain('testID="profile-music-style-bubbles-preview"');
  });

  it('keeps visitor bubbles available behind its compact control', () => {
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
    expect(visitor).toContain('visitorPulseExpanded && visitorStyleBubbles.length > 0');
  });

  it('shows bubbles directly on Loki Music home without a Pulse label', () => {
    expect(home).toContain('<Text style={s.homeDnaTitle}>Tes bulles musicales</Text>');
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(home).not.toContain("onPress={() => navigation.navigate('Profile')}");
  });
});
