// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('profile Loki Pulse compaction', () => {
  const visited = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const personal = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');

  it('collapses owner and visited Pulse details by default', () => {
    expect(personal).toContain("const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);");
    expect(visited).toContain('const [visitorPulseExpanded, setVisitorPulseExpanded] = useState(false);');
  });

  it('keeps percentage gauges visible while details stay compact', () => {
    expect(personal).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
    expect(visited).toContain('<Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>');
    expect(personal).toContain("ownerDnaExpanded ? '⌃' : '⌄'");
    expect(visited).toContain('VOIR SES ${visitorStyleBubbles.length} STYLES');
  });

  it('keeps clickable style bubbles after expansion', () => {
    expect(personal).toContain('testID="profile-music-style-bubbles"');
    expect(visited).toContain('testID="public-profile-music-style-bubbles"');
    expect(personal).toContain('openSelectionSwipe');
    expect(visited).toContain("openBrowseSwipe({ type: 'genre'");
  });

  it('never restores visible Loki Music DNA wording', () => {
    expect(personal).not.toContain('Loki Music DNA');
    expect(visited).not.toContain('Loki Music DNA');
  });
});
