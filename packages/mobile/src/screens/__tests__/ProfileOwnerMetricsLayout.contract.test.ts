import fs from 'fs';
import path from 'path';

describe('Owner profile identity + metrics product lock', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps certification beside username, then profile type and Battle in the identity area', () => {
    const identity = source.indexOf('<View style={s.identity}>');
    const username = source.indexOf('<View style={s.usernameLine}>', identity);
    const meta = source.indexOf('<View style={s.profileMetaTopRow}>', username);
    const metrics = source.indexOf('<View style={s.topMetricsBar}', meta);
    const identityMeta = source.slice(meta, metrics);
    expect(source.slice(username, meta)).toContain('<ProfileCertificationBadge tier={certificationTier} compact />');
    expect(source).toContain('const certificationTier = publicSnapshot?.certificationTier ?? fallbackCertification;');
    expect(identityMeta).toContain('style={[s.kindBadge');
    expect(identityMeta).toContain('<BattleGlowButton');
    expect(identityMeta).not.toContain('>FREE</Text>');
  });

  it('keeps PLUS, Abonnés, Reprises, FREE in the final product order', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen && !isDemoMode ? (', start);
    const metrics = source.slice(start, end);
    const plus = metrics.indexOf('>PLUS</Text>');
    const followers = metrics.indexOf('>Abonnés</Text>');
    const reprises = metrics.indexOf('>Reprises</Text>');
    const free = metrics.indexOf('>FREE</Text>');
    expect(followers).toBeGreaterThan(plus);
    expect(reprises).toBeGreaterThan(followers);
    expect(free).toBeGreaterThan(reprises);
    expect(metrics).not.toContain('topMetricFreeHero');
    expect(metrics).toContain('topMetricFreeItem');
  });
});
