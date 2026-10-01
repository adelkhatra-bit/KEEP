const fs = require('fs');
const path = require('path');
function read(...parts) { return fs.readFileSync(path.join(...parts), 'utf8'); }

describe('music DNA styles and Loki Pulse track bubbles', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');

  it('keeps style bubbles inside expanded DNA only', () => {
    expect(profile).toContain('ownerDnaExpanded ? (');
    expect(profile).toContain('testID="profile-music-style-bubbles"');
    expect(profile).toContain('max={8}');
  });

  it('keeps Loki Pulse as separate clickable track artwork bubbles', () => {
    expect(profile).toContain('testID="profile-loki-pulse-track-bubbles"');
    expect(profile).toContain('s.lokiPulseArtworkRing');
    expect(home).toContain('testID="home-loki-pulse-track-bubbles"');
    expect(home).toContain('s.homePulseArtworkRing');
  });
});
