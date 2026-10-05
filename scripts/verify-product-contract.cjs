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
const chatPanel = fs.readFileSync(path.join(root, 'packages/mobile/src/components/MusicAgoraPanel.tsx'), 'utf8');
const chatOwnership = fs.readFileSync(path.join(root, 'supabase/migrations/20261001214500_chat_music_ownership_and_resale_guard.sql'), 'utf8');

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
must(contract.profileOwner.freeBesideProfileKind === false, 'FREE must stay out of profile type row');
must(contract.profileOwner.freeImmediatelyAfterReprises === true, 'FREE must stay immediately after Reprises');
must(contract.profileOwner.freeMustAppearExactlyOnce === true, 'FREE must appear exactly once');
must(JSON.stringify(contract.profileOwner.metricsBarOrder) === JSON.stringify(['PLUS','Abonnés','Reprises','FREE']), 'profile metrics order changed');

const metaStart = profile.indexOf('<View style={s.profileMetaTopRow}>');
const locationStart = profile.indexOf('{(user.city || user.countryCode)', metaStart);
must(metaStart >= 0 && locationStart > metaStart, 'owner identity row missing');
const meta = profile.slice(metaStart, locationStart);
const kindInMeta = meta.indexOf('style={[s.kindBadge');
const battleInMeta = meta.indexOf('<BattleGlowButton');
must(kindInMeta >= 0 && battleInMeta > kindInMeta, 'identity row must remain profile type -> Battle');
must((meta.match(/>FREE<\/Text>/g) || []).length === 0, 'FREE must not appear beside profile type');
must(!profile.includes('profileFreeInline'), 'stale FREE identity pill returned');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen', metricsStart);
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
must(master.includes('type de profil | Battle'), 'master spec identity order missing');

must(uiBaseline.profileOwner.freePlacement === contract.profileOwner.freePlacement, 'UI baseline disagrees with product contract');
must(uiBaseline.profileOwner.freeMustAppearBesideProfileKind === false, 'UI baseline must keep FREE out of profile type row');
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
must(contract.marketplacePurchases?.preventTrackAcrossActiveOffers === true, 'duplicate-track blocking policy changed');
must(contract.marketplacePurchases?.existingOfferTrackPolicy === 'block-and-keep-existing-offer', 'duplicate-track blocking policy missing');
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
must(
  salePanel.includes("offerFilter === 'FREE'")
    && salePanel.includes('const moneyPublished = useMemo')
    && salePanel.includes("offerFilter === 'FREE' ? freePublished : moneyPublished"),
  'Pépites FREE/euro filters disconnected',
);
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
must(salePanel.includes('Cette musique est déjà dans une collection active') && salePanel.includes('Un même enregistrement ne peut appartenir qu’à une seule collection active') && !salePanel.includes('AJOUTER QUAND MÊME'), 'duplicate-track blocking guard disconnected from Pépites');
must(saleService.includes("keep_playlist_sale_set_offer_for_selection_v5") && saleService.includes('allowExisting = false') && saleService.includes('p_allow_existing: allowExisting'), 'duplicate sale RPC default-block disconnected');
must(confirmedDuplicateSale.includes('and not p_allow_existing') && !confirmedDuplicateSale.includes('delete from public.playlist_sale_offer_tracks'), 'confirmed duplicate server policy disconnected');
must(!salePanel.includes("createSaleCollection: true"), 'Pépites creation redirects to Playlists again');
must(salePanel.includes('setMyPayoutLink(clean)') && salePanel.includes('ENREGISTRER PAYPAL') && salePanel.includes("host === 'paypal.me'") && salePanel.includes("Linking.openURL('https://www.paypal.com/paypalme/')"), 'direct payout setup disconnected from Pépites');
must(!myMusic.includes("navigation.navigate('ProfileCreatorTools')"), 'dead payout route reintroduced');

