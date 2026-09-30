import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — 30/09/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('puts FREE on the left and PLUS on the right without changing their card designs', () => {
    const barStart = source.indexOf('<View style={s.topMetricsBar}');
    const free = source.indexOf('accessibilityLabel="Voir le détail de mes Free"', barStart);
    const followers = source.indexOf('>Abonnés</Text>', barStart);
    const plus = source.indexOf('>PLUS</Text>', barStart);
    expect(barStart).toBeGreaterThanOrEqual(0);
    expect(free).toBeGreaterThan(barStart);
    expect(followers).toBeGreaterThan(free);
    expect(plus).toBeGreaterThan(followers);
    expect(source).toContain('topMetricFreeHero:{width:82,minHeight:58');
    expect(source).toContain('topMetricMore:{width:48,minHeight:58');
  });

  it('keeps the Battle availability switch immediately above the FREE card', () => {
    const barStart = source.indexOf('<View style={s.topMetricsBar}');
    const battle = source.indexOf('style={s.profileBattleAboveFree}', barStart);
    const free = source.indexOf('accessibilityLabel="Voir le détail de mes Free"', barStart);
    expect(battle).toBeGreaterThan(barStart);
    expect(free).toBeGreaterThan(battle);
    expect(source).toContain('topMetricLeftStack:{width:82');
    expect(source).not.toContain('identityBattle:{');
  });
});
