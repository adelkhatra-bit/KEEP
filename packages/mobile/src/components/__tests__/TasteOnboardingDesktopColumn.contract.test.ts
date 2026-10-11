import fs from 'fs';
import path from 'path';

const gate = fs.readFileSync(path.resolve(__dirname, '..', 'TasteOnboardingGate.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('inscription sur ordinateur : une seule colonne centrée (Adel 10/10/2026)', () => {
  it('le titre, le choix « Tu es… » et la carte partagent la même colonne centrée de 680 px au plus', () => {
    expect(gate).toContain("content: { padding: 16, paddingBottom: 24, width: '100%', maxWidth: 680, alignSelf: 'center' }");
  });
});
