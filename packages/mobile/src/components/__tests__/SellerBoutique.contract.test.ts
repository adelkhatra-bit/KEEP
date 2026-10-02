import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : boutique vendeur validée (maquette « Boutique Pépites
// Loki ») : Drop du moment 3 max, étagère 10, boutique complète filtrable,
// FREE = violet, € = or, € masqué sur iPhone (règle Apple 3.1.1).
const boutique = fs.readFileSync(path.join(__dirname, '..', 'SellerBoutique.tsx'), 'utf8');
const popup = fs.readFileSync(path.join(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx'), 'utf8');
const rail = fs.readFileSync(path.join(__dirname, '..', 'ProfileOpportunityRail.tsx'), 'utf8');

describe('seller boutique', () => {
  it('limits the Drop du moment to 3 featured collections and the shelf to 10', () => {
    expect(boutique).toContain('.slice(0, DROP_FEATURED_MAX)');
    expect(boutique).toContain('.slice(0, SHELF_MAX)');
  });

  it('offers a full store with search, sorting and FREE / € / style filters', () => {
    expect(boutique).toContain("['FOR_YOU', 'Pour toi'], ['NEW', 'Nouveautés'], ['PRICE', 'Prix croissant']");
    expect(boutique).toContain("storeFilter.startsWith('GENRE:')");
    expect(boutique).toContain('placeholder="Rechercher une collection, un style…"');
  });

  it('hides € collections on iPhone (Apple 3.1.1)', () => {
    expect(boutique).toContain("Platform.OS === 'ios' ? offers.filter((offer) => offer.paymentMode === 'FREE') : offers");
  });

  it('uses violet for FREE and gold for € everywhere (boutique, listening window, profile drop)', () => {
    expect(boutique).toContain('tokenFree: { backgroundColor: colors.primary');
    expect(boutique).toContain("tokenMoney: { backgroundColor: GOLD");
    expect(popup).toContain("totalPricePillFree: { backgroundColor: 'rgba(124,92,252,.18)'");
    expect(popup).toContain("totalPricePillMoney: { backgroundColor: 'rgba(232,194,106,.14)', borderColor: '#E8C26A' }");
    expect(rail).toContain("priceText:{color:'#E8C26A'");
  });

  it('never invents a FREE price when it is missing', () => {
    expect(rail).not.toContain('freePrice ?? 3');
    expect(boutique).toContain("offer.freePrice != null ? `${offer.freePrice} FREE` : 'FREE'");
  });
});
