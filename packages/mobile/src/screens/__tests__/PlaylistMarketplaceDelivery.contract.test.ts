// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki Music playlist marketplace delivery contract', () => {
  const publicProfile = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8');
  const myMusic = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const salePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
  const saleService = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'playlistSaleService.ts'), 'utf8');
  const providerSync = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'musicProviderSyncService.ts'), 'utf8');

  it('purchases the offer UUID exposed by the public listing', () => {
    expect(publicProfile).toContain('requestPlaylistPurchase(offer.offerId)');
    expect(saleService).toContain("offerId: String(row.offer_id ?? row.offerId ?? '')");
  });

  it('lets a creator build and name a multi-track exclusive collection with preset prices', () => {
    expect(myMusic).toContain('Créer une collection');
    expect(myMusic).toContain("ÉTAPE 1 SUR 4");
    expect(myMusic).toContain('selectedSaleTrackIds');
    expect(myMusic).toContain('Nom de la collection exclusive');
    expect(myMusic).toContain("(sellPaymentMode === 'FREE' ? SALE_PRESET_FREE : SALE_PRESET_PRICES_CENTS).map");
    expect(salePanel).toContain('SALE_PRESET_PRICES_CENTS');
    expect(salePanel).toContain('SALE_PRESET_FREE');
    expect(salePanel).toContain("updateOfferPaymentMode(editing.offerId, editing.paymentMode, amount, editing.paymentMode === 'BOTH' ? editing.freePrice : null)");
    expect(myMusic).toContain("if (saleCartTracks.length < 2)");
  });

  it('keeps the Pépites creation flow as selection -> cart review -> payment -> final publish', () => {
    expect(salePanel).toContain("collectionCartStep === 'TRACKS'");
    expect(salePanel).toContain("collectionCartStep === 'REVIEW'");
    expect(salePanel).toContain("collectionCartStep === 'PRICE'");
    expect(salePanel).toContain("J’AI FINI MA SÉLECTION");
    expect(salePanel).toContain('OUVRIR MON PANIER →');
    expect(salePanel).toContain('OUI, MA SÉLECTION EST TERMINÉE');
    expect(salePanel).toContain('<Text style={s.collectionCartFieldLabel}>DEVISE</Text>');
    expect(salePanel).toContain("host === 'paypal.me'");
    expect(salePanel).toContain('PAYPAL DÉJÀ ENREGISTRÉ');
  });

  it('uses the blue design system for the Pépites cart confirmation CTA', () => {
    expect(salePanel).toContain('collectionCartReadyButton:{minHeight:76');
    expect(salePanel).toContain('backgroundColor:colors.primary');
    expect(salePanel).not.toContain("collectionCartContinueHero:{flex:1,minHeight:62,backgroundColor:'#FFD166'}");
  });

  it('delivers to Loki Music first, then requests connected-provider synchronization', () => {
    expect(saleService).toContain("keep_playlist_sale_mark_paid_and_deliver");
    expect(salePanel).toContain('syncMarketplaceDelivery(transaction.id)');
    expect(providerSync).toContain('/library/marketplace-delivery/${encodeURIComponent(paymentId)}/sync');
  });
});
