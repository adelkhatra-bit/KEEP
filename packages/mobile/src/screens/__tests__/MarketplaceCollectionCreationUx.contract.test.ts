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

  it('warns but allows a track already on sale without removing the old offer', () => {
    expect(panel).toContain('Cette musique est déjà en vente');
    expect(panel).toContain('AJOUTER QUAND MÊME');
    expect(service).toContain("keep_playlist_sale_set_offer_for_selection_v5");
    expect(service).toContain('p_allow_existing: allowExisting');
    expect(contract.marketplacePurchases.preventTrackAcrossActiveOffers).toBe(false);
  });

  it('keeps FREE, euro and PayPal setup in the same Pépites flow', () => {
    expect(panel).toContain('⚡ FREE');
    expect(panel).toContain('€ EUROS');
    expect(panel).toContain('OUVRIR PAYPAL.ME');
    expect(panel).toContain('ENREGISTRER LE LIEN');
    expect(panel).toContain('getPayoutLinkForProfile(user.id)');
  });
});
