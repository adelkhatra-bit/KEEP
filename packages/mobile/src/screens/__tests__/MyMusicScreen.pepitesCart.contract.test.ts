// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Pépites inline cart contract', () => {
  const salePanel = read(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003041000_unique_active_music_recording_per_profile.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('does not redirect collection creation to Playlists/MyMusic', () => {
    expect(salePanel).toContain('openCollectionCart');
    expect(salePanel).not.toContain("createSaleCollection: true");
    expect(contract.pepitesCart.createFlow).toBe('PlaylistSale inline 4-step cart');
    expect(contract.pepitesCart.returnAfterPublish).toBe('stay-PlaylistSale');
  });

  it('blocks an already-selling track instead of confirming a duplicate', () => {
    expect(salePanel).toContain('Cette musique est déjà dans une collection active');
    expect(salePanel).not.toContain('AJOUTER QUAND MÊME');
    expect(salePanel).toContain('Doublon interdit');
    expect(salePanel).toContain('collectionCartDuplicateCount > 0');
  });

  it('server enforces one active commercial occurrence per recording', () => {
    expect(service).toContain("keep_playlist_sale_set_offer_for_selection_v5");
    expect(migration).toContain('keep_tracks_same_recording');
    expect(migration).toContain('TRACK_ALREADY_IN_ACTIVE_OFFER');
    expect(migration).toContain('trg_playlist_sale_unique_active_recording');
  });

  it('cart selection is local until publish', () => {
    expect(contract.pepitesCart.selectionSideEffects).toBe('none-until-publish');
    expect(contract.marketplacePurchases.cartSelectionMustNotMutateVisibilityBeforePublish).toBe(true);
  });
});