must(contract.screenHelpRules?.parties?.permanentIntro === false, 'Soirées permanent intro must stay removed');
must(contract.screenHelpRules?.parties?.helpTrigger === '?', 'Soirées help trigger changed');
must(parties.includes('eventHelpButton') && parties.includes('Tout faire dans Soirées'), 'Soirées compact ? help disconnected');
must(!parties.includes('Tes soirées et invitations, sans doublon avec Découvertes.'), 'Soirées permanent explanatory subtitle reintroduced');
must(!parties.includes('Publie, retrouve tes événements et réponds à tes invitations.'), 'Soirées permanent home hint reintroduced');

must(contract.screenHelpRules?.playlists?.permanentIntro === false, 'Playlists permanent intro must stay removed');
must(contract.screenHelpRules?.playlists?.helpTrigger === '?', 'Playlists help trigger changed');
must(myMusic.includes('headerHelpButton') && myMusic.includes('Tout faire dans Playlists'), 'Playlists compact ? help disconnected');
must(!myMusic.includes('Écouter · Trier · Organiser'), 'Playlists permanent subtitle reintroduced');

must(contract.chatMusicSharing?.thirdPartyTrackMayBeShared === true, 'chat third-party sharing must stay allowed');
must(contract.chatMusicSharing?.thirdPartyTrackMayBeSoldForFree === false, 'chat third-party FREE resale must stay blocked');
must(contract.chatMusicSharing?.thirdPartyTrackMayBeSoldForMoney === false, 'chat third-party money resale must stay blocked');
must(contract.chatMusicSharing?.paidChoicesMustShowLockWhenNotSellable === true, 'chat paid ownership locks missing from contract');
must(contract.chatMusicSharing?.serverResaleGuardRequired === true, 'chat server resale guard contract missing');
must(chatPanel.includes("'🔒 FREE'") && chatPanel.includes("'🔒 €'"), 'chat FREE/euro visual locks missing');
must(chatPanel.includes('🔒 partage uniquement') && chatPanel.includes('🔒 PARTAGE UNIQUEMENT'), 'chat share-only locks missing');
must(chatOwnership.includes('keep_profile_can_resell_track') && chatOwnership.includes('CHAT_TRACK_RESALE_FORBIDDEN'), 'chat server ownership guard missing');
must(master.includes('## 18. Tchat — propriété musicale et revente'), 'master chat ownership rule missing');

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

// ─── Reconnaissance musicale : une seule vérité Super Admin ────────────────
{
  const rule = contract.musicRecognitionArchitecture || {};
  const integrationsAdmin = fs.readFileSync(path.join(root, 'packages/admin/pages/integrations.tsx'), 'utf8');
  const launchCenter = fs.readFileSync(path.join(root, 'packages/admin/pages/launch-center.tsx'), 'utf8');
  const operations = fs.readFileSync(path.join(root, 'packages/admin/pages/operations.tsx'), 'utf8');

  must(rule.nativePrimary === 'ShazamKit', 'RECONNAISSANCE: ShazamKit doit rester le moteur natif principal');
  must(rule.serverPrimary === 'ACRCloud', 'RECONNAISSANCE: ACRCloud doit rester le moteur serveur principal');
  must(rule.optionalSecondary === 'AudD', 'RECONNAISSANCE: AudD doit rester un moteur secondaire optionnel');
  must(rule.auddSubscriptionDoesNotMeanConnected === true, 'RECONNAISSANCE: abonnement AudD ≠ clé reliée doit rester explicite');
  must(rule.optionalAuddAbsenceMustNotBeUrgentWhenAcrCloudActive === true, 'RECONNAISSANCE: AudD absent ne doit pas être une alerte si ACRCloud est actif');
  must(rule.singleAuddConfigurationSurface === 'packages/admin/pages/integrations.tsx', 'RECONNAISSANCE: surface canonique AudD modifiée');
  must(rule.superAdminMustNotDescribeAuddAsPrimary === true, 'RECONNAISSANCE: le Super Admin ne doit jamais présenter AudD comme moteur principal');

  must(integrationsAdmin.includes("if (row.key === 'AUDD_API_KEY' && !row.configured && acrCloudActive) return false;"),
    'RECONNAISSANCE: AudD absent remonte de nouveau dans « À corriger maintenant » malgré ACRCloud actif');
  must(integrationsAdmin.includes("Optionnel · ACRCloud actif"),
    'RECONNAISSANCE: statut optionnel AudD manquant dans Intégrations');
  must(!integrationsAdmin.includes('Services à quota / payants'),
    'RECONNAISSANCE: ancienne carte AudD dupliquée réintroduite dans Intégrations');

  must(launchCenter.includes('ShazamKit sur iPhone → ACRCloud côté serveur → AudD uniquement'),
    'RECONNAISSANCE: Centre de lancement ne reflète plus l’ordre réel des moteurs');
  must(!launchCenter.includes('ShazamKit sur iPhone → AudD → ACRCloud'),
    'RECONNAISSANCE: ancien ordre AudD prioritaire réintroduit');
  must(operations.includes('moteur optionnel') && operations.includes('moteur serveur principal'),
    'RECONNAISSANCE: Opérations ne distingue plus AudD optionnel et ACRCloud principal');
}

