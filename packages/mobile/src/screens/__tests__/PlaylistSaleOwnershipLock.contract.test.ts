// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Exclusive collection privacy + ownership contracts', () => {
  const myMusic = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const saleService = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const previewMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260920201000_playlist_sale_offer_preview_tracks.sql');
  const freeMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924163120_playlist_sale_free_mode.sql');
  const freeAccessMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924163533_playlist_sale_free_transfer_access_hardening.sql');
  const permanentUserMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924163615_playlist_sale_free_permanent_user_only.sql');
  const freeIndexMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924163717_playlist_sale_free_transfer_indexes.sql');
  const featureFlags = readNormalized(__dirname, '..', '..', 'services', 'featureFlagService.ts');
  const immersivePreview = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx');
  const salePanel = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');

  it('never lets a social reprise be added to someone else\'s exclusive collection', () => {
    expect(myMusic).toContain('const notOwnDiscovery = Boolean(localEntry?.sourceProfileId);');
    expect(myMusic).toContain('notOwnDiscovery && styles.selectionCheckLocked');
    expect(myMusic).toContain("? Alert.alert('Non éligible'");
    expect(myMusic).toContain('disabled={Boolean(offered)}');
  });

  it('removes every active-offer track from the public/free profile source', () => {
    expect(publicProfile).toContain('loadMaskedPlaylistSaleTrackIds(result.id)');
    expect(publicProfile).toContain('const visible = maskedIds.length ? normalized.filter((t) => !maskedIds.includes(t.trackId)) : normalized;');
    expect(publicProfile).toContain('setTracks(visible);');
    expect(publicProfile).not.toContain('<LockedTrackRow');
  });

  it('represents paid music only as one locked collection card in a separate horizontal rail', () => {
    expect(publicProfile).toContain('saleCarouselContent');
    expect(publicProfile).toContain('horizontal');
    expect(publicProfile).toContain('key={`sale-carousel:${offer.offerId}`}');
    expect(publicProfile).toContain("badgeLabel={unlocked ? '✓ DÉBLOQUÉE' : '🔒 COLLECTION SECRÈTE'}");
    expect(publicProfile).not.toContain('sale-style:');
  });

  it('never exposes title, artist or artwork through the anonymous preview RPC', () => {
    expect(saleService).toContain('export type PlaylistSalePreviewTrack = {');
    expect(saleService).toContain('trackId: string;');
    expect(saleService).toContain('previewUrl: string;');
    expect(previewMigration).toContain('returns table(track_id uuid, preview_url text)');
    expect(previewMigration).not.toMatch(/returns table\([^)]*(title|artist|artwork)/i);
    expect(publicProfile).not.toContain('artworkUrl={offer.');
  });

  it('keeps product visibility independent from checkout availability', () => {
    expect(featureFlags).toContain('export async function isPlaylistMarketplaceVisible(): Promise<boolean>');
    expect(featureFlags).toContain('return Boolean(supabase);');
    expect(featureFlags).toContain("if (Platform.OS !== 'web') return false;");
    expect(featureFlags).toContain("return isFeatureEnabled('playlist_marketplace');");
  });

  it('supports one FREE debit for the whole collection, with server-side delivery', () => {
    expect(saleService).toContain('purchasePlaylistOfferWithFree');
    expect(publicProfile).toContain("if (offer.paymentMode === 'FREE')");
    expect(publicProfile).toContain('purchasePlaylistOfferWithFree(offer.offerId)');
    expect(publicProfile).toContain("purchaseEnabled={immersivePreviewOffer.paymentMode === 'FREE' || marketplacePurchaseEnabled}");
    expect(freeMigration).toContain('keep_playlist_sale_purchase_with_free');
    expect(freeMigration).toContain('keep_playlist_sale_deliver_payment_core');
    expect(freeMigration).toContain('unique (offer_id, buyer_id)');
  });

  it('enforces collection-only products on the server, never one-track offers', () => {
    expect(freeMigration).toContain("raise exception 'COLLECTION_MIN_TWO_TRACKS'");
    expect(freeMigration).toContain('if v_remaining < 2 then');
    expect(freeMigration).toContain('set is_active = false');
    expect(freeMigration).toContain('drop constraint if exists playlist_sale_offers_price_cents_check');
    expect(freeMigration).toContain('drop constraint if exists playlist_sale_offers_price_preset');
  });

  it('blocks Supabase anonymous sign-ins from the FREE transfer ledger', () => {
    expect(freeAccessMigration).toContain('revoke all on table public.playlist_sale_free_transfers from anon, authenticated;');
    expect(freeAccessMigration).toContain('grant select on table public.playlist_sale_free_transfers to authenticated;');
    expect(permanentUserMigration).toContain("(auth.jwt()->>'is_anonymous')::boolean");
    expect(permanentUserMigration).toContain('is false');
  });

  it('indexes seller and buyer ownership lookups for FREE transfers', () => {
    expect(freeIndexMigration).toContain('idx_playlist_sale_free_transfers_seller');
    expect(freeIndexMigration).toContain('idx_playlist_sale_free_transfers_buyer');
  });

  it('keeps the FREE transfer adjustment helper inaccessible to app clients', () => {
    expect(freeMigration).toContain('revoke all on function public.keep_playlist_sale_free_adjustment_for_profile(uuid) from public, anon, authenticated;');
    expect(freeMigration).not.toContain('grant execute on function public.keep_playlist_sale_free_adjustment_for_profile(uuid) to authenticated;');
  });

  it('requires an explicit confirmation before debiting FREE for a collection', () => {
    expect(immersivePreview).toContain("const freeAccess = offer.paymentMode === 'FREE';");
    expect(immersivePreview).toContain("Confirmer l'utilisation de ${priceLabel} pour toute la collection");
    expect(immersivePreview).toContain("Je confirme utiliser ${priceLabel} pour débloquer les ${trackCountLabel} morceau");
    expect(immersivePreview).toContain('Aucun débit n’est effectué morceau par morceau.');
  });

  it('lets the owner switch an existing collection between euro and FREE without rebuilding it', () => {
    expect(saleService).toContain('updateOfferPaymentMode');
    expect(salePanel).toContain('Mode de déblocage');
    expect(salePanel).toContain('€ EUROS');
    expect(salePanel).toContain('⚡ FREE');
    expect(salePanel).toContain('updateOfferPaymentMode(editing.offerId, editing.paymentMode, amount)');
  });

  it('keeps native collection management visible while external checkout remains gated', () => {
    expect(salePanel).toContain('isPlaylistMarketplaceVisible()');
    expect(salePanel).toContain('setMarketplaceTransactionEnabled(transactionEnabled)');
    expect(salePanel).toContain('GESTION DES COLLECTIONS ACTIVE');
    expect(salePanel).toContain('♫ Morceaux');
    expect(salePanel).toContain('€ / FREE');
    expect(immersivePreview).toContain('APERÇU MOBILE ACTIF');
  });

  it('keeps sale access refresh reactive when marketplace visibility changes', () => {
    expect(myMusic).toContain('}, [navigation, refresh, syncUnsyncedKeeps, userId, isLocalGuest, isDemoMode, marketplaceEnabled]);');
  });
});
