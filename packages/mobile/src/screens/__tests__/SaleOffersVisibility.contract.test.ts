import fs from 'fs';
import path from 'path';

// Audit ventes (Adel, 29/09/2026) : un visiteur ne voyait jamais plus de 3
// collections (bouton « PARCOURIR » sans effet) et « Mes albums » affichait un
// prix en € pour une collection débloquable en FREE.
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('ventes : toutes les collections visibles, prix juste', () => {
  it('VOIR PLUS déroule réellement les collections par paquets (et RÉDUIRE les replie)', () => {
    const v = read('PublicUserProfileScreen.tsx');
    expect(v).toContain('{saleOffers.slice(0, visibleSaleCount).map((offer, index) => {');
    expect(v).toContain('onPress={() => setVisibleSaleCount((n) => nextSaleVisibleCount(n, saleOffers.length))}');
    expect(v).not.toContain('{saleOffers.slice(0, 3).map(');
  });

  it('la gestion Pépites sépare publiées et retirées (plus de faux « PUBLIÉE »)', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
    expect(panel).toContain('splitSaleOffersByStatus(offers, focusOfferId)');
    expect(panel).toContain('data={published}');
    expect(panel).toContain('RETIRÉES ({retired.length}) · NON VISIBLES SUR TON PROFIL');
    expect(panel).toContain('route?.params?.manageSaleOfferId');
  });

  it('« Mes albums » affiche FREE pour une collection en FREE, € sinon', () => {
    const m = read('MyMusicScreen.tsx');
    expect(m).toContain("if (full?.paymentMode === 'FREE') return `${full.freePrice ?? 0} FREE`;");
    expect(m).toContain('{saleOfferPriceLabel(offer.offerId, offer.priceCents)}');
  });
});
