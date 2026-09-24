// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\\r\\n/g, '\\n');

describe('Demo keep confirmation + visited profile premium design', () => {
  const swipe = read(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx');
  const listen = read(__dirname, '..', '..', 'components', 'TrackListenControls.tsx');
  const profile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const styleCard = read(__dirname, '..', '..', 'components', 'ProfileStyleCard.tsx');

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

  it('uses the approved colorful card system for public and locked styles', () => {
    expect(profile).toContain("import ProfileStyleCard from '../components/ProfileStyleCard';");
    expect(profile).toContain('mode="PUBLIC"');
    expect(profile).toContain("mode={unlocked ? 'UNLOCKED' : 'LOCKED'}");
    expect(profile).toContain("onPress={() => openBrowseSwipe({ type: 'genre', value: genre, label: genre })}");
    expect(profile).toContain('artworkUrl={genreArtwork[genre]}');
    expect(styleCard).toContain('<ImageBackground');
    expect(styleCard).toContain('const PUBLIC_GRADIENTS');
    expect(styleCard).toContain("locked ? '🔒 EN VENTE'");
  });

  it('never passes real artwork metadata into a locked sale style card and removes odd-grid black holes', () => {
    const saleCardStart = profile.indexOf('key={`sale-style:${offer.offerId}`}');
    const saleCardEnd = profile.indexOf('/>', saleCardStart);
    const saleCard = profile.slice(saleCardStart, saleCardEnd);
    expect(saleCard).not.toContain('artworkUrl=');
    expect(profile).toContain('fullWidth={totalStyleCardCount % 2 === 1 && index === saleOffers.length - 1}');
    expect(profile).toContain('fullWidth={totalStyleCardCount % 2 === 1 && visibleSaleCardCount === 0 && index === freeStyleCardCount - 1}');
  });

  it('keeps sold tracks out of the free Swipe source', () => {
    expect(profile).toContain('const visible = maskedIds.length ? normalized.filter((t) => !maskedIds.includes(t.trackId)) : normalized;');
    expect(profile).toContain('setTracks(visible);');
    expect(profile).toContain('const swipeTracks = useMemo<CanonicalTrack[]>(() => tracks.map((track) => ({');
  });
});
