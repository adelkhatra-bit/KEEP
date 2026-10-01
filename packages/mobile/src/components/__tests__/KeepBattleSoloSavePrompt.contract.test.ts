import fs from 'fs';
import path from 'path';

describe('Battle Solo save prompt contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');

  it('labels the prompt as Battle Solo only', () => {
    expect(source).toContain('Sauvegarder ce Battle solo ?');
    expect(source).toContain('JOUER lance ce Battle solo sans l’enregistrer.');
  });

  it('keeps exactly three short actions aligned in one row', () => {
    expect(source).toContain("soloSaveActions: { flexDirection: 'row'");
    expect(source).toContain('>ANNULER</Text>');
    expect(source).toContain('>JOUER</Text>');
    expect(source).toContain('>ENREGISTRER</Text>');
    expect(source).toContain('accessibilityLabel="Jouer sans enregistrer"');
    expect(source).toContain('accessibilityLabel="Enregistrer ce Battle solo"');
  });

  it('does not use the native three-button Alert for the save choice', () => {
    expect(source).not.toContain("'Sauvegarder ce Battle ?',");
    expect(source).not.toContain("{ text: 'Jouer sans enregistrer'");
    // A separate two-button end-of-game confirmation may still use this wording.
  });
});
