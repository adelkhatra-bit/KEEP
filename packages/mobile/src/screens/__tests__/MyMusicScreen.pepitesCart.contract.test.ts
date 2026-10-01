// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Pépites inline cart contract', () => {
  const salePanel = read(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001220000_playlist_sale_confirmed_duplicate_tracks.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('does not redirect collection creation to Playlists/MyMusic', () => {
    expect(salePanel).toContain('openCollectionCart');
    expect(salePanel).not.toContain("createSaleCollection: true");
    expect(contract.pepitesCart.createFlow).toBe('PlaylistSale inline 4-step cart');
    expect(contract.pepitesCart.returnAfterPublish).toBe('stay-PlaylistSale');
  });

  it('warns and requires explicit confirmation for an already-selling track', () => {
    expect(salePanel).toContain('Cette musique est déjà en vente');
    expect(salePanel).toContain('AJOUTER QUAND MÊME');
    expect(salePanel).toContain('collectionCartDuplicateCount > 0');
  });

  it('server keeps the old offer intact when the confirmed duplicate is published', () => {
    expect(service).toContain("keep_playlist_sale_set_offer_for_selection_v5");
    expect(service).toContain('p_allow_existing: allowExisting');
    expect(migration).toContain('and not p_allow_existing');
    expect(migration).not.toContain('delete from public.playlist_sale_offer_tracks');
    expect(migration).toContain("'reusedTrackCount',cardinality(conflict_track_ids)");
  });

  it('cart selection is local until publish', () => {
    expect(contract.pepitesCart.selectionSideEffects).toBe('none-until-publish');
    expect(contract.marketplacePurchases.cartSelectionMustNotMutateVisibilityBeforePublish).toBe(true);
  });
});
