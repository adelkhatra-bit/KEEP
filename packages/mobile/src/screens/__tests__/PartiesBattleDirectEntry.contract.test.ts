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

  it('keeps global Battle ranking as an optional dropdown in Soirées', () => {
    expect(source).toContain('const [battleSummaryOpen, setBattleSummaryOpen] = useState(false);');
    expect(source).toContain('<Text style={styles.partyHomeTitle}>Classement Battle</Text>');
    expect(source).toContain('{battleSummaryOpen ? renderLeaderboard() : null}');
  });
});
