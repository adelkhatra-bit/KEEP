const fs = require('fs');
const path = require('path');

function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

describe('Loki Music DNA style bubbles', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const bubbles = read(__dirname, '..', '..', 'components', 'MusicStyleBubbles.tsx');

  it('keeps one canonical compact music-style bubble component', () => {
    expect(bubbles).toContain('export default function MusicStyleBubbles');
    expect(bubbles).toContain('borderRadius:18');
    expect(bubbles).toContain('horizontal');
    expect(bubbles).toContain('Style musical');
  });

  it('keeps the owner profile bubbles visible whether advanced DNA is enabled or not', () => {
    expect(profile).toContain("import MusicStyleBubbles");
    expect(profile).toContain('testID="profile-music-style-bubbles"');
    expect(profile).toContain('!dnaFeatureEnabled && profileStyleBubbles.length > 0');
    expect(profile).toContain('dnaFeatureEnabled &&');
    expect(profile).toContain('openSelectionSwipe');
  });

  it('shows the same musical-style bubbles on the Loki Music home screen', () => {
    expect(home).toContain('LOKI MUSIC DNA');
    expect(home).toContain('Tes styles musicaux');
    expect(home).toContain('testID="home-music-style-bubbles"');
    expect(home).toContain('<MusicStyleBubbles');
    expect(home).toContain("navigation.navigate('Profile')");
  });
});
