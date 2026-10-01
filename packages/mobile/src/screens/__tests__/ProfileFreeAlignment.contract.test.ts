import fs from 'fs';
import path from 'path';

describe('Profile FREE alignment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('aligns FREE beside Utilisateur/Créateur before Battle', () => {
    const start = source.indexOf('<View style={s.profileMetaTopRow}>');
    const end = source.indexOf('{(user.city || user.countryCode)', start);
    const row = source.slice(start, end);
    const kind = row.indexOf('style={[s.kindBadge');
    const free = row.indexOf('style={[s.profileFreeInline');
    const battle = row.indexOf('<BattleGlowButton');
    expect(kind).toBeGreaterThanOrEqual(0);
    expect(free).toBeGreaterThan(kind);
    expect(battle).toBeGreaterThan(free);
    expect(row).toContain('<Text style={s.profileFreeInlineLabel}>FREE</Text>');
  });

  it('does not duplicate FREE after Reprises in the metrics bar', () => {
    const start = source.indexOf('<View style={s.topMetricsBar} accessibilityLabel="Compteurs du profil">');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
    const metrics = source.slice(start, end);
    expect(metrics).toContain('<Text style={s.topMetricLabel}>Reprises</Text>');
    expect(metrics).not.toContain('topMetricFreeHero');
    expect(metrics).not.toContain('>FREE</Text>');
    expect(source.match(/accessibilityLabel="Voir le détail de mes Free"/g) ?? []).toHaveLength(1);
  });
});
