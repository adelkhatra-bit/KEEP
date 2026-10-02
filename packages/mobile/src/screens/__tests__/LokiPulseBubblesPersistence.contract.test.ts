// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('DNA and Loki Pulse separation', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');

  it('keeps owner DNA compact and independently collapsible', () => {
    expect(owner).toContain('testID="profile-music-dna-card"');
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(owner).toContain('<Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>');
    expect(owner).toContain('const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);');
    expect(owner).toContain('ownerDnaExpanded ? (');
    expect(owner).toContain('testID="profile-music-dna-expanded"');
  });

  it('keeps a separate clickable track-bubble Loki Pulse section lower on profile', () => {
    expect(owner).toContain('testID="profile-loki-pulse-track-bubbles"');
    expect(owner).toContain('<Text style={s.lokiPulseEyebrow}>LOKI PULSE</Text>');
    expect(owner).toContain('setLokiPulseSelectedTrackId(item.track.id)');
    expect(owner).toContain('setLokiPulseSwipeOpen(true)');
  });

  it('uses track bubbles, not genre/style bubbles, on Loki Music home', () => {
    expect(home).toContain("loadLokiPulse(24, user.id)");
    expect(home).toContain('testID="home-loki-pulse-track-bubbles"');
    expect(home).toContain('openHomePulseTrack(item.track.id)');
    expect(home).not.toContain('homeStyleBubbles');
    expect(home).not.toContain('Styles musicaux cliquables');
  });
});
