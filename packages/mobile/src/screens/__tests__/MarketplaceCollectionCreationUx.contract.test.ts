import fs from 'fs';
import path from 'path';

describe('Pépites collection creation UX', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'playlistSaleService.ts'), 'utf8');
  const contract = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'), 'utf8'));

  it('keeps the creation flow inside Pépites', () => {
    expect(panel).toContain('PANIER PÉPITES');
    expect(panel).toContain('collectionCartOpen');
    expect(panel).toContain('Tu es resté dans Pépites.');
    expect(panel).not.toContain("screen: 'MyMusic', params: { createSaleCollection: true");
    expect(contract.marketplacePurchases.collectionCreationMustRemainInPepites).toBe(true);
  });

  it('uses a reversible cart with no visibility side effect before publish', () => {
    expect(panel).toContain("selected ? 'RETIRER' : '+ PANIER'");
    expect(panel).toContain('setCollectionCartIds');
    expect(panel).not.toContain('setSaleTrackVisibility');
    expect(contract.marketplacePurchases.cartSelectionMustNotMutateVisibilityBeforePublish).toBe(true);
  });

  it('blocks a track already present in another active collection', () => {
    expect(panel).toContain('Cette musique est déjà dans une collection active');
    expect(panel).not.toContain('AJOUTER QUAND MÊME');
    expect(panel).toContain('Un même enregistrement ne peut appartenir qu’à une seule collection active');
    expect(service).toContain("keep_playlist_sale_set_offer_for_selection_v5");
    expect(contract.marketplacePurchases.preventTrackAcrossActiveOffers).toBe(true);
    expect(contract.marketplacePurchases.existingOfferTrackPolicy).toBe('block-and-keep-existing-offer');
  });

  it('reviews the basket before price and payment', () => {
    expect(panel).toContain("collectionCartStep === 'REVIEW'");
    expect(panel).toContain("OUI, MA SÉLECTION EST TERMINÉE");
    expect(panel).toContain('Aucun prix n’est demandé tant que tu n’as pas confirmé cette sélection.');
    expect(contract.marketplacePurchases.creationWizardSteps).toEqual(['TRACKS','CART_REVIEW','MODE_PRICE_CURRENCY','PAYOUT_PUBLISH']);
    expect(contract.marketplacePurchases.cartReviewMustPrecedePricing).toBe(true);
  });

  it('keeps FREE, currencies and reusable PayPal setup in the same Pépites flow', () => {
    expect(panel).toContain('⚡ FREE');
    expect(panel).toContain('<Text style={s.collectionCartFieldLabel}>DEVISE</Text>');
    expect(panel).toContain('MARKETPLACE_CURRENCIES');
    expect(panel).toContain('collectionCartCurrencyCode');
    expect(panel).toContain('OUVRIR PAYPAL.ME');
    expect(panel).toContain("ENREGISTRER PAYPAL");
    expect(panel).toContain('getMyPayoutMethods()');
    expect(panel).toContain('PayPalQrPayoutControl');
    expect(contract.marketplacePurchases.savedPayoutLinkMustBeReused).toBe(true);
  });
});
