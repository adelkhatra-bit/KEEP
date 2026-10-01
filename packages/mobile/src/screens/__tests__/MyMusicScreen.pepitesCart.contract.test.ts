// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Pépites persistent cart contract', () => {
  const myMusic = read(__dirname, '..', 'MyMusicScreen.tsx');
  const salePanel = read(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001210000_playlist_sale_atomic_move_selection.sql');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('returns to Pépites and keeps the cart per user', () => {
    expect(salePanel).toContain('returnToPicks: true');
    expect(myMusic).toContain('keep:pepites-cart:');
    expect(myMusic).toContain('AsyncStorage.getItem(saleCartStorageKey)');
    expect(myMusic).toContain('AsyncStorage.setItem(saleCartStorageKey');
    expect(myMusic).toContain("navigation.navigate('PlaylistSale', { source: 'PEPITES_CART'");
    expect(myMusic).toContain('PANIER PÉPITES');
  });

  it('lets the user add or remove a track already on sale after warning', () => {
    expect(myMusic).toContain("'Déjà en vente'");
    expect(myMusic).toContain("'Ajouter quand même'");
    expect(myMusic).toContain("'✓ RETIRER'");
    expect(myMusic).toContain("'+ PANIER'");
    expect(myMusic).toContain('alreadySoldElsewhere');
  });

  it('moves conflicting active-sale tracks atomically at publish time', () => {
    expect(service).toContain("keep_playlist_sale_set_offer_for_selection_v4");
    expect(service).toContain('p_move_existing: moveExisting');
    expect(myMusic).toContain('sellTarget.trackIds.some((trackId) => Boolean(myOfferedTrackIds[trackId]))');
    expect(myMusic).toContain("setPlaylistSaleOfferForSelection(sellTarget.trackIds, sellTarget.name, sellPaymentMode, amount, 'EUR', moveExisting)");
    expect(migration).toContain("raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER:%'");
    expect(migration).toContain('delete from public.playlist_sale_offer_tracks');
    expect(migration).toContain('set is_active=false,updated_at=now()');
  });

  it('locks the user-approved Pépites behavior in the canonical contract', () => {
    expect(contract.pepitesCart.persistent).toBe(true);
    expect(contract.pepitesCart.alreadyForSale).toBe('warn-and-allow');
    expect(contract.pepitesCart.returnAfterPublish).toBe('PlaylistSale');
  });
});
