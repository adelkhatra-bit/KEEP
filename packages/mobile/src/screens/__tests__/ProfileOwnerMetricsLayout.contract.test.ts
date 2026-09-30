import fs from 'fs';
import path from 'path';

describe('Owner profile metrics layout', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps PLUS on the left and FREE on the right without changing their visual components', () => {
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}');
    const more = source.indexOf('style={[s.topMetricMore', metricsStart);
    const socials = source.indexOf('<View style={s.topMetricSocialGroup}>', metricsStart);
    const free = source.indexOf('style={[s.topMetricFreeHero', metricsStart);
    expect(metricsStart).toBeGreaterThanOrEqual(0);
    expect(more).toBeGreaterThan(metricsStart);
    expect(socials).toBeGreaterThan(more);
    expect(free).toBeGreaterThan(socials);
    expect(source).toContain("<Text style={s.topMetricMoreText}>PLUS</Text>");
    expect(source).toContain("<Text style={s.topMetricFreeLabel}>FREE</Text>");
  });

  it('keeps FREE alone on the right: Battle moved up beside the identity (Adel 29/09)', () => {
    const stack = source.indexOf('<View style={s.topMetricRightStack}>');
    const free = source.indexOf('style={[s.topMetricFreeHero', stack);
    const metricsEnd = source.indexOf('{freeDetailsOpen ? (', stack);
    expect(stack).toBeGreaterThanOrEqual(0);
    expect(free).toBeGreaterThan(stack);
    expect(source.slice(stack, metricsEnd)).not.toContain('<BattleGlowButton');
  });
});
