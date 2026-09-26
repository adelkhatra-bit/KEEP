const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const blob = (rel) => execFileSync('git', ['hash-object', rel], { cwd: root, encoding: 'utf8' }).trim();

// Shell visuel validé : aucune IA ne doit le modifier au passage d'une correction métier.
const protectedShell = {
  // Adel (20/09/2026) : hash mis à jour après vérification -- chaque
  // changement reste tracé en commentaire pour que ce garde-fou continue à
  // détecter un VRAI changement non revu, pas juste tout changement.
  // App.tsx (31c0390, 08/09/2026) : ajout d'AccountGateModal au montage
  // racine (popup de compte "reste au même endroit", même patron que les
  // autres overlays globaux déjà montés ici) -- pas un changement de
  // responsive/layout, vérifié via git show avant mise à jour du hash.
  'packages/mobile/App.tsx': '2e33a79d8f044ad174730f43e9e37f1c2d7d255b',
  // Navigation.tsx : c0f6f2a ajoute insets.bottom à la barre d'onglets
  // (safe-area iPhone), puis e828b1c3 ajoute uniquement la route
  // PlaylistSaleHistory vers l'écran d'historique validé. Aucun changement
  // de responsive/design de la barre : hash revérifié après ces deux ajouts.
  'packages/mobile/src/navigation/Navigation.tsx': '387150e976eba03103be0d9b4e8c39b490ddbdc8',
};
for (const [rel, expected] of Object.entries(protectedShell)) {
  const actual = blob(rel);
  if (actual !== expected) failures.push(`PROTECTED MOBILE SHELL CHANGED: ${rel} (${actual})`);
}

const profile = read('packages/mobile/src/screens/ProfilePublicScreen.tsx');
for (const marker of ['loadOwnProfileKeeps', 'loadOwnProfileSnapshot', 'publicKeptTracks.map', 'ownSnapshot?.totalKeeps', 'CONTINUER EN MODE DÉMO']) {
  if (!profile.includes(marker)) failures.push(`OWN PROFILE CANONICAL MARKER MISSING: ${marker}`);
}
for (const marker of ["profileKeptTracks.filter((entry) => entry.visibility === 'PUBLIC')", 'const publicKeptTracks = useMemo']) {
  if (!profile.includes(marker)) failures.push(`OWN PROFILE PRIVACY MARKER MISSING: ${marker}`);
}
if (profile.includes('accessibilityLabel="Modifier mon profil"')) failures.push('DUPLICATE MODIFIER BUTTON REINTRODUCED');
for (const marker of ["topMetricsBar", "label: 'Abonnés'", "label: 'Reprises'", "label: 'Morceaux'", "label: 'Abonnements'"]) {
  if (!profile.includes(marker)) failures.push(`OWN PROFILE COMPACT COUNTER CONTRACT MISSING: ${marker}`);
}
if (profile.includes('function Stat({value,label}')) failures.push('OWN PROFILE LOCAL COUNTER COMPONENT REINTRODUCED');

