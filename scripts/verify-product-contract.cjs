const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
const master = fs.readFileSync(path.join(root, 'docs/KEEP_MASTER_SPEC.md'), 'utf8');
const uiBaseline = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-ui-baseline.json'), 'utf8'));
const profile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'packages/mobile/src/navigation/Navigation.tsx'), 'utf8');
const webRoot = fs.readFileSync(path.join(root, 'packages/mobile/index.js'), 'utf8');
const saleService = fs.readFileSync(path.join(root, 'packages/mobile/src/services/playlistSaleService.ts'), 'utf8');
const salePreview = fs.readFileSync(path.join(root, 'packages/mobile/src/components/PlaylistSaleImmersivePreview.tsx'), 'utf8');
const salePanel = fs.readFileSync(path.join(root, 'packages/mobile/src/components/PlaylistSalePanel.tsx'), 'utf8');
const myMusic = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/MyMusicScreen.tsx'), 'utf8');
const parties = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/PartiesScreen.tsx'), 'utf8');
const visitorProfile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/NotificationsScreen.tsx'), 'utf8');
const publicProfilePanel = fs.readFileSync(path.join(root, 'packages/mobile/src/components/PublicProfilePanel.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const battleCatalogSeed = fs.readFileSync(path.join(root, 'supabase/functions/keep-battle-catalog-seed/index.ts'), 'utf8');
const battleMemory = fs.readFileSync(path.join(root, 'supabase/migrations/20261001022000_battle_content_memory_anti_repeat.sql'), 'utf8');
const battleCron = fs.readFileSync(path.join(root, 'supabase/migrations/20261001024000_battle_catalog_supabase_cron.sql'), 'utf8');
const confirmedDuplicateSale = fs.readFileSync(path.join(root, 'supabase/migrations/20261001220000_playlist_sale_confirmed_duplicate_tracks.sql'), 'utf8');

const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };

must(contract.repository === 'adelkhatra-bit/KEEP', 'wrong repository');
must(contract.canonicalBranch === 'reconcile/claude-main-20260825', 'wrong canonical branch');
must(contract.supabaseProjectRef === 'rrhqsqzcplvmwxizqnla', 'wrong Supabase project');
must(contract.creditRules.listen === 0, 'listen credit changed');
must(contract.creditRules.recognize === 0, 'recognize credit changed');
must(contract.creditRules.PASS === 0, 'PASS credit changed');
must(contract.creditRules.KEEP === -3, 'KEEP credit changed');

must(contract.profileOwner.freePlacement === 'immediately-after-Reprises-in-owner-metrics-bar', 'FREE placement contract changed');
must(contract.profileOwner.freeBesideProfileKind === false, 'FREE must not sit beside profile type');
must(contract.profileOwner.freeImmediatelyAfterReprises === true, 'FREE must stay immediately after Reprises');
must(contract.profileOwner.freeMustAppearExactlyOnce === true, 'FREE must appear exactly once');
must(JSON.stringify(contract.profileOwner.metricsBarOrder) === JSON.stringify(['PLUS','Abonnés','Reprises','FREE']), 'profile metrics order changed');

const metaStart = profile.indexOf('<View style={s.profileMetaTopRow}>');
const locationStart = profile.indexOf('{(user.city || user.countryCode)', metaStart);
must(metaStart >= 0 && locationStart > metaStart, 'owner identity row missing');
const meta = profile.slice(metaStart, locationStart);
must(!meta.includes('>FREE</Text>') && !meta.includes('profileFreeInline'), 'FREE reintroduced beside profile type');
must(meta.includes('<BattleGlowButton'), 'Battle missing from identity row');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen ? (', metricsStart);
must(metricsStart >= 0 && metricsEnd > metricsStart, 'metrics row missing');
const metrics = profile.slice(metricsStart, metricsEnd);
const plus = metrics.indexOf('>PLUS</Text>');
const followers = metrics.indexOf('>Abonnés</Text>');
const reprises = metrics.indexOf('>Reprises</Text>');
const free = metrics.indexOf('>FREE</Text>');
must(plus >= 0 && followers > plus && reprises > followers && free > reprises, 'metrics must remain PLUS -> Abonnés -> Reprises -> FREE');
must((metrics.match(/>FREE<\/Text>/g) || []).length === 1, 'FREE must appear exactly once in metrics');
must(metrics.includes('topMetricFreeItem'), 'FREE metric item missing');

must(profile.includes('<ProfileCertificationBadge tier={certificationTier} compact />'), 'profile certification badge disconnected');
must(profile.includes('loadMyKeepBattleCreditStatus'), 'real FREE balance source disconnected');
must(profile.includes('setFreeBalance(battleStatus.remainingFree)'), 'real FREE balance no longer applied');

must(master.includes('**PLUS | Abonnés | Reprises | FREE**'), 'master spec profile metrics rule stale');
must(master.includes('FREE est immédiatement à droite de Reprises'), 'master spec FREE placement missing');
must(!master.includes('FREE immédiatement à droite du badge de type'), 'stale FREE beside profile type rule still present');

must(uiBaseline.profileOwner.freePlacement === contract.profileOwner.freePlacement, 'UI baseline disagrees with product contract');
must(uiBaseline.profileOwner.freeMustAppearBesideProfileKind === false, 'UI baseline must forbid FREE beside profile type');
must(uiBaseline.profileOwner.freeImmediatelyAfterReprises === true, 'UI baseline must lock FREE after Reprises');
must(JSON.stringify(uiBaseline.profileOwner.metricsBarOrder) === JSON.stringify(contract.profileOwner.metricsBarOrder), 'UI baseline metrics order disagrees with product contract');
must(contract.profileOwner.visibilityControlLocation === 'Notifications top', 'profile visibility location contract changed');
must(contract.profileOwner.visibilityControlRemovedFromNetworksPanel === true, 'profile visibility must stay out of networks panel');
must(notifications.includes('CONFIDENTIALITÉ DU PROFIL') && notifications.includes('updateProfileVisibility'), 'profile visibility control missing from Notifications');
must(!publicProfilePanel.includes('Profil visible') && !publicProfilePanel.includes('updateProfileVisibility'), 'profile visibility reintroduced in networks panel');
must(profile.includes("label: 'Réseaux & site web'"), 'profile hamburger networks label regressed');

for (const label of ['Loki Music','Découvertes','Playlists','Soirées','Profil']) {
  must(navigation.includes(`tabBarLabel: '${label}'`), `bottom tab missing: ${label}`);
}
must(webRoot.includes('height:100dvh'), 'desktop root 100dvh protection missing');
must(!webRoot.includes("#root { position:relative; inset:auto; height:auto"), 'desktop root height:auto regression detected');

must(contract.battleCatalog?.recentTrackMemory === 120, 'Battle recent-track memory contract changed');
must(contract.battleCatalog?.recentArtistMemory === 240, 'Battle recent-artist memory contract changed');
must(contract.battleCatalog?.chansonFrDeepBudget === 4000, 'French Battle deep budget changed');
must(contract.battleCatalog?.frenchNamedArtistBootstrapMinimum >= 120, 'French Battle artist bootstrap floor too small');
must(contract.battleCatalog?.catalogExpansionWithoutAppRelease === true, 'Battle catalog must expand server-side');
must(contract.battleCatalog?.providerRateLimitedBatches === true, 'Battle catalog rate-limit contract missing');
must(battleCatalogSeed.includes('"Gilbert Montagné"') && battleCatalogSeed.includes('CHANSON_FR: 4000'), 'French deep catalog seed missing');
must(battleCatalogSeed.includes('BATCH_QUERY_COUNT = 5'), 'Battle catalog batching missing');
must(battleMemory.includes('120') && battleMemory.includes('240'), 'Battle anti-repeat memory limits missing');
must(battleCron.includes('keep-battle-catalog-expand-every-minute') && battleCron.includes('keep_battle_catalog_cron_key'), 'Supabase Battle catalog cron missing');
must(master.includes('**Chanson française** est un catalogue profond multi-générations'), 'master spec Battle catalog rule missing');

must(contract.marketplacePurchases?.completedPurchaseMustPersistInBuyerPlaylist === true, 'purchase playlist persistence contract missing');
must(contract.marketplacePurchases?.completedPurchaseMustPersistKeepDecision === true, 'purchase KEEP persistence contract missing');
must(contract.marketplacePurchases?.recentPurchasesLocation === 'Playlists home / Derniers achats', 'recent purchases location changed');
must(contract.marketplacePurchases?.previewMustShowOwnedVsMissingCounts === true, 'preview overlap contract missing');
must(contract.marketplacePurchases?.previewMustExposeSellerProfile === true, 'seller profile preview contract missing');
must(contract.marketplacePurchases?.previewMustUse3DProtectedMysteryVisual === true, '3D mystery preview contract missing');
must(contract.marketplacePurchases?.partialMissingTrackRequest === true, 'partial missing-track request contract missing');
must(contract.marketplacePurchases?.partialOfferMustBePrivateToRequester === true, 'private partial offer contract missing');
must(JSON.stringify(contract.marketplacePurchases?.sellerCollectionFilters) === JSON.stringify(['ALL','FREE','MONEY']), 'seller FREE/euro filters contract changed');
must(JSON.stringify(contract.marketplacePurchases?.creationWizardSteps) === JSON.stringify(['TRACKS','CART_REVIEW','MODE_PRICE_CURRENCY','PAYOUT_PUBLISH']), 'collection creation wizard contract changed');
must(contract.marketplacePurchases?.cartReviewMustPrecedePricing === true, 'Pépites cart review must precede pricing');
must(contract.marketplacePurchases?.savedPayoutLinkMustBeReused === true, 'saved payout link reuse contract missing');
must(contract.marketplacePurchases?.preventTrackAcrossActiveOffers === false, 'confirmed duplicate-track policy changed');
must(contract.marketplacePurchases?.existingOfferTrackPolicy === 'warn-and-allow-without-removing-existing-offer', 'confirmed duplicate-track policy missing');
must(contract.marketplacePurchases?.collectionCreationMustRemainInPepites === true, 'Pépites inline creation contract missing');
must(contract.marketplacePurchases?.cartSelectionReversible === true, 'Pépites reversible cart contract missing');
must(contract.marketplacePurchases?.moneyPayoutConfiguredInline === true, 'inline payout setup contract missing');
must(contract.marketplacePurchases?.freeModeRequiresExternalPayout === false, 'FREE mode must not require external payout');

must(myMusic.includes('DERNIERS ACHATS'), 'Playlists recent purchases block missing');
must(myMusic.includes('loadMyPlaylistPurchaseLibrary'), 'purchase library RPC disconnected');
must(myMusic.includes('loadDeliveredPlaylistSaleTracks'), 'direct purchase playback disconnected');
must(salePreview.includes('loadPlaylistSaleOfferOverlap'), 'owned/missing overlap disconnected');
must(salePreview.includes('alreadyOwned'), 'per-preview owned marker missing');
must(salePreview.includes('perspective: 700') && salePreview.includes('rotateY') && salePreview.includes('rotateX'), '3D protected preview missing');
must(salePreview.includes('onOpenProfile'), 'seller profile link missing from purchase preview');
must(salePreview.includes('onRequestMissingTracks'), 'missing-track request CTA missing from purchase preview');
must(salePanel.includes('loadMyPlaylistSaleTrackRequests'), 'seller missing-track inbox disconnected');
must(salePanel.includes('offerPlaylistSaleRequestSelectionWithFree'), 'seller FREE response action disconnected');
must(saleService.includes('keep_playlist_sale_my_purchase_library'), 'purchase library service RPC missing');
must(saleService.includes('keep_playlist_sale_request_missing_tracks'), 'partial request service RPC missing');
must(notifications.includes("'PLAYLIST_SALE_PARTIAL_OFFER'") && notifications.includes('includes(type)'), 'private offer notification routing missing');
must(notifications.includes('openSaleOfferId: offerId'), 'private offer deep-link missing');
must(salePanel.includes("offerFilter === 'FREE'") && salePanel.includes("offerFilter === 'MONEY'"), 'Pépites FREE/euro filters disconnected');
must(
  salePanel.includes("collectionCartStep === 'TRACKS'")
    && salePanel.includes("collectionCartStep === 'REVIEW'")
    && salePanel.includes("collectionCartStep === 'PRICE'")
    && salePanel.includes("setCollectionCartStep('PUBLISH')")
    && salePanel.includes('OUI, MA SÉLECTION EST TERMINÉE')
    && salePanel.includes('J’AI FINI MA SÉLECTION')
    && salePanel.includes('OUVRIR MON PANIER')
    && salePanel.includes('MARKETPLACE_CURRENCIES'),
  'inline Pépites cart steps disconnected',
);
must(salePanel.includes('Cette musique est déjà en vente') && salePanel.includes('AJOUTER QUAND MÊME') && salePanel.includes("selected ? 'RETIRER' : '+ PANIER'"), 'warn-and-allow Pépites cart guard disconnected');
must(saleService.includes("keep_playlist_sale_set_offer_for_selection_v5") && saleService.includes('p_allow_existing: allowExisting'), 'confirmed duplicate sale RPC disconnected');
must(confirmedDuplicateSale.includes('and not p_allow_existing') && !confirmedDuplicateSale.includes('delete from public.playlist_sale_offer_tracks'), 'confirmed duplicate server policy disconnected');
must(!salePanel.includes("createSaleCollection: true"), 'Pépites creation redirects to Playlists again');
must(salePanel.includes('setMyPayoutLink(clean)') && salePanel.includes('ENREGISTRER PAYPAL') && salePanel.includes("host === 'paypal.me'") && salePanel.includes("Linking.openURL('https://www.paypal.com/paypalme/')"), 'direct payout setup disconnected from Pépites');
must(!myMusic.includes("navigation.navigate('ProfileCreatorTools')"), 'dead payout route reintroduced');

must(contract.screenHelpRules?.parties?.permanentIntro === false, 'Soirées permanent intro must stay removed');
must(contract.screenHelpRules?.parties?.helpTrigger === '?', 'Soirées help trigger changed');
must(parties.includes('eventHelpButton') && parties.includes('Tout faire depuis Soirées'), 'Soirées compact ? help disconnected');
must(!parties.includes('Tes soirées et invitations, sans doublon avec Découvertes.'), 'Soirées permanent explanatory subtitle reintroduced');
must(!parties.includes('Publie, retrouve tes événements et réponds à tes invitations.'), 'Soirées permanent home hint reintroduced');

must(contract.screenHelpRules?.playlists?.permanentIntro === false, 'Playlists permanent intro must stay removed');
must(contract.screenHelpRules?.playlists?.helpTrigger === '?', 'Playlists help trigger changed');
must(myMusic.includes('headerHelpButton') && myMusic.includes('Tout faire dans Playlists'), 'Playlists compact ? help disconnected');
must(!myMusic.includes('Écouter · Trier · Organiser'), 'Playlists permanent subtitle reintroduced');

must(contract.eventExperience?.profileEventTapMustStayInline === true, 'profile event inline rule changed');
must(contract.eventDiscovery?.profileBehavior === 'inline-only-no-tab-redirect', 'profile event no-redirect contract changed');
const eventSpotlightStart = visitorProfile.indexOf('{marketBannerEventIds.length > 0 || marketBannerPendingEventCount > 0 ? (');
const eventSpotlightEnd = visitorProfile.indexOf('<View style={styles.collectionHeader}>', eventSpotlightStart);
must(eventSpotlightStart >= 0 && eventSpotlightEnd > eventSpotlightStart, 'visitor profile event spotlight missing');
const eventSpotlightSlice = visitorProfile.slice(eventSpotlightStart, eventSpotlightEnd);
must(eventSpotlightSlice.includes('openProfileEventInline'), 'visitor event no longer opens inline');
must(!eventSpotlightSlice.includes("navigation.navigate('Parties'"), 'visitor event redirects away from profile');
must(visitorProfile.includes('EN ATTENTE D’APPROBATION') && visitorProfile.includes('JE PARTICIPE'), 'visitor inline event pending/RSVP states missing');

must(contract.changeProtocol?.cleanGeneratedCachesBeforeIntegration === true, 'integration cache-clean contract missing');
must(packageJson.scripts?.['integration:preflight']?.includes('clean-integration-cache.cjs'), 'integration preflight does not clean generated caches');
must(packageJson.scripts?.['integration:postflight']?.includes('verify-product-contract.cjs'), 'integration postflight does not verify product contract');

if (failures.length) {
  console.error('\nKEEP PRODUCT CONTRACT FAILED\n');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('KEEP product contract: PASS');
console.log('profile: identity type separate; metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('certification + FREE remain live Supabase data, never UI-reset data');
console.log('battle catalog: deep pool + anti-repeat + Supabase rate-limited expansion locked');
console.log('marketplace: FREE/€ filters + inline Pépites cart + confirmed duplicate reuse + payout locked');
console.log('integration: clean preflight + product-contract postflight locked');
