import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — product lock 01/10/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps exactly one FREE control immediately beside the profile type', () => {
    const metaStart = source.indexOf('<View style={s.profileMetaTopRow}>');
    const locationStart = source.indexOf('{(user.city || user.countryCode)', metaStart);
    const meta = source.slice(metaStart, locationStart);
    const kind = meta.indexOf('style={[s.kindBadge');
    const free = meta.indexOf('style={[s.profileFreeInline');
    const battle = meta.indexOf('<BattleGlowButton');
    expect(kind).toBeGreaterThanOrEqual(0);
    expect(free).toBeGreaterThan(kind);
    expect(battle).toBeGreaterThan(free);
    expect(meta).toContain('<Text style={s.profileFreeInlineLabel}>FREE</Text>');
    expect(source.match(/accessibilityLabel="Voir le détail de mes Free"/g) ?? []).toHaveLength(1);
  });

  it('keeps the metrics bar PLUS, Abonnés, Reprises without a second FREE', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
    const bar = source.slice(start, end);
    const plus = bar.indexOf('>PLUS</Text>');
    const followers = bar.indexOf('>Abonnés</Text>');
    const reprises = bar.indexOf('>Reprises</Text>');
    expect(plus).toBeGreaterThanOrEqual(0);
    expect(followers).toBeGreaterThan(plus);
    expect(reprises).toBeGreaterThan(followers);
    expect(bar).not.toContain('topMetricFreeHero');
    expect(bar).not.toContain('>FREE</Text>');
  });
});
