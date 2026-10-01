import fs from 'fs';
import path from 'path';

describe('Pépites euro publication payment gate', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');

  it('shows the publication flow in three explicit steps', () => {
    expect(source).toContain('ÉTAPE 1 SUR 3');
    expect(source).toContain('ÉTAPE 2 SUR 3');
    expect(source).toContain('ÉTAPE 3 SUR 3');
    expect(source).toContain('MODE DE DÉBLOCAGE');
    expect(source).toContain('PRIX DE LA COLLECTION');
  });

  it('blocks euro publication until the seller configured a tested payout link', () => {
    expect(source).toContain("if (sellPaymentMode === 'MONEY' && !payoutLink.trim())");
    expect(source).toContain('PAIEMENT À CONFIGURER');
    expect(source).toContain("(!sellPriceCents || !payoutLink.trim())");
    expect(source).toContain('TESTER MON LIEN');
    expect(source).toContain('setMyPayoutLink(clean)');
  });

  it('keeps FREE publication independent from external payout', () => {
    expect(source).toContain('⚡ FREE LOKI MUSIC');
    expect(source).toContain('Aucun PayPal ni carte bancaire. Le prix est payé en FREE dans Loki Music.');
  });
});
