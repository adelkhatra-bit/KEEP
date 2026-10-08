import fs from 'fs';
import path from 'path';

describe('Profile FREE alignment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('does not put FREE beside Fan/Créateur', () => {
    const start = source.indexOf('<View style={s.profileMetaTopRow}>');
    const end = source.indexOf('{(user.city || user.countryCode)', start);
    const row = source.slice(start, end);
    expect(row).toContain('style={[s.kindBadge');
    expect(row).toContain('<BattleGlowButton');
    expect(row).not.toContain('>FREE</Text>');
    expect(row).not.toContain('profileFreeInline');
  });

  it('aligns FREE immediately after Reprises in the metrics bar', () => {
    const start = source.indexOf('<View style={s.topMetricsBar} accessibilityLabel="Compteurs du profil">');
    const end = source.indexOf('{freeDetailsOpen && !isDemoMode ? (', start);
    const metrics = source.slice(start, end);
    const reprises = metrics.indexOf('>Reprises</Text>');
    const free = metrics.indexOf('>FREE</Text>');
    expect(reprises).toBeGreaterThan(-1);
    expect(free).toBeGreaterThan(reprises);
    expect(metrics).toContain('s.topMetricFreeItem');
    expect(source).toContain("'Voir le détail de mes Free'");
  });
});
