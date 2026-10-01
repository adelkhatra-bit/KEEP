// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('compact owner Loki Pulse styles contract', () => {
  it('keeps one compact Loki Pulse card and hides style bubbles by default', () => {
    expect(owner).toContain('const [profileStylesExpanded, setProfileStylesExpanded] = useState(false);');
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('profileStylesExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('testID="profile-loki-pulse-expanded-styles"');
  });

  it('uses one control to reveal or hide all styles', () => {
    expect(owner).toContain("profileStylesExpanded ? 'MASQUER'");
    expect(owner).toContain('VOIR MES ${profileStyleBubbles.length} STYLES');
    expect(owner).toContain('max={profileStyleBubbles.length}');
    expect(owner).not.toContain('VOIR MES {genreFolders.length} STYLES');
  });

  it('removes the old visible Loki Music DNA wording from the owner profile', () => {
    expect(owner).not.toContain('Loki Music DNA');
    expect(owner).toContain('Fais découvrir ton Loki Pulse');
  });
});
