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
const notifications = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/NotificationsScreen.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };

must(contract.repository === 'adelkhatra-bit/KEEP', 'wrong repository');
must(contract.canonicalBranch === 'reconcile/claude-main-20260825', 'wrong canonical branch');
must(contract.supabaseProjectRef === 'rrhqsqzcplvmwxizqnla', 'wrong Supabase project');
must(contract.creditRules.listen === 0, 'listen credit changed');
must(contract.creditRules.recognize === 0, 'recognize credit changed');
must(contract.creditRules.PASS === 0, 'PASS credit changed');
must(contract.creditRules.KEEP === -1, 'KEEP credit changed');

must(contract.profileOwner.freePlacement === 'metrics-after-reprises', 'FREE placement contract changed');
must(contract.profileOwner.freeBesideProfileKind === false, 'FREE must not sit beside profile type');
must(JSON.stringify(contract.profileOwner.metricsBarOrder) === JSON.stringify(['PLUS','Abonnés','Reprises','FREE']), 'profile metrics order changed');

const metaStart = profile.indexOf('<View style={s.profileMetaTopRow}>');
const locationStart = profile.indexOf('{(user.city || user.countryCode)', metaStart);
must(metaStart >= 0 && locationStart > metaStart, 'owner identity row missing');
const meta = profile.slice(metaStart, locationStart);
must(!meta.includes('profileFreeInline'), 'FREE reintroduced beside Utilisateur/Créateur');
must(meta.includes('<BattleGlowButton'), 'Battle missing from identity row');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen ? (', metricsStart);
must(metricsStart >= 0 && metricsEnd > metricsStart, 'metrics row missing');
const metrics = profile.slice(metricsStart, metricsEnd);
const plus = metrics.indexOf('>PLUS</Text>');
const followers = metrics.indexOf('>Abonnés</Text>');
const reprises = metrics.indexOf('>Reprises</Text>');
const free = metrics.indexOf('topMetricFreeHero');
must(plus >= 0 && followers > plus && reprises > followers && free > reprises, 'metrics must remain PLUS -> Abonnés -> Reprises -> FREE');
must((metrics.match(/>FREE<\/Text>/g) || []).length === 1, 'FREE must appear exactly once in metrics');

must(profile.includes('<ProfileCertificationBadge tier={certificationTier} compact />'), 'profile certification badge disconnected');
must(profile.includes('loadMyKeepBattleCreditStatus'), 'real FREE balance source disconnected');
must(profile.includes('setFreeBalance(battleStatus.remainingFree)'), 'real FREE balance no longer applied');

must(master.includes('Barre suivante : **PLUS | Abonnés | Reprises | FREE**.'), 'master spec profile metrics rule stale');
must(master.includes('juste après Reprises'), 'master spec FREE placement missing');
must(!master.includes('FREE immédiatement à droite du badge de type'), 'stale FREE placement still present in master spec');

must(uiBaseline.profileOwner.freePlacement === contract.profileOwner.freePlacement, 'UI baseline disagrees with product contract');
must(uiBaseline.profileOwner.freeMustNotAppearBesideProfileKind === true, 'UI baseline allows FREE beside profile type');
must(JSON.stringify(uiBaseline.profileOwner.metricsBarOrder) === JSON.stringify(contract.profileOwner.metricsBarOrder), 'UI baseline metrics order disagrees with product contract');

for (const label of ['Loki Music','Découvertes','Playlists','Soirées','Profil']) {
  must(navigation.includes(`tabBarLabel: '${label}'`), `bottom tab missing: ${label}`);
}
must(webRoot.includes('height:100dvh'), 'desktop root 100dvh protection missing');
must(!webRoot.includes("#root { position:relative; inset:auto; height:auto"), 'desktop root height:auto regression detected');

must(contract.marketplacePurchases?.completedPurchaseMustPersistInBuyerPlaylist === true, 'purchase playlist persistence contract missing');
must(contract.marketplacePurchases?.completedPurchaseMustPersistKeepDecision === true, 'purchase KEEP persistence contract missing');
must(contract.marketplacePurchases?.recentPurchasesLocation === 'Playlists home / Derniers achats', 'recent purchases location changed');
must(contract.marketplacePurchases?.previewMustShowOwnedVsMissingCounts === true, 'preview overlap contract missing');
must(contract.marketplacePurchases?.previewMustExposeSellerProfile === true, 'seller profile preview contract missing');
must(contract.marketplacePurchases?.previewMustUse3DProtectedMysteryVisual === true, '3D mystery preview contract missing');
must(contract.marketplacePurchases?.partialMissingTrackRequest === true, 'partial missing-track request contract missing');
must(contract.marketplacePurchases?.partialOfferMustBePrivateToRequester === true, 'private partial offer contract missing');

must(myMusic.includes('DERNIERS ACHATS'), 'Playlists recent purchases block missing');
must(myMusic.includes('loadMyPlaylistPurchaseLibrary'), 'purchase library RPC disconnected');
must(myMusic.includes('loadDeliveredPlaylistSaleTracks'), 'direct purchase playback disconnected');
must(salePreview.includes('loadPlaylistSaleOfferOverlap'), 'owned/missing overlap disconnected');
must(salePreview.includes('alreadyOwned'), 'per-preview owned marker missing');
must(salePreview.includes('perspective: 700') && salePreview.includes('rotateY') && salePreview.includes('rotateX'), '3D protected preview missing');
must(salePreview.includes('onOpenProfile'), 'seller profile link missing from purchase preview');
must(salePreview.includes('onRequestMissingTracks'), 'missing-track request CTA missing from purchase preview');
must(salePanel.includes('loadMyPlaylistSaleTrackRequests'), 'seller missing-track inbox disconnected');
must(salePanel.includes('offerPlaylistSaleTrackRequestWithFree'), 'seller FREE response action disconnected');
must(saleService.includes('keep_playlist_sale_my_purchase_library'), 'purchase library service RPC missing');
must(saleService.includes('keep_playlist_sale_request_missing_tracks'), 'partial request service RPC missing');
must(notifications.includes("type === 'PLAYLIST_SALE_PARTIAL_OFFER'"), 'private offer notification routing missing');
must(notifications.includes('openSaleOfferId: offerId'), 'private offer deep-link missing');

must(contract.changeProtocol?.cleanGeneratedCachesBeforeIntegration === true, 'integration cache-clean contract missing');
must(packageJson.scripts?.['integration:preflight']?.includes('clean-integration-cache.cjs'), 'integration preflight does not clean generated caches');
must(packageJson.scripts?.['integration:postflight']?.includes('verify-product-contract.cjs'), 'integration postflight does not verify product contract');

if (failures.length) {
  console.error('\nKEEP PRODUCT CONTRACT FAILED\n');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('KEEP product contract: PASS');
console.log('profile metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('certification + FREE remain live Supabase data, never UI-reset data');
console.log('marketplace: recent purchases + overlap + private missing-track offers locked');
console.log('integration: clean preflight + product-contract postflight locked');
