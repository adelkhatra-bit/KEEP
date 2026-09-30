import fs from 'fs';
import path from 'path';

describe('Owner profile metrics layout', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('aligns FREE with the profile type badge and keeps Battle on the same identity row', () => {
    const meta = source.indexOf('<View style={s.profileMetaTopRow}>');
    const group = source.indexOf('<View style={s.profileMetaBadgeGroup}>', meta);
    const kind = source.indexOf('style={[s.kindBadge', group);
    const free = source.indexOf('style={[s.profileFreeInline', kind);
    const battle = source.indexOf('<BattleGlowButton', free);
    expect(meta).toBeGreaterThanOrEqual(0);
    expect(group).toBeGreaterThan(meta);
    expect(kind).toBeGreaterThan(group);
    expect(free).toBeGreaterThan(kind);
    expect(battle).toBeGreaterThan(free);
    expect(source).toContain("<Text style={s.profileFreeInlineLabel}>FREE</Text>");
  });

  it('does not duplicate FREE in the counters row', () => {
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}');
    const metricsEnd = source.indexOf('{freeDetailsOpen ? (', metricsStart);
    const metrics = source.slice(metricsStart, metricsEnd);
    expect(metrics).toContain('<Text style={s.topMetricMoreText}>PLUS</Text>');
    expect(metrics).toContain('>Abonnés</Text>');
    expect(metrics).toContain('>Reprises</Text>');
    expect(metrics).not.toContain('topMetricFreeHero');
    expect(metrics).not.toContain('>FREE</Text>');
  });
});
