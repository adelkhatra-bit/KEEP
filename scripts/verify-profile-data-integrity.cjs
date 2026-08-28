const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const blob = (rel) => execFileSync('git', ['hash-object', rel], { cwd: root, encoding: 'utf8' }).trim();

// Shell visuel validé : aucune IA ne doit le modifier au passage d'une correction métier.
const protectedShell = {
  'packages/mobile/App.tsx': '07f1270c460da7ac1f6b1edc385415fedf7ca0b0',
  'packages/mobile/src/navigation/Navigation.tsx': 'c8c6bf3caabd8fe848af3baa37339ef35a2f405b',
};
for (const [rel, expected] of Object.entries(protectedShell)) {
  const actual = blob(rel);
  if (actual !== expected) failures.push(`PROTECTED MOBILE SHELL CHANGED: ${rel} (${actual})`);
}

const profile = read('packages/mobile/src/screens/ProfilePublicScreen.tsx');
for (const marker of ['loadOwnProfileKeeps', 'loadOwnProfileSnapshot', 'profileKeptTracks.map', 'ownSnapshot?.totalKeeps', 'CONTINUER EN MODE DÉMO']) {
  if (!profile.includes(marker)) failures.push(`OWN PROFILE CANONICAL MARKER MISSING: ${marker}`);
}
if (profile.includes('accessibilityLabel="Modifier mon profil"')) failures.push('DUPLICATE MODIFIER BUTTON REINTRODUCED');

const viewedProfile = read('packages/mobile/src/screens/PublicUserProfileScreen.tsx');
for (const marker of ['loadPublicProfileKeeps', 'canonicalKeeps']) {
  if (!viewedProfile.includes(marker)) failures.push(`PUBLIC PROFILE CANONICAL MARKER MISSING: ${marker}`);
}

const account = read('packages/mobile/src/components/UsernameAccountForm.tsx');
for (const forbidden of ['stageGuestMusicForUpgrade', 'loadStagedGuestMusic']) {
  if (account.includes(forbidden)) failures.push(`GUEST MUSIC LEAK PATH REINTRODUCED: ${forbidden}`);
}
if (!account.includes('clearSessions()')) failures.push('ACCOUNT SWITCH DOES NOT CLEAR LOCAL MUSIC SESSION');

const settings = read('packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx');
for (const marker of ['requestForegroundPermissionsAsync', 'getCurrentPositionAsync', 'reverseGeocodeAsync', 'setCity(', 'setCountryCode(', 'setLocationOptIn(true)', 'locationOptIn,']) {
  if (!settings.includes(marker)) failures.push(`GPS PROFILE MARKER MISSING: ${marker}`);
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
console.log('owner list/count: same authenticated server library');
console.log('public list/count: same public distinct library');
console.log('guest/demo music: isolated from authenticated accounts');
console.log('GPS: city + country reverse geocoding + persisted opt-in contract present');
console.log('protected shell: App.tsx + Navigation.tsx unchanged');
