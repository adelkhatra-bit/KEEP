// @ts-nocheck
import fs from 'fs';
import path from 'path';

// RÈGLE VERROUILLÉE (Adel 02/10/2026) : « c'est pas la première fois que je
// vois cette manière de coder … aligne-les tous en bas dans la longueur ».
// Popup « Solos terminés » et popup e-mail du mode démo : 3 boutons calés à
// droite, de largeurs différentes, le 3e renvoyé seul à la ligne.
describe('Popup Loki (AlertHost) : boutons sur une ligne, même largeur', () => {
  const host = fs.readFileSync(path.resolve(__dirname, '..', 'AlertHost.tsx'), 'utf8');

  it('une seule ligne en bas, sans renvoi à la ligne jusqu’à 3 boutons', () => {
    expect(host).toContain("buttons: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 }");
    expect(host).not.toMatch(/buttons: \{[^}]*flexWrap/);
    expect(host).not.toMatch(/buttons: \{[^}]*justifyContent: 'flex-end'/);
  });

  it('chaque bouton prend la même largeur ; un long libellé passe sur 2 lignes dans son bouton', () => {
    expect(host).toContain('buttonEqual: { flex: 1, minWidth: 0 }');
    expect(host).toContain('numberOfLines={2}');
    expect(host).toContain("textAlign: 'center'");
  });

  it('au-delà de 3 boutons : grille régulière de 2 colonnes', () => {
    expect(host).toContain("current.buttons.length > 3 && s.buttonsGrid");
    expect(host).toContain("buttonHalf: { width: '48%', flexGrow: 1 }");
  });
});
