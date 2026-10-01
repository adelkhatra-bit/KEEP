const fs = require('fs');
const path = require('path');

function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

describe('Loki Music DNA style bubbles', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');

  it('keeps the owner profile DNA as compact clickable bubbles', () => {
    expect(profile).toContain('Les petites bulles de styles sont le rendu canonique du DNA');
    expect(profile).toContain('style={s.chips}');
    expect(profile).toContain('style={s.chip}');
    expect(profile).toContain('Swiper tes morceaux');
  });

  it('shows the same musical-style idea on the Loki Music home screen', () => {
    expect(home).toContain('LOKI MUSIC DNA');
    expect(home).toContain('Tes styles musicaux');
    expect(home).toContain('homeDnaBubbles');
    expect(home).toContain('homeDnaBubble');
    expect(home).toContain("navigation.navigate('Profile')");
  });
});
