// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Mes Sessions compact header help contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'SessionHistoryScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the header compact without plan or redundant history eyebrow', () => {
    expect(source).toContain('accessibilityLabel="Comprendre Mes Sessions"');
    expect(source).not.toContain('SESSION_PLAN_BADGE');
    expect(source).not.toContain('<Text style={styles.headerEyebrow}>HISTORIQUE</Text>');
    expect(source).not.toContain('getDownloadCreditStatus');
  });

  it('explains the session workflow behind a question-mark help sheet', () => {
    expect(source).toContain('title="Mes Sessions"');
    expect(source).toContain("title: 'Retrouver une écoute'");
    expect(source).toContain("title: 'Swiper ce qui reste'");
    expect(source).toContain("title: 'Garder sans doublon'");
    expect(source).toContain("title: 'Supprimer une session'");
  });
});