// ─── Fiabilité de la connexion (incident 02/10/2026) ───────────────────────
// BLOQUANT pour la publication web ET l'OTA mobile. Toute IA qui remet une
// échéance Auth plus courte que le serveur, des relances en rafale ou un
// nouveau sondage réseau rapide fait échouer ce contrôle. Pour changer une
// valeur : modifier config/keep-product-contract.json > authResilience ET le
// code dans le même commit, avec une justification -- jamais l'un sans l'autre.
{
  const authRule = contract.authResilience || {};
  const authFile = 'packages/mobile/src/services/authService.ts';
  const edgeFile = 'supabase/functions/keep-username-auth/index.ts';
  const authSource = fs.readFileSync(path.join(root, authFile), 'utf8');
  const edgeSource = fs.readFileSync(path.join(root, edgeFile), 'utf8');
  const norm = (value) => String(value).replace(/\s+/g, ' ').trim();
  const constValue = (source, name) => {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)\\s*;`));
    return match ? Number(match[1].replace(/_/g, '')) : NaN;
  };
  const serverMs = authRule.serverAuthTimeoutMs;
  must(Number.isFinite(serverMs) && serverMs >= 10000, 'CONNEXION: authResilience.serverAuthTimeoutMs manquant (Supabase Auth = 10000 ms)');

  const clientLogin = constValue(authSource, 'CLIENT_PASSWORD_LOGIN_DEADLINE_MS');
  const clientInvoke = constValue(authSource, 'CLIENT_USERNAME_AUTH_INVOKE_DEADLINE_MS');
  const clientAttempts = constValue(authSource, 'MAX_SIGN_IN_ATTEMPTS');
  const clientFast = constValue(authSource, 'RETRY_ONLY_FAST_FAILURE_MS');
  const edgeLogin = constValue(edgeSource, 'EDGE_SIGN_IN_DEADLINE_MS');
  const edgeAttempts = constValue(edgeSource, 'EDGE_MAX_SIGN_IN_ATTEMPTS');
  const edgeFast = constValue(edgeSource, 'EDGE_RETRY_ONLY_FAST_FAILURE_MS');

  must(clientLogin === authRule.clientPasswordLoginDeadlineMs, `CONNEXION: ${authFile} CLIENT_PASSWORD_LOGIN_DEADLINE_MS (${clientLogin}) ≠ contrat (${authRule.clientPasswordLoginDeadlineMs})`);
  must(clientLogin > serverMs, `CONNEXION: l'app abandonne la connexion (${clientLogin} ms) avant que Supabase Auth réponde (${serverMs} ms) -> requêtes empilées, plus personne ne se connecte`);
  must(clientInvoke === authRule.clientUsernameAuthInvokeDeadlineMs, `CONNEXION: ${authFile} CLIENT_USERNAME_AUTH_INVOKE_DEADLINE_MS (${clientInvoke}) ≠ contrat (${authRule.clientUsernameAuthInvokeDeadlineMs})`);
  must(clientInvoke > edgeLogin + authRule.retryOnlyFastFailureMs + edgeLogin / 2, `CONNEXION: l'app abandonne keep-username-auth (${clientInvoke} ms) avant la fin possible de la fonction serveur`);
  must(edgeLogin === authRule.edgeSignInDeadlineMs && edgeLogin > serverMs, `CONNEXION: ${edgeFile} EDGE_SIGN_IN_DEADLINE_MS (${edgeLogin}) doit valoir le contrat (${authRule.edgeSignInDeadlineMs}) et dépasser ${serverMs} ms`);
  must(clientAttempts === authRule.maxSignInAttempts && edgeAttempts === authRule.maxSignInAttempts, `CONNEXION: tentatives client=${clientAttempts} serveur=${edgeAttempts}, contrat=${authRule.maxSignInAttempts}`);
  must(clientFast === authRule.retryOnlyFastFailureMs && edgeFast === authRule.retryOnlyFastFailureMs, 'CONNEXION: la relance doit rester réservée aux erreurs serveur rapides (retryOnlyFastFailureMs)');
  must(authRule.retryAfterLocalDeadlineForbidden === true, 'CONNEXION: retryAfterLocalDeadlineForbidden doit rester true');
  must(authSource.includes(`const AUTH_LOCAL_DEADLINE_MARKER = '${authRule.localDeadlineMarker}';`) && authSource.includes('includes(AUTH_LOCAL_DEADLINE_MARKER)) return last;'), 'CONNEXION: authService relance après son échéance locale (interdit)');
  must(authSource.includes('Date.now() - attemptStartedAt > RETRY_ONLY_FAST_FAILURE_MS) return last;'), 'CONNEXION: authService relance un serveur déjà lent (interdit)');
  must(edgeSource.includes('includes("auth_signin_timeout")) break;') && edgeSource.includes('Date.now() - attemptStartedAt > EDGE_RETRY_ONLY_FAST_FAILURE_MS) break;'), 'CONNEXION: keep-username-auth relance après échéance ou sur serveur lent (interdit)');
  must(!/signInWithPassword\([^;]*?\)\s*as any,\s*[0-9_]+\s*,?\s*\)/.test(authSource), 'CONNEXION: échéance en dur sur signInWithPassword -- utiliser CLIENT_PASSWORD_LOGIN_DEADLINE_MS');
  must(!/signInWithPassword\([^;]*?\),\s*[0-9_]+\s*,\s*"auth_signin_timeout"/.test(edgeSource), 'CONNEXION: échéance en dur dans keep-username-auth -- utiliser EDGE_SIGN_IN_DEADLINE_MS');

  // Sondages : tout setInterval < minNetworkPollIntervalMs doit être déclaré avec sa raison.
  const minPoll = authRule.minNetworkPollIntervalMs;
  must(Number.isFinite(minPoll) && minPoll >= 5000, 'CONNEXION: minNetworkPollIntervalMs manquant');
  const allow = Array.isArray(authRule.fastIntervalAllowlist) ? authRule.fastIntervalAllowlist : [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
  for (const file of walk(path.join(root, 'packages/mobile/src'))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const re = /setInterval\(([\s\S]{0,400}?),\s*([0-9_]+)\s*\)/g;
    let m;
    while ((m = re.exec(source))) {
      const ms = Number(m[2].replace(/_/g, ''));
      if (ms >= minPoll) continue;
      const declared = allow.some((a) => a.file === rel && norm(m[0]).includes(norm(a.snippet)));
      must(declared, `CONNEXION: sondage rapide non déclaré (${ms} ms) dans ${rel} -- un sondage réseau < ${minPoll} ms a saturé Supabase le 02/10/2026. Allonger l'intervalle, ou s'il n'appelle pas le réseau, le déclarer dans authResilience.fastIntervalAllowlist avec sa raison.`);
    }
  }
  for (const a of allow) {
    const full = path.join(root, a.file);
    const exists = fs.existsSync(full) && norm(fs.readFileSync(full, 'utf8')).includes(norm(a.snippet));
    must(exists && typeof a.reason === 'string' && a.reason.length > 5, `CONNEXION: entrée obsolète dans fastIntervalAllowlist (${a.file}) -- la retirer`);
  }
}

