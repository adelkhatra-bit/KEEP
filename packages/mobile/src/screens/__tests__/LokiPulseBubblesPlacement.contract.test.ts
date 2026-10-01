// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse permanent placement', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('keeps Pulse directly on Listen home', () => {
    expect(home).toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
  });

  it('keeps one owner Pulse card with persistent gauge', () => {
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>');
    expect(owner).toContain("profilePulseExpanded ? 'MASQUER' : 'VOIR PLUS'");
  });

  it('keeps one visited Pulse card with persistent gauge', () => {
    expect(visitor).toContain('testID="public-profile-loki-pulse-bubbles-card"');
    expect(visitor).toContain('<Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>');
    expect(visitor).toContain('visitorPulseExpanded && visitorStyleBubbles.length > 0');
  });

  it('never renders duplicate Pulse cards', () => {
    expect((owner.match(/testID="profile-loki-pulse-bubbles-card"/g) || []).length).toBe(1);
    expect((visitor.match(/testID="public-profile-loki-pulse-bubbles-card"/g) || []).length).toBe(1);
  });
});
