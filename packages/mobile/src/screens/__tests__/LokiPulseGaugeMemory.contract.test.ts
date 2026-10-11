// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('owner DNA gauge memory contract', () => {
  it('keeps the DNA percentage gauge visible', () => {
    expect(owner).toContain('const styleCoveragePercent = useMemo');
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(owner).toContain('<Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>');
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
  });

  it('keeps DNA details collapsed by default and separate from Loki Pulse tracks', () => {
    expect(owner).toContain('const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);');
    expect(owner).toContain('ownerDnaExpanded ? (');
    expect(owner).toContain('testID="profile-music-dna-expanded"');
    expect(owner).toContain('testID="profile-loki-pulse-track-bubbles"');
  });
});
