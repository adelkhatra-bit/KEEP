import fs from 'fs';
import path from 'path';

describe('Owner profile metrics layout — locked 30/09/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps PLUS left, Abonnés/Reprises in the middle and FREE immediately to the right of Reprises', () => {
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}');
    const more = source.indexOf('style={[s.topMetricMore', metricsStart);
    const socials = source.indexOf('<View style={s.topMetricSocialGroup}>', metricsStart);
    const reprises = source.indexOf('>Reprises</Text>', socials);
    const freeSlot = source.indexOf('<View style={s.topMetricFreeSlot}>', reprises);
    const free = source.indexOf('accessibilityLabel="Voir le détail de mes Free"', freeSlot);
    expect(metricsStart).toBeGreaterThanOrEqual(0);
    expect(more).toBeGreaterThan(metricsStart);
    expect(socials).toBeGreaterThan(more);
    expect(reprises).toBeGreaterThan(socials);
    expect(freeSlot).toBeGreaterThan(reprises);
    expect(free).toBeGreaterThan(freeSlot);
    expect(source).not.toContain('translateY:-100');
  });

  it('never puts the Battle availability control in the counter row', () => {
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}');
    const metricsEnd = source.indexOf('{freeDetailsOpen ? (', metricsStart);
    expect(source.slice(metricsStart, metricsEnd)).not.toContain('<BattleGlowButton');
  });
});
