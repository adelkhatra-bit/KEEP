import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — product lock 01/10/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps profile type and Battle in the identity area without FREE', () => {
    const metaStart = source.indexOf('<View style={s.profileMetaTopRow}>');
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}', metaStart);
    const meta = source.slice(metaStart, metricsStart);
    expect(metaStart).toBeGreaterThanOrEqual(0);
    expect(meta).toContain('style={[s.kindBadge');
    expect(meta).toContain('<BattleGlowButton');
    expect(meta).not.toContain('>FREE</Text>');
    expect(meta).not.toContain('profileFreeInline');
  });

  it('keeps the metrics bar PLUS, Abonnés, Reprises, FREE in that exact order', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
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
    expect(source.match(/accessibilityLabel="Voir le détail de mes Free"/g) ?? []).toHaveLength(1);
  });
});
