import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — permanent alignment contract 30/09/2026', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('locks FREE beside Reprises with the existing FREE card design', () => {
    const barStart = source.indexOf('<View style={s.topMetricsBar}');
    const reprises = source.indexOf('>Reprises</Text>', barStart);
    const free = source.indexOf('accessibilityLabel="Voir le détail de mes Free"', reprises);
    expect(barStart).toBeGreaterThanOrEqual(0);
    expect(reprises).toBeGreaterThan(barStart);
    expect(free).toBeGreaterThan(reprises);
    expect(source).toContain('topMetricFreeHero:{width:82,minHeight:58');
    expect(source).toContain('topMetricFreeSlot:{width:82');
  });

  it('locks BATTLE beside the role badge and outside the metrics row', () => {
    const roleRow = source.indexOf('<View style={s.profileRoleBattleRow}>');
    const roleLabel = source.indexOf('PROFILE_KIND_LABELS[user.kind]', roleRow);
    const battle = source.indexOf('<BattleGlowButton', roleLabel);
    const location = source.indexOf('style={s.location}', battle);
    const metrics = source.indexOf('<View style={s.topMetricsBar}', battle);
    expect(roleRow).toBeGreaterThanOrEqual(0);
    expect(roleLabel).toBeGreaterThan(roleRow);
    expect(battle).toBeGreaterThan(roleLabel);
    expect(location).toBeGreaterThan(battle);
    expect(metrics).toBeGreaterThan(battle);
    expect(source).toContain("profileRoleBattleRow:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between'");
  });
});
