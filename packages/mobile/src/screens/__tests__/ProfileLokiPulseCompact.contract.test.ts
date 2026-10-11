// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('compact owner DNA and separate Pulse contract', () => {
  it('keeps DNA collapsible to save vertical space', () => {
    expect(owner).toContain('const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);');
    expect(owner).toContain("accessibilityLabel={ownerDnaExpanded ? 'Masquer mon empreinte musicale' : 'Afficher mon empreinte musicale'}");
    expect(owner).toContain('ownerDnaExpanded ? (');
  });

  it('keeps Pulse track bubbles independent from DNA expansion', () => {
    expect(owner).toContain('testID="profile-loki-pulse-track-bubbles"');
    expect(owner).toContain('visibleLokiPulseItems.map((item) => (');
  });
});
