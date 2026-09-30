import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — product lock 01/10/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps exactly one FREE control immediately after Reprises in the metrics bar', () => {
    const metaStart = source.indexOf('<View style={s.profileMetaTopRow}>');
    const metricsStart = source.indexOf('<View style={s.topMetricsBar}', metaStart);
    expect(source.slice(metaStart, metricsStart)).not.toContain('profileFreeInline');

    const end = source.indexOf('{freeDetailsOpen ? (', metricsStart);
    const bar = source.slice(metricsStart, end);
    const plus = bar.indexOf('>PLUS</Text>');
    const followers = bar.indexOf('>Abonnés</Text>');
    const reprises = bar.indexOf('>Reprises</Text>');
    const free = bar.indexOf('topMetricFreeHero');
    expect(plus).toBeGreaterThanOrEqual(0);
    expect(followers).toBeGreaterThan(plus);
    expect(reprises).toBeGreaterThan(followers);
    expect(free).toBeGreaterThan(reprises);
    expect(bar).toContain('<Text style={s.topMetricFreeLabel}>FREE</Text>');
    expect(source.match(/accessibilityLabel="Voir le détail de mes Free"/g) ?? []).toHaveLength(1);
  });
});
