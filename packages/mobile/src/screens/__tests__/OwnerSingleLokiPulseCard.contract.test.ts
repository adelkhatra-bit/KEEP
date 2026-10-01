// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('single owner Loki Pulse card contract', () => {
  it('keeps styles and recommendations inside the same compact card', () => {
    expect(owner).toContain('const [profileMusicExpanded, setProfileMusicExpanded] = useState(false);');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-styles"');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-music"');
    expect(owner).toContain("profileMusicExpanded ? 'MASQUER' : 'POUR MOI'");
    expect(owner).toContain('MES ${profileStyleBubbles.length} STYLES');
  });

  it('keeps the two panels mutually exclusive and removes the old standalone Pulse section', () => {
    expect(owner).toContain('if (next) setProfileMusicExpanded(false);');
    expect(owner).toContain('if (next) setProfileStylesExpanded(false);');
    expect(owner).not.toContain('style={s.lokiPulseSection}');
  });
});
