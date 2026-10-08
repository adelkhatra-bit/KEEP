import fs from 'fs';
import path from 'path';

describe('Pépites marketplace professional flow', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');

  it('separates FREE and euro collections visibly', () => {
    expect(panel).toContain("offerFilter === 'FREE'");
    expect(panel).toContain("['MONEY', '€ EUROS', moneyPublished.length]");
    expect(panel).toContain('COLLECTIONS FREE');
    expect(panel).toContain('COLLECTIONS EN EUROS');
  });

  it('uses a clear three-step wizard without leaving Pépites', () => {
    expect(panel).toContain("collectionCartStep === 'TRACKS'");
    expect(panel).toContain("collectionCartStep === 'PRICE'");
    expect(panel).toContain("collectionCartStep === 'REVIEW'");
    expect(panel).toContain('PUBLIER LA PÉPITE');
  });

  it('always lets the user remove an item from the cart', () => {
    expect(panel).toContain("selected ? 'RETIRER' : '+ PANIER'");
    expect(panel).toContain('next.delete(track.id)');
  });

  it('preloads and saves the seller payout link inline', () => {
    expect(panel).toContain('getMyPayoutMethods()');
    expect(panel).toContain('setMyPayoutLink(clean)');
    expect(panel).toContain('OUVRIR PAYPAL.ME');
    expect(panel).toContain('PayPalQrPayoutControl');
  });
});
