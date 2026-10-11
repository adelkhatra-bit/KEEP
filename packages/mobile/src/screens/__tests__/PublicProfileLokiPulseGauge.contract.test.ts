// @ts-nocheck
import fs from 'fs';
import path from 'path';

const visitor = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('visited profile Loki Pulse gauge contract', () => {
  it('keeps the same compact Pulse logic as the owner profile', () => {
    expect(visitor).toContain('const [visitorPulseExpanded, setVisitorPulseExpanded] = useState(false);');
    expect(visitor).toContain("isOwner ? 'Mon empreinte musicale' : 'Son empreinte musicale'");
    expect(visitor).toContain('visitorStyleCoveragePercent');
    expect(visitor).toContain('<Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>');
  });

  it('keeps visitor bubbles hidden until requested', () => {
    expect(visitor).toContain("visitorPulseExpanded ? 'MASQUER'");
    expect(visitor).toContain('VOIR SES ${visitorStyleBubbles.length} STYLES');
    expect(visitor).toContain('visitorPulseExpanded && visitorStyleBubbles.length > 0');
    expect(visitor).toContain('max={visitorStyleBubbles.length}');
  });
});
