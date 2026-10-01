// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse gauge memory contract', () => {
  it('keeps the percentage gauge permanently visible', () => {
    expect(owner).toContain('const styleCoveragePercent = useMemo');
    expect(owner).toContain('<Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>');
    expect(owner).toContain("width: `${styleCoveragePercent}%`");
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
  });

  it('keeps all Pulse details behind one global toggle', () => {
    expect(owner).toContain('const [profilePulseExpanded, setProfilePulseExpanded] = useState(false);');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('profilePulseExpanded && profileStyleBubbles.length > 0');
    expect(owner).toContain('profilePulseExpanded && visibleLokiPulseItems.length > 0');
  });

  it('uses Loki Pulse branding and never restores old visible DNA branding', () => {
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI PULSE</Text>');
    expect(owner).not.toContain('Loki Music DNA');
  });
});
