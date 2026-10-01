// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen Loki Music DNA compaction (Adel, 21/09/2026 : "le bloc ADN prend trop de place, noie le reste")', () => {
  const visited = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const personal = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');

  it('collapses the DNA block by default behind a chevron on the visited profile', () => {
    expect(visited).toContain('const [dnaExpanded, setDnaExpanded] = useState(false);');
    expect(visited).toContain("onPress={() => setDnaExpanded((v) => !v)}");
  });

  it('keeps compact music-style pills visible even while DNA is collapsed, with full detail behind the chevron', () => {
    expect(visited).toContain('testID="visitor-music-style-bubbles"');
    expect(visited).toContain('genres={visitorStyleBubbles}');
    expect(visited).toContain('<MusicStyleBubbles');
    expect(visited).toContain("openBrowseSwipe({ type: 'genre'");
    // Le détail complet (puces cliquables Styles + Artistes) reste présent derrière le chevron.
    expect(visited).toContain('<Text style={styles.dnaRowLabel}>STYLES</Text>');
    expect(visited).toContain('<Text style={styles.dnaRowLabel}>ARTISTES</Text>');
  });

  it('leaves the personal profile\'s own DNA block untouched (full block, no collapse) -- explicit Adel request', () => {
    expect(personal).not.toContain('dnaExpanded');
    expect(personal).toContain('<Text style={s.dnaEyebrow}>Loki Music DNA</Text>');
  });
});
