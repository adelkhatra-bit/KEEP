import fs from 'fs';
import path from 'path';

describe('Profile FREE alignment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('aligns FREE on the main counter row after Reprises', () => {
    const start = source.indexOf('<View style={s.topMetricsBar} accessibilityLabel="Compteurs du profil">');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
    const row = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(row).toContain('<Text style={s.topMetricLabel}>Reprises</Text>');
    expect(row).toContain('style={[s.topMetricFreeHero, freeDetailsOpen && s.topMetricFreeHeroOn]}');
    expect(row.indexOf('<Text style={s.topMetricLabel}>Reprises</Text>')).toBeLessThan(row.indexOf('topMetricFreeHero'));
  });

  it('does not leave FREE beside Utilisateur or Créateur', () => {
    const start = source.indexOf('<View style={s.profileMetaTopRow}>');
    const end = source.indexOf('<View style={s.topMetricsBar} accessibilityLabel="Compteurs du profil">', start);
    const identityMeta = source.slice(start, end);
    expect(identityMeta).not.toContain('profileFreeInline');
    expect(identityMeta).not.toContain('Voir le détail de mes Free');
  });
});
