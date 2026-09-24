// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (21/09/2026) : "il ne faut pas qu'il y ait la possibilité de vendre
 * une musique que l'utilisateur a pris à un autre utilisateur -- il faut lui
 * mettre un cadenas et quand il clique dessus ça lui dit que cette musique
 * ne lui appartient pas, elle appartient à un autre utilisateur."
 *
 * Et, séparément : "côté profil utilisateur, lorsqu'un autre utilisateur va
 * visiter un autre utilisateur, il faut que tout soit visible -- même s'il
 * n'a pas de musique à la vente, il faut que le système soit fonctionnel et
 * visible. Et quand je clique dessus, ça marque qu'il n'a pas encore de
 * musique en vente."
 */
describe('Vente de musique -- cadenas "pas ta découverte" + section toujours visible sur le profil visité (Adel, 21/09/2026)', () => {
  const myMusic = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const lockedTrackRow = readNormalized(__dirname, '..', '..', 'components', 'LockedTrackRow.tsx');
  const saleService = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const previewMigration = readNormalized(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260920201000_playlist_sale_offer_preview_tracks.sql');
  const featureFlags = readNormalized(__dirname, '..', '..', 'services', 'featureFlagService.ts');
  const immersivePreview = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx');
  const salePanel = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');

  it('MyMusicScreen locks the sale checkbox for a track that came from another profile (sourceProfileId set = not self-discovered), styled red (Adel, 21/09/2026 : "il faut que le cadenas soit rouge")', () => {
    expect(myMusic).toContain('const notOwnDiscovery = Boolean(localEntry?.sourceProfileId);');
    expect(myMusic).toContain('notOwnDiscovery && styles.selectionCheckLocked');
    expect(myMusic).toContain("selectionCheckLocked:{opacity:1,borderColor:colors.danger,backgroundColor:'rgba(255,92,114,0.12)'}");
    expect(myMusic).toContain("{notOwnDiscovery ? '🔒' : selectedSaleTrackIds.has(track.id) ? '✓' : ''}");
  });

  it('tapping the locked checkbox tells the user the track belongs to someone else and explains why, not a silent no-op', () => {
    expect(myMusic).toContain("? Alert.alert('Pas à vendre', `\"${track.title}\" ne peut pas être vendue : elle vient d'un autre utilisateur. Il doit l'avoir gardée depuis sa propre écoute pour pouvoir la vendre.`)");
  });

  it('the lock never fully disables the checkbox (only "offered" does) so the explanatory tap still fires', () => {
    expect(myMusic).toContain('disabled={Boolean(offered)}');
    expect(myMusic).not.toContain('disabled={Boolean(offered || notOwnDiscovery)}');
  });

  it('PublicUserProfileScreen always renders the "Découvertes à débloquer" section once marketplace is enabled -- never fully hidden just because the seller has zero active offers', () => {
    expect(publicProfile).toContain('{marketplaceEnabled ? (');
    expect(publicProfile).not.toContain('{marketplaceEnabled && saleOffers.length > 0 ? (');
  });

  it('an empty offer list shows a tappable, explicit "pas encore de musique en vente" state instead of nothing', () => {
    expect(publicProfile).toContain('{saleOffers.length === 0 ? (');
    expect(publicProfile).toContain("onPress={() => Alert.alert('Découvertes à débloquer', `@${profile.username} n'a pas encore de musique en vente.`)}");
    expect(publicProfile).toContain('<Text style={styles.marketplaceEmptyText}>Pas encore de musique en vente</Text>');
  });

  it('never reveals paid track title, artist or artwork before unlock', () => {
    expect(lockedTrackRow).toContain("const MASKED_TITLE = '???';");
    expect(lockedTrackRow).toContain("const MASKED_ARTIST = 'Artiste masqué';");
    expect(lockedTrackRow).toContain('blurRadius={16}');
    expect(saleService).toContain('export type PlaylistSalePreviewTrack = {');
    expect(saleService).toContain('trackId: string;');
    expect(saleService).toContain('previewUrl: string;');
    expect(previewMigration).toContain('returns table(track_id uuid, preview_url text)');
    expect(previewMigration).not.toMatch(/returns table\([^)]*(title|artist|artwork)/i);
  });

  it('keeps marketplace products and anonymous previews visible on native while external checkout remains web-only', () => {
    expect(featureFlags).toContain('export async function isPlaylistMarketplaceVisible(): Promise<boolean>');
    expect(featureFlags).toContain("return isFeatureEnabled('playlist_marketplace');");
    expect(featureFlags).toContain("if (Platform.OS !== 'web') return false;");
    expect(publicProfile).toContain('isPlaylistMarketplaceVisible()');
    expect(publicProfile).toContain('setMarketplacePurchaseEnabled(purchaseEnabled)');
    expect(publicProfile).toContain('purchaseEnabled={marketplacePurchaseEnabled}');
    expect(immersivePreview).toContain('APERÇU MOBILE ACTIF');
    expect(immersivePreview).toContain('L’achat n’est pas activé dans cette version mobile.');
  });

  it('keeps seller catalog management available on native without exposing native payment operations', () => {
    expect(salePanel).toContain('isPlaylistMarketplaceVisible()');
    expect(salePanel).toContain('setMarketplaceTransactionEnabled(transactionEnabled)');
    expect(salePanel).toContain('GESTION MOBILE ACTIVE');
    expect(salePanel).toContain('♫ Morceaux');
    expect(salePanel).toContain('€ Prix');
    expect(salePanel).toContain('✕ Retirer');
    expect(salePanel).toContain("marketplaceTransactionEnabled && sales.filter((s2) => s2.status === 'PENDING').length > 0");
    expect(salePanel).toContain('marketplaceTransactionEnabled && purchases.length > 0');
  });

  it('keeps ordinary shared music directly listenable while locked sale tracks use the anonymous unlock row', () => {
    expect(publicProfile).toContain('playSlot={<TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} square />}');
    expect(publicProfile).toContain('<LockedTrackRow');
    expect(publicProfile).toContain('track={{ id: track.trackId }}');
    expect(publicProfile).not.toContain('track={{ id: track.trackId, title: track.title');
  });

  /**
   * Adel (21/09/2026) : "1000 abonnés assignés via Super Admin, la fonction
   * reste verrouillée -- comment ça se fait que je suis encore bloqué ?"
   *
   * BUG RÉEL trouvé et corrigé : l'effet qui charge saleAccess/refreshLibrary
   * s'abonnait à l'événement 'focus' avec une fermeture figée au montage, où
   * marketplaceEnabled valait encore `false` (le flag async n'avait pas fini
   * de charger). Ce même abonnement périmé était ensuite rappelé à chaque
   * focus d'écran sans jamais relire la valeur à jour de marketplaceEnabled
   * -- saleAccess restait donc bloqué à null indéfiniment, même une fois le
   * flag/bypass Super Admin activé côté serveur.
   */
  it('the sale-access effect re-subscribes (and re-fetches) whenever marketplaceEnabled flips, instead of running once with a stale closure forever', () => {
    expect(myMusic).toContain('}, [navigation, refresh, syncUnsyncedKeeps, userId, isLocalGuest, isDemoMode, marketplaceEnabled]);');
    expect(myMusic).not.toContain('}, [navigation, refresh, syncUnsyncedKeeps, userId, isLocalGuest, isDemoMode]);');
  });
});