// ─── Protection du contenu utilisateur (demande Adel 02/10/2026) ───────────
// Aucune nouvelle migration ne peut supprimer/vider/détruire une table de
// contenu utilisateur sans l'accord explicite d'Adel inscrit dans le fichier.
{
  const rule = contract.userContentProtection || {};
  must(Array.isArray(rule.protectedTables) && rule.protectedTables.length >= 10, 'CONTENU: userContentProtection.protectedTables manquant');
  const marker = rule.approvalMarker || '-- ADEL-APPROVED-DESTRUCTIVE:';
  const from = String(rule.appliesToMigrationsFrom || '20261002180000');
  const tables = (rule.protectedTables || []).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const destructive = new RegExp(
    `\\b(?:delete\\s+from|truncate(?:\\s+table)?|drop\\s+table(?:\\s+if\\s+exists)?)\\s+(?:only\\s+)?(?:public\\.)?"?(${tables})"?\\b` +
    `|\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?"?(${tables})"?\\s+drop\\s+column`,
    'i',
  );
  const immutableHistoricalExceptions = new Map(
    (rule.immutableHistoricalExceptions || []).map((entry) => [entry.file, entry.reason]),
  );
  for (const [file, reason] of immutableHistoricalExceptions) {
    must(typeof file === 'string' && file.endsWith('.sql') && typeof reason === 'string' && reason.length > 20,
      'CONTENU: exception historique immuable invalide');
  }
  const dir = path.join(root, 'supabase/migrations');
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const version = (name.match(/^(\d{14})_/) || [])[1];
    const legacy = (rule.legacyUntimestampedMigrations || []).includes(name);
    if (!version && !legacy) failures.push(`CONTENU: migration ${name} sans horodatage AAAAMMJJHHMMSS_ -- nom interdit (contournement de l'ordre et des contrôles)`);
    if (legacy || (version && version < from)) continue;
    if (immutableHistoricalExceptions.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8').replace(/--[^\n]*/g, (c) => (c.startsWith(marker) ? c : ''));
    const hit = sql.match(destructive);
    if (hit && !sql.includes(marker)) {
      failures.push(`CONTENU: la migration ${name} efface du contenu utilisateur (« ${hit[0]} »). Interdit sans accord écrit d'Adel (${marker} <date> <raison>).`);
    }
  }
}

