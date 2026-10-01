// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse gauge memory contract', () => {
  it('keeps the percentage gauge permanently visible in the compact profile card', () => {
    expect(owner).toContain('const styleCoveragePercent = useMemo');
    expect(owner).toContain('<Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>');
    expect(owner).toContain("width: `${styleCoveragePercent}%`");
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
  });

  it('keeps bubbles collapsed by default behind one styles toggle', () => {
    expect(owner).toContain('const [profileStylesExpanded, setProfileStylesExpanded] = useState(false);');
    expect(owner).toContain("profileStylesExpanded ? 'MASQUER'");
    expect(owner).toContain('VOIR MES ${profileStyleBubbles.length} STYLES');
    expect(owner).toContain('profileStylesExpanded && profileStyleBubbles.length > 0');
  });

  it('uses Loki Pulse branding and never restores the old visible DNA branding', () => {
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI PULSE</Text>');
    expect(owner).not.toContain('Loki Music DNA');
  });
});