const viewedProfile = read('packages/mobile/src/screens/PublicUserProfileScreen.tsx');
for (const marker of ['loadPublicProfileKeeps', 'canonicalKeeps']) {
  if (!viewedProfile.includes(marker)) failures.push(`PUBLIC PROFILE CANONICAL MARKER MISSING: ${marker}`);
}
for (const marker of ["import ProfileCounterRow from '../components/ProfileCounterRow';", '<ProfileCounterRow kind="connections'", "label: 'Abonnés'", "label: 'Reprises'", "label: 'Morceaux'", "label: 'Abonnements'"]) {
  if (!viewedProfile.includes(marker)) failures.push(`VIEWED PROFILE COMPACT COUNTER CONTRACT MISSING: ${marker}`);
}
if (viewedProfile.includes('function Stat({ value, label }')) failures.push('VIEWED PROFILE LOCAL COUNTER COMPONENT REINTRODUCED');

const counterComponent = read('packages/mobile/src/components/ProfileCounterRow.tsx');
for (const marker of ["kind?: 'connections' | 'keeps'", "accessibilityRole=\"button\"", "onPress={item.onPress}"]) {
  if (!counterComponent.includes(marker)) failures.push(`SHARED PROFILE COUNTER INTERACTION CONTRACT MISSING: ${marker}`);
}

const publicShare = read('packages/mobile/share-profile.html');
for (const marker of ['class="connections"', 'class="stats"', 'openAuthOverlay', 'SE CONNECTER / CRÉER POUR SUIVRE', 'keep_follow_profile', 'keep_unfollow_profile']) {
  if (!publicShare.includes(marker)) failures.push(`PERMANENT PUBLIC PROFILE COUNTER/FOLLOW CONTRACT MISSING: ${marker}`);
}
if (!publicShare.includes("openAuthOverlay('login')")) failures.push('PERMANENT PUBLIC PROFILE FOLLOW MUST PRIORITIZE LOGIN');
if (!publicShare.includes('setTimeout(()=>controller.abort(),10000)')) failures.push('PERMANENT PUBLIC PROFILE FOLLOW TIMEOUT MISSING');
const connectionsIndex = publicShare.indexOf('class="connections"');
const keepStatsIndex = publicShare.indexOf('class="stats"');
if (connectionsIndex < 0 || keepStatsIndex < 0 || connectionsIndex > keepStatsIndex) failures.push('PERMANENT PUBLIC PROFILE COUNTER ORDER CHANGED');
if (!publicShare.includes('.connection span{display:block;font-size:11px;color:#fff')) failures.push('PERMANENT PUBLIC PROFILE FOLLOW LABELS NOT WHITE/READABLE');
if (!publicShare.includes('.stat span{display:block;font-size:11px;color:#fff')) failures.push('PERMANENT PUBLIC PROFILE KEEP LABELS NOT WHITE/READABLE');

const account = read('packages/mobile/src/components/UsernameAccountForm.tsx');
for (const forbidden of ['stageGuestMusicForUpgrade', 'loadStagedGuestMusic']) {
  if (account.includes(forbidden)) failures.push(`GUEST MUSIC LEAK PATH REINTRODUCED: ${forbidden}`);
}
if (!account.includes('clearSessions()')) failures.push('ACCOUNT SWITCH DOES NOT CLEAR LOCAL MUSIC SESSION');

const settings = read('packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx');
for (const marker of ['getCurrentKeepLocation', 'searchKeepCity', 'setCity(', 'setCountryCode(', 'setLocationOptIn(true)', 'locationOptIn,', 'approx_lat', 'approx_lng']) {
  if (!settings.includes(marker)) failures.push(`GPS PROFILE SETTINGS MARKER MISSING: ${marker}`);
}

const location = read('packages/mobile/src/services/locationService.ts');
for (const marker of ['requestForegroundPermissionsAsync', 'getCurrentPositionAsync', 'reverseGeocodeAsync', 'reverse-geocode-client', 'roundKeepCoordinates', "source: 'web-free'", "source: 'native'"]) {
  if (!location.includes(marker)) failures.push(`GPS SERVICE MARKER MISSING: ${marker}`);
}

const service = read('packages/mobile/src/services/publicProfileStateService.ts');
for (const marker of ['keep_own_profile_tracks', 'keep_public_profile_tracks', 'keep_own_profile_snapshot', 'PUBLIC_KEEP_PAGE_SIZE']) {
  if (!service.includes(marker) && !service.includes(marker.replace('PUBLIC_KEEP_PAGE_SIZE', 'KEEP_PAGE_SIZE'))) failures.push(`PROFILE STATE SERVICE MARKER MISSING: ${marker}`);
}

const migration = read('supabase/migrations/20260828114000_public_keep_library_single_source.sql');
for (const marker of ['idx_keep_decisions_owner_track_latest', 'idx_keep_decisions_public_profile_track_latest', 'keep_own_profile_tracks', 'keep_public_profile_tracks', 'keep_own_profile_snapshot']) {
  if (!migration.includes(marker)) failures.push(`PROFILE DB INVARIANT MISSING: ${marker}`);
}

for (const rel of ['packages/mobile/dist-web', 'packages/mobile/dist-ios']) {
  if (fs.existsSync(path.join(root, rel))) failures.push(`GENERATED EXPORT COMMITTED: ${rel}`);
}

if (failures.length) {
  console.error('KEEP PROFILE DATA INTEGRITY: FAILED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('KEEP PROFILE DATA INTEGRITY: PASS');
console.log('owner list/count: same authenticated server library; profile render: PUBLIC only');
console.log('public list/count: same public distinct library');
console.log('profile counters: shared owner/visitor component + permanent public page order enforced');
console.log('shared profile follow: login-first handoff + secured follow/unfollow RPC + bounded request');
console.log('guest/demo music: isolated from authenticated accounts');
console.log('GPS: native + web foreground location, city/country resolution, approximate coordinates + persisted opt-in contract present');
console.log('protected shell: App.tsx + Navigation.tsx unchanged');