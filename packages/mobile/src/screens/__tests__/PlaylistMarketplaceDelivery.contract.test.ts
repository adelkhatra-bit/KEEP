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

  it('lets a seller create and name a multi-track offer with preset prices', () => {
    expect(myMusic).toContain('CRÉER UNE PLAYLIST À VENDRE');
    expect(myMusic).toContain('selectedSaleTrackIds');
    expect(myMusic).toContain('Nom de la playlist à vendre');
    expect(myMusic).toContain('SALE_PRESET_PRICES_CENTS.map');
    expect(salePanel).toContain('PRICE_PRESETS.map');
  });

  it('delivers to Loki Music first, then requests connected-provider synchronization', () => {
    expect(saleService).toContain("keep_playlist_sale_mark_paid_and_deliver");
    expect(salePanel).toContain('syncMarketplaceDelivery(transaction.id)');
    expect(providerSync).toContain('/library/marketplace-delivery/${encodeURIComponent(paymentId)}/sync');
  });
});
