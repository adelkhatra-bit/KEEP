import fs from 'fs';
import path from 'path';

// Audit ventes : le profil visiteur reste compact à grande échelle : 3 Drops
// d'abord, puis VOIR PLUS. FREE et PayPal gardent la même structure visuelle
// mais une tonalité distincte et un prix lisible.
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('ventes : collections compactes, prix juste', () => {
  it('VOIR PLUS déroule réellement les collections par paquets et permet de revenir à 3', () => {
    const v = read('PublicUserProfileScreen.tsx');
    expect(v).toContain('{saleOffers.slice(0, visibleSaleCount).map((offer, index) => {');
    expect(v).toContain('onPress={() => setVisibleSaleCount((n) => nextSaleVisibleCount(n, saleOffers.length))}');
    expect(v).not.toContain('{saleOffers.slice(0, 3).map(');
    expect(v).toContain('setVisibleSaleCount(SALE_ROWS_INITIAL);');
    expect(v).toContain('RÉDUIRE À 3');
    expect(v).toContain("tagTone={unlocked ? 'unlocked' : offer.paymentMode === 'FREE' ? 'free' : 'money'}");
  });

  it('la gestion Pépites sépare publiées et retirées (plus de faux « PUBLIÉE »)', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
    expect(panel).toContain('splitSaleOffersByStatus(offers, focusOfferId)');
    expect(panel).toContain('data={filteredPublished}');
    expect(panel).toContain("offerFilter === 'FREE'");
    expect(panel).toContain("offerFilter === 'MONEY'");
    expect(panel).toContain('RETIRÉES ({retired.length})');
    expect(panel).toContain('Non visibles sur ton profil ni par les visiteurs.');
    expect(panel).toContain('route?.params?.manageSaleOfferId');
  });

  it('le gestionnaire affiche FREE ou un prix PayPal lisible sans doublonner EUR', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
    expect(panel).toContain("item.paymentMode === 'FREE'");
    expect(panel).toContain("`${item.freePrice ?? 0} FREE`");
    expect(panel).toContain("item.currencyCode === 'EUR'");
    expect(panel).toContain("`${(item.priceCents / 100).toFixed(2).replace('.', ',')} €`");
    expect(panel).toContain("'PAYPAL'");
  });
});