// ─── Mise à jour web : jamais de rechargement sous les doigts (ERR-WEB-UPDATE-RELOAD-029)
{
  const banner = fs.readFileSync(path.join(root, 'packages/mobile/src/components/AppUpdateBanner.tsx'), 'utf8');
  must(contract.authBootstrap?.webUpdateNeverReloadsVisiblePage === true, 'MISE À JOUR: authBootstrap.webUpdateNeverReloadsVisiblePage doit rester true');
  must(banner.includes("if (typeof document === 'undefined' || document.visibilityState === 'hidden') {")
    && banner.includes("if (document.visibilityState === 'hidden') applyUpdate();")
    && banner.includes("document.addEventListener('visibilitychange', onHidden)"),
    'MISE À JOUR: AppUpdateBanner doit attendre que l\'onglet passe en arrière-plan avant de recharger (sinon la page se recharge en plein clic et les profils ne finissent jamais de charger)');
  const reloadCalls = (banner.match(/reloadToLatest\(\)/g) || []).length;
  must(reloadCalls === 1 && banner.includes('const applyUpdate = () =>'), 'MISE À JOUR: reloadToLatest() doit être appelé uniquement via applyUpdate (onglet en arrière-plan)');
}

// ─── File réseau : le contenu utilisateur d'abord (ERR-PROFILE-QUEUE-STARVATION-031)
{
  const rule = contract.networkQueue || {};
  const client = fs.readFileSync(path.join(root, 'packages/mobile/src/services/supabaseClient.ts'), 'utf8');
  const profileState = fs.readFileSync(path.join(root, 'packages/mobile/src/services/publicProfileStateService.ts'), 'utf8');
  const num = (source, name) => { const m = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)\\s*;`)); return m ? Number(m[1].replace(/_/g, '')) : NaN; };
  const concurrent = num(client, 'KEEP_NETWORK_MAX_CONCURRENT');
  must(concurrent >= (rule.minConcurrent || 3), `FILE RÉSEAU: KEEP_NETWORK_MAX_CONCURRENT doit être une constante >= ${rule.minConcurrent || 3} (trouvé ${concurrent}). Une seule requête à la fois a laissé les profils vides le 02/10/2026.`);
  must(num(client, 'KEEP_NETWORK_FAILURE_MAX_COOLDOWN_MS') <= (rule.maxFailureCooldownMs || 10000), 'FILE RÉSEAU: pause maximale après erreur trop longue');
  for (const p of rule.essentialPaths || []) must(client.includes(`'${p}'`), `FILE RÉSEAU: ${p} doit rester dans KEEP_ESSENTIAL_CONTENT_PATHS (contenu utilisateur prioritaire)`);
  must(client.includes('keepNetworkPriorityQueue.shift() ?? keepNetworkQueue.shift()'), 'FILE RÉSEAU: la file prioritaire doit être servie avant la file normale');
  must(client.includes('const reservesLane = isExplicitLoginUrl(url);') && client.includes("url.includes('grant_type=password')"), 'FILE RÉSEAU: seule une vraie connexion peut mettre la file en pause (pas /auth/v1/user)');
  must(num(profileState, 'SOURCE_HYDRATION_BUDGET_MS') <= (rule.sourceHydrationBudgetMs || 6000) && profileState.includes('return hydrateSourceUsernamesWithinBudget(result);'), 'FILE RÉSEAU: l\'enrichissement découvreur ne doit pas cacher les musiques au-delà de son budget');
}

// ─── Mises à jour : jamais pendant une partie (Adel 02/10/2026) ──────────────
{
  const rule = contract.webUpdateExperience || {};
  const banner = fs.readFileSync(path.join(root, 'packages/mobile/src/components/AppUpdateBanner.tsx'), 'utf8');
  const guard = fs.readFileSync(path.join(root, 'packages/mobile/src/services/updateGameGuard.ts'), 'utf8');
  must(rule.neverApplyDuringGame === true, 'MISE À JOUR: webUpdateExperience.neverApplyDuringGame doit rester true');
  must(guard.includes('useGameSessionStore.getState().isGameInProgress') && guard.includes('useGameSessionStore.subscribe('), 'MISE À JOUR: updateGameGuard doit lire useGameSessionStore (Solo + Battle en ligne)');
  const reloads = (banner.match(/reloadToLatest\(\)|Updates\.reloadAsync\(\)/g) || []).length;
  const guarded = (banner.match(/runWhenNoGameInProgress\(\(\) => \{[^}]*?(reloadToLatest\(\)|Updates\.reloadAsync\(\))/g) || []).length;
  must(reloads > 0 && reloads === guarded, `MISE À JOUR: chaque rechargement de AppUpdateBanner doit passer par runWhenNoGameInProgress (${guarded}/${reloads}). Une mise à jour en pleine partie fait perdre la mise du joueur.`);
}


// ---- Stories (décision d'Adel du 05/10/2026, contrat storiesExperience) ----
const storyRail = fs.readFileSync(path.join(root, 'packages/mobile/src/components/MusicStoryRail.tsx'), 'utf8');
const storyBar = fs.readFileSync(path.join(root, 'packages/mobile/src/components/ProfileStoryBar.tsx'), 'utf8');
const storyService = fs.readFileSync(path.join(root, 'packages/mobile/src/services/musicStoriesService.ts'), 'utf8');
const storyDeck = fs.readFileSync(path.join(root, 'packages/mobile/src/components/MusicSwipeDeckModal.tsx'), 'utf8');
const storyEligibility = fs.readFileSync(path.join(root, 'packages/mobile/src/services/storyEligibility.ts'), 'utf8');
const se = contract.storiesExperience;
// Règle d'Adel (05/10/2026) : on ne se désabonne QUE depuis la page profil de la personne ; la liste des vues propose « Voir le profil », pas un badge « Abonné ».
const quickViewSrc = fs.readFileSync(path.join(root, 'packages/mobile/src/components/SourceProfileQuickView.tsx'), 'utf8');
must(se && se.unfollowOnlyFromProfilePage === true && se.viewersListShowsViewProfileNotFollowBadge === true, 'storiesExperience: règle « désabonnement uniquement depuis le profil » absente du contrat');
must(!quickViewSrc.includes('.delete(') && !quickViewSrc.includes('keep_unfollow_profile'), 'stories: la fiche rapide ne doit jamais désabonner (seule la page profil le fait)');
must(storyBar.includes('Voir le profil ›') && !storyBar.includes('>Abonné<'), 'stories: la liste des vues doit proposer « Voir le profil » et non un badge « Abonné »');
// Règles d'Adel du 05/10/2026 (lecteur de story) : durée « reste N h » sur une ligne, étiquettes PAYANT / GRATUIT toujours visibles, aucune phrase d'accroche sur la story d'un autre.
const storyActivitySrc = fs.readFileSync(path.join(root, 'packages/mobile/src/services/storyActivity.ts'), 'utf8');
const storyDeckSrc = fs.readFileSync(path.join(root, 'packages/mobile/src/components/MusicSwipeDeckModal.tsx'), 'utf8');
must(se && se.storyReaderHasNoTeaserSentenceForOthers === true && Array.isArray(se.storyPriceBadgesRequired) && se.storyAgeLineFormat, 'storiesExperience: règles de lecture de story absentes du contrat');
must(storyActivitySrc.includes('`il y a ${Math.floor(elapsedMin / 60)} h`') && !storyActivitySrc.includes('reste ${') && storyDeckSrc.includes('numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} testID="deck-story-age"'), 'stories: la ligne verte dit seulement « il y a N min / h » (jamais le temps restant), sur UNE ligne');
must(storyDeckSrc.includes('💳 PAYANT') && storyDeckSrc.includes('saleInfoByTrackId') && storyDeckSrc.includes('GRATUIT · POUR TON PROFIL') && storyDeckSrc.includes('deck-price-badge'), 'stories: chaque musique d\'une story doit afficher PAYANT (PayPal) ou GRATUIT, lisiblement');
must(!storyBar.includes('{composeStoryTeaser(openStory.username'), 'stories: pas de phrase d\'accroche sur la story d\'un autre (elle induisait en erreur)');
// Décisions d'Adel du 05/10/2026 : reprise sociale GRATUITE (créateur identifié) et partage en story GRATUIT ; musiques en vente toujours payantes.
const keepActionSrc = fs.readFileSync(path.join(root, 'packages/mobile/src/services/keepTrackAction.ts'), 'utf8');
must(contract.creditRules.socialFreeKeep && contract.creditRules.socialFreeKeep.charge === 0 && contract.creditRules.shareToOwnStoryIsFree && contract.creditRules.shareToOwnStoryIsFree.charge === 0, 'creditRules: reprise sociale et partage en story doivent rester gratuits (décision d\'Adel 05/10/2026)');
must(keepActionSrc.includes("keep_commit_social_free_decision") && storyService.includes("keep_pin_shared_story_track") && storyBar.includes('keepDebitAmount={0}'), 'stories: GARDER depuis une story / un profil et le partage en story ne doivent débiter aucun FREE');
must(se && se.rowIsSinglePiece === true && se.sameStyleStoriesAllowed === false && se.autoChainToNextUnseenStory === true, 'storiesExperience contract missing or changed');
must(storyRail.includes('{leading ?? null}') && storyRail.includes('horizontal') && storyBar.includes('leading={leadingPhoto}'), 'stories: la photo + « + » doit défiler avec la même rangée horizontale (leading)');
must(!storyRail.includes('Modal') && !storyRail.includes('home-story-others'), 'stories: la rangée ne doit ni ouvrir de fenêtre ni avoir de rond « Autres » (tout est dans la ligne, façon Instagram)');
must(storyService.includes('const byRecency =') && storyService.includes('stories.filter(isNew).sort(byRecency)'), 'stories: la plus récente doit rester la première');
must(storyRail.includes('const unseenFollowed = orderStoriesForBar(') && storyRail.includes('const seenStories = orderStoriesForBar(') && storyRail.includes('...styleSuggestions, ...seenStories]'), 'stories: non vues d\'abord, stories vues tout au bout de la ligne ; les inactifs > 7 jours n\'y sont plus');
must(storyRail.includes('isDormantMember') && storyBar.includes('loadProfilesActivity') && storyService.includes('keep_profiles_activity'), 'stories: les inactifs (> 7 jours) sont masqués de la rangée, tri par activité réelle');
must(storyRail.includes('story-follow-') && storyBar.includes("rpc('keep_follow_profile'"), 'stories: suggestions avec bouton « +👤 » pour suivre directement');
must(storyService.includes('rankMusicStories(rows, viewerId, eligibleIds, new Set())') && storyService.includes('loadStoryRelations'), 'stories: seuls les membres liés (abonnements, abonnés, reprises) — jamais le même style seul');
must(storyEligibility.includes('is_anonymous') && storyEligibility.includes('email_confirmed_at'), 'stories: compte réel avec e-mail vérifié uniquement');
must(profile.includes('!accountRequired && !isDemoMode && !isLocalGuest && storiesUnlocked') && visitorProfile.includes('isDemoMode || isLocalGuest || !effectiveViewerId'), 'stories: jamais en démo ni invité');
must(storyBar.includes('onFinished={() => {') && storyDeck.includes('finishedRound.current === round'), 'stories: enchaînement automatique vers la prochaine story non vue');
must(storyService.includes("rpc('keep_discovery_match_candidates'") && storyBar.includes('loadStyleSuggestions('), 'stories: suggestions d\'amis par style (RPC serveur)');
must(storyService.includes("rpc('keep_story_masked_pins'") && storyService.includes('maskedRawIds'), 'stories: musique en vente masquée côté serveur, jamais en double ni en clair');
must(storyDeck.includes('MysteryArtwork'), 'stories: l\'animation pochette mystère des musiques masquées doit rester');

if (failures.length) {
  console.error('\nKEEP PRODUCT CONTRACT FAILED\n');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('KEEP product contract: PASS');
console.log('profile: identity type -> Battle; metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('certification + FREE remain live Supabase data, never UI-reset data');
console.log('battle catalog: deep pool + anti-repeat + Supabase rate-limited expansion locked');
console.log('marketplace: FREE/€ filters + inline Pépites cart + confirmed duplicate reuse + payout locked');
console.log('integration: clean preflight + product-contract postflight locked');
console.log('contenu utilisateur: aucune migration destructive sans accord écrit d\'Adel');
console.log('mises à jour: jamais pendant un Solo ou un Battle en ligne');
console.log('connexion: échéances Auth > délai serveur, relance unique sur erreur rapide, sondages réseau >= 5 s verrouillés');
