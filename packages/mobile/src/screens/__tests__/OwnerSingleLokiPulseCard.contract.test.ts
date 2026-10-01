// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('single owner Loki Pulse card contract', () => {
  it('keeps visible styles and expandable recommendations inside one compact card', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('testID="profile-loki-pulse-visible-styles"');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-music"');
  });

  it('never hides styles and expands recommendations only', () => {
    expect(owner).not.toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
    expect(owner).not.toContain('profileStylesExpanded');
    expect(owner).not.toContain('profileMusicExpanded');
    expect(owner).not.toContain('style={s.lokiPulseSection}');
  });
});
