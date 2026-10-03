import fs from 'fs';
import path from 'path';

// Boutique musicale : 3 Pépites à la une, étagère compacte puis boutique
// complète. FREE reste actionnable partout ; les collections en euros restent
// visibles sur mobile mais sans prix/checkout externe.
const boutique = fs.readFileSync(path.join(__dirname, '..', 'SellerBoutique.tsx'), 'utf8');
const popup = fs.readFileSync(path.join(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx'), 'utf8');
const rail = fs.readFileSync(path.join(__dirname, '..', 'ProfileOpportunityRail.tsx'), 'utf8');

describe('seller boutique', () => {
  it('limits featured collections to 3 and the shelf to 10', () => {
    expect(boutique).toContain('.slice(0, DROP_FEATURED_MAX)');
    expect(boutique).toContain('.slice(0, SHELF_MAX)');
  });

  it('offers a full store with search, sorting and FREE / € / style filters', () => {
    expect(boutique).toContain("['FOR_YOU', 'Pour toi'], ['NEW', 'Nouveautés'], ['PRICE', 'Prix croissant']");
    expect(boutique).toContain("storeFilter.startsWith('GENRE:')");
    expect(boutique).toContain('placeholder="Rechercher une collection, un style…"');
  });

  it('keeps euro collections visible but protected on native, with no native money bundle checkout', () => {
    expect(boutique).toContain("offer.paymentMode !== 'FREE' && Platform.OS !== 'web'");
    expect(boutique).toContain("? 'protégée' : salePriceLabel(offer)");
    expect(boutique).toContain("Platform.OS === 'web' ? bundleOffers : bundleOffers.filter((offer) => offer.paymentMode === 'FREE')");
    expect(boutique).not.toContain("Platform.OS === 'ios' ? offers.filter((offer) => offer.paymentMode === 'FREE') : offers");
  });

  it('uses violet for FREE and gold for € everywhere (boutique, listening window, profile drop)', () => {
    expect(boutique).toContain('tokenFree: { backgroundColor: colors.primary');
    expect(boutique).toContain("tokenMoney: { backgroundColor: GOLD");
    expect(popup).toContain("totalPricePillFree: { backgroundColor: 'rgba(124,92,252,.18)'");
    expect(popup).toContain("totalPricePillMoney: { backgroundColor: 'rgba(232,194,106,.14)', borderColor: '#E8C26A' }");
    expect(rail).toContain("priceChipText:{color:'#E8C26A'");
  });

  it('never invents a FREE price when it is missing', () => {
    expect(rail).not.toContain('freePrice ?? 3');
    expect(boutique).toContain("offer.freePrice != null ? `${offer.freePrice} FREE` : 'FREE'");
  });

  it('lets the owner preview the exact visitor experience without buying their own collection', () => {
    expect(popup).toContain('ownerMode?: boolean');
    expect(popup).toContain('TA COLLECTION · DÉJÀ CHEZ TOI');
    expect(popup).toContain('Tu peux écouter les aperçus et contrôler exactement ce que verra un visiteur.');
    expect(popup).toContain('const currentTrackOwned = ownerMode ||');
  });

  it('shows the Boutique musicale with a featured Pépite and a full searchable store', () => {
    expect(boutique).toContain("ownerMode ? 'MA BOUTIQUE MUSICALE · MES PÉPITES' : 'BOUTIQUE MUSICALE · SES PÉPITES'");
    expect(boutique).toContain('★ PÉPITE À LA UNE');
    expect(boutique).toContain('▶ ÉCOUTER LES APERÇUS');
    expect(boutique).toContain('Tout voir · {visibleOffers.length} ›');
    expect(boutique).not.toContain('<Image');
    expect(boutique).not.toContain('useNativeDriver: true');
  });
});
