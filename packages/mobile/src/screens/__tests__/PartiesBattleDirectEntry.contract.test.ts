import fs from 'fs';
import path from 'path';

describe('Soirées → Battle direct entry', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');

  it('opens the real Battle in one tap from the top Battle button', () => {
    const label = source.indexOf('accessibilityLabel="Ouvrir directement Battle"');
    const before = source.slice(Math.max(0, label - 450), label + 250);
    expect(label).toBeGreaterThanOrEqual(0);
    expect(before).toContain('setPendingArenaId(undefined); setBattleOpen(true);');
    expect(before).not.toContain("setPartiesTab('BATTLE')");
  });

  it('removes the redundant Salon musical launcher', () => {
    expect(source).not.toContain('accessibilityLabel="Ouvrir le Salon Loki Music Battle"');
    expect(source).not.toContain('<Text style={styles.battleLauncherTitle}>Salon musical</Text>');
  });

  // Adel (02/10/2026) : « le classement n'a rien à faire dans les Soirées » :
  // bouton 🏆 CLASSEMENT dans l'écran Battle, sous le format.
  it('opens the global Battle ranking from the Battle screen, not Soirées', () => {
    const game = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
    expect(source).toContain('const [battleSummaryOpen, setBattleSummaryOpen] = useState(false);');
    expect(source).toContain('onOpenLeaderboard={() => setBattleSummaryOpen(true)}');
    expect(source).toContain('<ScrollView showsVerticalScrollIndicator={false}>{renderLeaderboard()}</ScrollView>');
    expect(source).not.toContain('<Text style={styles.partyHomeTitle}>Classement Battle</Text>');
    expect(game).toContain('accessibilityLabel="Ouvrir le classement Battle"');
    expect(game).toContain('<Text style={s.prefsEditPill}>MODIFIER ›</Text>');
  });
});
