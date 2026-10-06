import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — product lock 01/10/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps FREE out of the profile-type row', () => {
    const metaStart = source.indexOf('<View style={s.profileMetaTopRow}>');
    const locationStart = source.indexOf('{(user.city || user.countryCode)', metaStart);
    const meta = source.slice(metaStart, locationStart);
    expect(meta).toContain('style={[s.kindBadge');
    expect(meta).toContain('<BattleGlowButton');
    expect(meta).not.toContain('>FREE</Text>');
    expect(meta).not.toContain('profileFreeInline');
  });

  it('keeps metrics ordered PLUS, Abonnés, Reprises, FREE exactly once', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen && !isDemoMode ? (', start);
    const bar = source.slice(start, end);
    const plus = bar.indexOf('>PLUS</Text>');
    const followers = bar.indexOf('>Abonnés</Text>');
    const reprises = bar.indexOf('>Reprises</Text>');
    const free = bar.indexOf('>FREE</Text>');
    expect(plus).toBeGreaterThanOrEqual(0);
    expect(followers).toBeGreaterThan(plus);
    expect(reprises).toBeGreaterThan(followers);
    expect(free).toBeGreaterThan(reprises);
    expect(bar).toContain('s.topMetricFreeItem');
    expect(source).toContain("'Voir le détail de mes Free'");
  });
});
