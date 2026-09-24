// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\\r\\n/g, '\\n');

describe('Demo keep confirmation + visited profile premium design', () => {
  const swipe = read(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx');
  const listen = read(__dirname, '..', '..', 'components', 'TrackListenControls.tsx');
  const profile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const ownerProfile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const styleCard = read(__dirname, '..', '..', 'components', 'ProfileStyleCard.tsx');
  const featureFlags = read(__dirname, '..', '..', 'services', 'featureFlagService.ts');

  it('never chooses PUBLIC implicitly when account/demo state requires attention', () => {
    expect(swipe).not.toContain("try { await onKeep?.(current, 'PUBLIC'); }");
    const visibilityPrompt = swipe.indexOf('if (askVisibilityOnKeep) {');
    const accountGate = swipe.indexOf('if (requiresAccount) {', visibilityPrompt);
    expect(visibilityPrompt).toBeGreaterThanOrEqual(0);
    expect(accountGate).toBeGreaterThan(visibilityPrompt);
    expect(swipe).toContain('setKeepPromptOpen(true)');
    expect(swipe).toContain("confirmKeep('PUBLIC')");
    expect(swipe).toContain("confirmKeep('PRIVATE')");
  });

  it('lets demo mode exercise the Public/Private choice locally instead of skipping it', () => {
    expect(profile).toContain('requiresAccount={!viewer || isLocalGuest}');
    expect(profile).not.toContain('requiresAccount={!viewer || isLocalGuest || isDemoMode}');
    expect(profile).toContain("isDemoMode ? 'Mode démo' : 'Ajouté à ta collection'");
    expect(profile).toContain("visibility === 'PUBLIC' ? 'PUBLIC sur le profil' : 'PRIVÉ'");
  });

  it('still requires a real account after a guest has chosen visibility, without saving first', () => {
    expect(profile).toContain("if (!viewer || isLocalGuest) {");
    expect(profile).toContain('Ton choix de visibilité est bien pris en compte, mais crée ou connecte ton compte');
  });

  it('resolves an inline audio preview even when discovery search links exist', () => {
    expect(listen).toContain('if (track.previewUrl || embedUrl) return;');
    expect(listen).not.toContain('if (track.previewUrl || embedUrl || externalPlayUrl) return;');
    expect(listen).toContain('resolveTrackPreviewUrl(track)');
  });

  it('uses the approved colorful card system for public styles and a separate locked collection carousel', () => {
    expect(profile).toContain("import ProfileStyleCard from '../components/ProfileStyleCard';");
    expect(profile).toContain('mode="PUBLIC"');
    expect(profile).toContain("mode={unlocked ? 'UNLOCKED' : 'LOCKED'}");
    expect(profile).toContain("onPress={() => openBrowseSwipe({ type: 'genre', value: genre, label: genre })}");
    expect(profile).toContain('artworkUrl={genreArtwork[genre]}');
    expect(profile).toContain('horizontal');
    expect(profile).toContain('saleCarouselCard');
    expect(profile).toContain('SON GOÛT MUSICAL · SES COLLECTIONS');
    expect(styleCard).toContain('<ImageBackground');
    expect(styleCard).toContain('const PUBLIC_GRADIENTS');
    expect(styleCard).toContain('const SALE_GRADIENTS');
  });

  it('never passes real artwork metadata into a locked collection card and keeps sale products out of the public style grid', () => {
    const saleCardStart = profile.indexOf('key={`sale-carousel:${offer.offerId}`}');
    const saleCardEnd = profile.indexOf('/>', saleCardStart);
    const saleCard = profile.slice(saleCardStart, saleCardEnd);
    expect(saleCard).not.toContain('artworkUrl=');
    expect(profile).not.toContain('key={`sale-style:${offer.offerId}`}');
    expect(profile).toContain('fullWidth={totalStyleCardCount % 2 === 1 && index === freeStyleCardCount - 1}');
  });

  it('never hides active sale products behind the checkout feature flag', () => {
    expect(featureFlags).toContain('export async function isPlaylistMarketplaceVisible(): Promise<boolean>');
    expect(featureFlags).toContain('return Boolean(supabase);');
    expect(featureFlags).toContain("if (Platform.OS !== 'web') return false;");
    expect(featureFlags).toContain("return isFeatureEnabled('playlist_marketplace');");
  });

  it('makes a seller unmistakable as soon as the visited profile opens', () => {
    expect(profile).toContain('BOUTIQUE MUSICALE ACTIVE');
    expect(profile).toContain("collection{saleOffers.length > 1 ? 's' : ''} exclusive");
    expect(profile).toContain('Extraits anonymes · vrais titres masqués avant déblocage');
    expect(profile).toContain('SON GOÛT MUSICAL · SES COLLECTIONS');
  });

  it('shows already-owned counts directly on public style cards', () => {
    expect(profile).toContain('const genreAlreadyOwnedCounts = useMemo(() => {');
    expect(profile).toContain('déjà chez toi');
    expect(profile).toContain("badgeLabel={allOwned ? '✓ DÉJÀ CHEZ TOI'");
  });

  it('uses the same immersive visual system on the owner profile without file-folder UI as the primary styles view', () => {
    expect(ownerProfile).toContain("import ProfileStyleCard from '../components/ProfileStyleCard';");
    expect(ownerProfile).toContain('style={s.ownerStyleGrid}');
    expect(ownerProfile).toContain("actionLabel={marketplaceEnabled ? 'CRÉER' : undefined}");
    expect(ownerProfile).toContain('title="JOUER EN SOLO"');
    expect(ownerProfile).toContain('BOUTIQUE ACTIVE');
  });

  it('gives a newly registered empty profile a real first action instead of a dead empty state', () => {
    expect(ownerProfile).toContain('TON UNIVERS COMMENCE ICI');
    expect(ownerProfile).toContain('Garde ta première découverte.');
    expect(ownerProfile).toContain("navigation.navigate('Main', { screen: 'Listen' })");
  });

  it('plays public style audio inline without forcing navigation', () => {
    expect(profile).toContain('const playInlinePublicTrack = async');
    expect(profile).toContain('toggleTrackPreview(');
    expect(profile).toContain('resolveTrackPreviewUrl(track)');
    expect(profile).toContain('Tu peux quand même l’écouter ici.');
    expect(profile).toContain('onPlayPress={() => void playInlinePublicTrack');
  });

  it('plays locked collection previews anonymously from the collection carousel', () => {
    expect(profile).toContain('loadPlaylistSaleOfferPreviewTracks(offer.playlistId)');
    expect(profile).toContain('onPlayPress={() => openSaleFolder(offer)}');
    expect(profile).toContain('Lancer la préécoute anonyme de toute la collection');
  });

  it('renders locked sale cards with a vivid dedicated palette', () => {
    expect(styleCard).toContain('const SALE_GRADIENTS');
    expect(styleCard).toContain("['#FF2D78', '#7A00FF']");
    expect(styleCard).toContain('colors={locked ? salePalette');
    expect(styleCard).toContain('onPlayPress?: () => void;');
  });

  it('keeps sold tracks out of the free Swipe source', () => {
    expect(profile).toContain('const visible = maskedIds.length ? normalized.filter((t) => !maskedIds.includes(t.trackId)) : normalized;');
    expect(profile).toContain('setTracks(visible);');
    expect(profile).toContain('const swipeTracks = useMemo<CanonicalTrack[]>(() => tracks.map((track) => ({');
  });
});
