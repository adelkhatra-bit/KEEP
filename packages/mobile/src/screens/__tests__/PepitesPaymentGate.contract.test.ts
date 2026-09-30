import fs from 'fs';
import path from 'path';

describe('Pépites euro publication payment gate', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');

  it('shows the publication flow in three explicit steps', () => {
    expect(source).toContain('ÉTAPE 1 · TYPE D’ACCÈS');
    expect(source).toContain('ÉTAPE 2 · PRIX');
    expect(source).toContain('ÉTAPE 3 · PAIEMENT');
  });

  it('blocks euro publication until the seller configured a payout link', () => {
    expect(source).toContain("sellPaymentMode === 'MONEY' && !payoutLink.trim()");
    expect(source).toContain('MODE DE PAIEMENT REQUIS');
    expect(source).toContain("(!sellPriceCents || !payoutLink.trim())");
  });

  it('keeps FREE publication independent from external payout', () => {
    expect(source).toContain('⚡ FREE LOKI MUSIC');
    expect(source).toContain('Aucun lien de paiement externe nécessaire.');
  });
});
