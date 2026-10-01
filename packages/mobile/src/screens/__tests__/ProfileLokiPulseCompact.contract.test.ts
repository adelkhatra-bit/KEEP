// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('compact owner Loki Pulse contract', () => {
  it('keeps the percentage gauge visible and Pulse content masked by default', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
    expect(owner).not.toContain('profile-loki-pulse-preview');
    expect(owner).not.toContain('profile-music-style-bubbles-preview');
  });

  it('uses one control to reveal or hide styles and recommendations together', () => {
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-styles"');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-music"');
  });

  it('removes old visible Loki Music DNA wording', () => {
    expect(owner).not.toContain('Loki Music DNA');
  });
});
