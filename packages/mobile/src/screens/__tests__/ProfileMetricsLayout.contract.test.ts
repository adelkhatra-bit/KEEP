import fs from 'fs';
import path from 'path';

describe('Profile metrics layout — explicit 30/09/2026 alignment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('keeps one FREE control, directly beside Utilisateur/Créateur profile type', () => {
    expect(source).toContain('profileMetaBadgeGroup:{flexDirection:\'row\'');
    expect(source).toContain('style={[s.profileFreeInline, freeDetailsOpen && s.profileFreeInlineOn]}');
    expect(source).toContain('<Text style={s.profileFreeInlineLabel}>FREE</Text>');
    const controls = source.match(/accessibilityLabel="Voir le détail de mes Free"/g) ?? [];
    expect(controls).toHaveLength(1);
  });

  it('preserves PLUS, Abonnés and Reprises in the metrics bar', () => {
    const start = source.indexOf('<View style={s.topMetricsBar}');
    const end = source.indexOf('{freeDetailsOpen ? (', start);
    const bar = source.slice(start, end);
    expect(bar).toContain('>PLUS</Text>');
    expect(bar).toContain('>Abonnés</Text>');
    expect(bar).toContain('>Reprises</Text>');
    expect(bar).not.toContain('topMetricFreeHero');
  });
});
