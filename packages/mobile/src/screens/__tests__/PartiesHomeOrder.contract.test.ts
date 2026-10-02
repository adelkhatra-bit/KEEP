import fs from 'fs';
import path from 'path';

describe('Événements home order and help', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8');

  // Adel (02/10/2026) : le Classement Battle est dans l'écran Battle, plus dans Soirées.
  it('orders publish, my events, invitations (no Battle ranking in Soirées)', () => {
    const start = source.indexOf("{partyHome ? <View style={styles.partyHome}>");
    const publish = source.indexOf('accessibilityLabel="Créer une soirée"', start);
    const mine = source.indexOf('Mes soirées', start);
    const invites = source.indexOf('accessibilityLabel="Voir mes invitations"', start);
    expect(publish).toBeGreaterThan(start);
    expect(mine).toBeGreaterThan(publish);
    expect(invites).toBeGreaterThan(mine);
    expect(source).not.toContain('<Text style={styles.partyHomeTitle}>Classement Battle</Text>');
  });

  it('uses a help question mark instead of a duplicate lock in the header', () => {
    expect(source).toContain('eventHelpButtonText}>?</Text>');
    expect(source).toContain('Tout faire dans Soirées');
    expect(source).toContain('Répondre aux invitations');
    expect(source).not.toContain("accessibilityLabel=\"Afficher mes droits de création d'événement\"");
  });
});
