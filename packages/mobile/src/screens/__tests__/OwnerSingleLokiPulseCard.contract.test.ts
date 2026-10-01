// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('single owner Loki Pulse card contract', () => {
  it('keeps styles and recommendations inside one compact card with one control', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('testID="profile-loki-pulse-expanded-styles"');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-music"');
  });

  it('opens both content areas together and removes the two old controls', () => {
    expect(owner).toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
    expect(owner).not.toContain('profileStylesExpanded');
    expect(owner).not.toContain('profileMusicExpanded');
    expect(owner).not.toContain('style={s.lokiPulseSection}');
  });
});
