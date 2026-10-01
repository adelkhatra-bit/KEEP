import fs from 'fs';
import path from 'path';

describe('Owner profile identity + metrics product lock', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps certification beside username, then profile type, FREE and Battle', () => {
    const identity = source.indexOf('<View style={s.identity}>');
    const username = source.indexOf('<View style={s.usernameLine}>', identity);
    const meta = source.indexOf('<View style={s.profileMetaTopRow}>', username);
    const group = source.indexOf('<View style={s.profileMetaBadgeGroup}>', meta);
    const kind = source.indexOf('style={[s.kindBadge', group);
    const free = source.indexOf('style={[s.profileFreeInline', kind);
    const battle = source.indexOf('<BattleGlowButton', free);
    expect(source.slice(username, meta)).toContain('<ProfileCertificationBadge tier={certificationTier} compact />');
    expect(source).toContain('const certificationTier = publicSnapshot?.certificationTier ?? fallbackCertification;');
    expect(group).toBeGreaterThan(meta);
    expect(kind).toBeGreaterThan(group);
    expect(free).toBeGreaterThan(kind);
    expect(battle).toBeGreaterThan(free);
  });

  it('keeps PLUS, Abonnés, Reprises in that exact order with no duplicate FREE', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
    const metrics = source.slice(start, end);
    const plus = metrics.indexOf('>PLUS</Text>');
    const followers = metrics.indexOf('>Abonnés</Text>');
    const reprises = metrics.indexOf('>Reprises</Text>');
    expect(followers).toBeGreaterThan(plus);
    expect(reprises).toBeGreaterThan(followers);
    expect(metrics).not.toContain('topMetricFreeHero');
    expect(metrics).not.toContain('>FREE</Text>');
  });
});
