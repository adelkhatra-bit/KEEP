// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('single owner Loki Pulse card contract', () => {
  it('keeps styles and recommendations inside one compact card', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('testID="profile-loki-pulse-expanded-styles"');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-music"');
  });

  it('keeps both styles and recommendations hidden until VOIR PLUS', () => {
    expect(owner).toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
    expect(owner).not.toContain('profile-loki-pulse-preview');
    expect(owner).not.toContain('profile-music-style-bubbles-preview');
    expect(owner).not.toContain('style={s.lokiPulseSection}');
  });
});
