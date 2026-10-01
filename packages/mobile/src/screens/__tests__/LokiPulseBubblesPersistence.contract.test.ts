// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse music bubbles persistence contract', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const helper = read(__dirname, '..', '..', 'services', 'musicStyleBubbles.ts');

  it('keeps home Pulse bubbles directly visible', () => {
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).toContain('LOKI PULSE');
    expect(home).toContain('Tes bulles musicales');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
  });

  it('keeps owner Pulse compact with gauge and one expansion control', () => {
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).not.toContain('Loki Music DNA');
  });

  it('keeps visited Pulse compact with gauge and expandable bubbles', () => {
    expect(visitor).toContain('testID="public-profile-loki-pulse-bubbles-card"');
    expect(visitor).toContain('<Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>');
    expect(visitor).toContain('visitorPulseExpanded && visitorStyleBubbles.length > 0');
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
    expect(visitor).not.toContain('Loki Music DNA');
  });

  it('uses one deduplicating merge rule across surfaces', () => {
    expect(helper).toContain('export function buildMusicStyleBubbles');
    expect(home).toContain('buildMusicStyleBubbles');
    expect(owner).toContain('buildMusicStyleBubbles');
    expect(visitor).toContain('buildMusicStyleBubbles');
  });
});
