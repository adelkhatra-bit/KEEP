import fs from 'fs';
import path from 'path';

describe('Pépites euro publication payment gate', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');

  it('keeps publication simple: selection, direct configuration, then final validation', () => {
    expect(source).toContain('ÉTAPE 1 SUR 4');
    expect(source).toContain('MODE DE DÉBLOCAGE');
    expect(source).toContain('PRIX DE LA COLLECTION');
    expect(source).toContain('VALIDATION');
    expect(source).toContain('PUBLIER LA COLLECTION');
    expect(source).toContain('Publier sera la seule validation finale.');
    expect(source).not.toContain('ÉTAPE 2 SUR 4');
    expect(source).not.toContain('ÉTAPE 3 SUR 4');
    expect(source).not.toContain('ÉTAPE 4 SUR 4');
  });

  it('blocks euro publication until the seller configured PayPal.Me or a PayPal QR', () => {
    expect(source).toContain("if (sellPaymentMode === 'MONEY' && !payoutLink.trim() && !payoutQrUrl.trim())");
    expect(source).toContain('PAIEMENT À CONFIGURER');
    expect(source).toContain("(!sellPriceCents || (!payoutLink.trim() && !payoutQrUrl.trim()))");
    expect(source).toContain('TESTER MON LIEN');
    expect(source).toContain('setMyPayoutLink(clean)');
    expect(source).toContain('PayPalQrPayoutControl');
  });

  it('keeps FREE publication independent from external payout', () => {
    expect(source).toContain('⚡ FREE LOKI MUSIC');
    expect(source).toContain('Aucun PayPal ni carte bancaire. Le prix est payé en FREE dans Loki Music.');
  });
});
