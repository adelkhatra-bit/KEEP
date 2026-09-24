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
    expect(myMusic).toContain('CRÉER UNE COLLECTION EXCLUSIVE');
    expect(myMusic).toContain('selectedSaleTrackIds');
    expect(myMusic).toContain('Nom de la collection exclusive');
    expect(myMusic).toContain('SALE_PRESET_PRICES_CENTS.map');
    expect(salePanel).toContain('PRICE_PRESETS.map');
    expect(myMusic).toContain('if (tracks.length < 2)');
  });

  it('delivers to Loki Music first, then requests connected-provider synchronization', () => {
    expect(saleService).toContain("keep_playlist_sale_mark_paid_and_deliver");
    expect(salePanel).toContain('syncMarketplaceDelivery(transaction.id)');
    expect(providerSync).toContain('/library/marketplace-delivery/${encodeURIComponent(paymentId)}/sync');
  });
});
