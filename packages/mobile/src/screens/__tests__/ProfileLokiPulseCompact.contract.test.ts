// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('compact owner Loki Pulse contract', () => {
  it('keeps one compact Loki Pulse card and hides details by default', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).not.toContain('testID="profile-loki-pulse-preview"');
    expect(owner).not.toContain('testID="profile-music-style-bubbles-preview"');
    expect(owner).toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
  });

  it('uses one control to reveal or hide the whole Pulse block', () => {
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('max={profileStyleBubbles.length}');
    expect(owner).not.toContain('profileStylesExpanded');
    expect(owner).not.toContain('profileMusicExpanded');
  });

  it('removes old visible Loki Music DNA wording', () => {
    expect(owner).not.toContain('Loki Music DNA');
    expect(owner).toContain('Fais découvrir ton Loki Pulse');
  });
});
