const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const expectedRepository = 'adelkhatra-bit/KEEP';
const expectedBranch = 'reconcile/claude-main-20260825';
const expectedPublicRoot = 'https://adelkhatra-bit.github.io/KEEP';

if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== expectedRepository) {
  failures.push(`WRONG REPOSITORY: ${process.env.GITHUB_REPOSITORY}`);
}
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== expectedBranch) {
  failures.push(`WRONG BRANCH: ${process.env.GITHUB_REF_NAME}`);
}

const mustExist = [
  'CLAUDE.md',
  'AGENTS.md',
  'packages/mobile',
  'packages/admin',
  'packages/backend',
  'packages/music',
  'packages/mobile/src/navigation/Navigation.tsx',
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
  'packages/mobile/src/screens/PublicUserProfileScreen.tsx',
  'packages/mobile/src/services/sharingService.ts',
  'packages/mobile/src/services/authService.ts',
  'packages/mobile/src/services/keepMusicCoreRecognition.ts',
  'packages/admin/pages/_app.tsx',
  'packages/admin/pages/users.tsx',
  'packages/admin/pages/plans.tsx',
  'packages/admin/pages/integrations.tsx',
  'packages/admin/pages/remote-config.tsx',
  'supabase/functions/keep-admin-control/index.ts',
  'supabase/functions/keep-music-core/index.ts',
  'START_KEEP_LIVE_CLEAN.bat',
];

for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`MISSING: ${rel}`);
}

for (const forbidden of [
  'apps',
  'START_KEEP_LATEST.bat',
  'FORCE_START_LATEST_KEEP.bat',
  'START_KEEP_PRO.bat',
  '.github/workflows/admin-preview.yml',
  '.github/workflows/web-public-from-reconcile.yml',
]) {
  if (fs.existsSync(path.join(root, forbidden))) failures.push(`LEGACY PATH PRESENT: ${forbidden}`);
}

const claudeInstructions = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
for (const expected of [expectedRepository, expectedBranch, `${expectedPublicRoot}/`, `${expectedPublicRoot}/share-profile/?u=<username>`]) {
  if (!claudeInstructions.includes(expected)) failures.push(`CLAUDE SOURCE MARKER MISSING: ${expected}`);
}

const nav = fs.readFileSync(path.join(root, 'packages/mobile/src/navigation/Navigation.tsx'), 'utf8');
for (const label of ['Écouter', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) {
  if (!nav.includes(`tabBarLabel: '${label}'`)) failures.push(`KEEP TAB MISSING: ${label}`);
}
if (!nav.includes('component={ProfilePublicScreen}')) failures.push('PROFILE TAB IS NOT ProfilePublicScreen');
if (!nav.includes('name="ProfileSettings" component={ProfileSettingsMobileScreen}')) failures.push('PROFILE SETTINGS ROUTE MISSING');
if (!nav.includes('name="PublicProfile" component={PublicUserProfileScreen}')) failures.push('PUBLIC USER PROFILE ROUTE MISSING');
if (!nav.includes('name="Notifications" component={NotificationsScreen}')) failures.push('NOTIFICATIONS ROUTE MISSING');
if (!nav.includes(expectedPublicRoot)) failures.push('NAVIGATION PUBLIC PREFIX IS NOT CANONICAL KEEP URL');

const admin = fs.readFileSync(path.join(root, 'packages/admin/pages/_app.tsx'), 'utf8');
for (const expected of [
  'KEEP LIVE · RECONCILE',
  'admin_users',
  'signInWithPassword',
  'signInWithOtp',
  'Recevoir un lien de secours',
]) {
  if (!admin.includes(expected)) failures.push(`ADMIN LOGIN MARKER MISSING: ${expected}`);
}
if (admin.includes("const DEMO_PASSWORD = '1234'")) failures.push('DEMO ADMIN PASSWORD REINTRODUCED');

const sharing = fs.readFileSync(path.join(root, 'packages/mobile/src/services/sharingService.ts'), 'utf8');
if (!sharing.includes('shareProfileByEmail')) failures.push('USER-OWNED EMAIL SHARE MISSING');
if (!sharing.includes('/share-profile/?u=')) failures.push('PUBLIC PROFILE LINK MISSING');
if (!sharing.includes(expectedPublicRoot)) failures.push('SHARING PUBLIC ROOT IS NOT CANONICAL KEEP URL');
if (/https?:\/\/localhost/i.test(sharing)) failures.push('LOCALHOST REINTRODUCED IN PUBLIC SHARING');

const authService = fs.readFileSync(path.join(root, 'packages/mobile/src/services/authService.ts'), 'utf8');
if (!authService.includes(`${expectedPublicRoot}/`)) failures.push('AUTH REDIRECT IS NOT CANONICAL KEEP URL');
if (/https?:\/\/localhost/i.test(authService)) failures.push('LOCALHOST REINTRODUCED IN AUTH REDIRECT');

const publicProfile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
for (const marker of ['QRCode', 'Mon QR KEEP', 'Partager par e-mail']) {
  if (!publicProfile.includes(marker)) failures.push(`PROFILE SHARE MARKER MISSING: ${marker}`);
}

const viewedProfile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'), 'utf8');
for (const marker of ['+ Suivre', "from('follows')", 'toggleFollow']) {
  if (!viewedProfile.includes(marker)) failures.push(`FOLLOW MARKER MISSING: ${marker}`);
}

const recognition = fs.readFileSync(path.join(root, 'packages/mobile/src/services/keepMusicCoreRecognition.ts'), 'utf8');
for (const marker of ['keep-music-core', 'x-keep-device-id', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
  if (!recognition.includes(marker)) failures.push(`SECURE RECOGNITION MARKER MISSING: ${marker}`);
}
if (recognition.includes('EXPO_PUBLIC_AUDD_API_KEY')) failures.push('AUDD SECRET REINTRODUCED IN MOBILE');

const pagesWorkflow = fs.readFileSync(path.join(root, '.github/workflows/web-preview-pages.yml'), 'utf8');
for (const expected of [expectedRepository, expectedBranch, expectedPublicRoot, '__keep_route', 'Live browser matrix']) {
  if (!pagesWorkflow.includes(expected)) failures.push(`PUBLIC DEPLOY MARKER MISSING: ${expected}`);
}

const launchers = fs.readdirSync(root).filter((name) => /^START_.*KEEP.*\.bat$/i.test(name) || /^FORCE_.*KEEP.*\.bat$/i.test(name));
if (launchers.length !== 1 || launchers[0] !== 'START_KEEP_LIVE_CLEAN.bat') {
  failures.push(`EXPECTED ONE CANONICAL LAUNCHER, FOUND: ${launchers.join(', ') || 'none'}`);
}

if (failures.length) {
  console.error('\nKEEP SOURCE-OF-TRUTH CHECK FAILED\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KEEP source of truth: OK');
console.log(`repository: ${expectedRepository}`);
console.log(`branch: ${expectedBranch}`);
console.log(`public root: ${expectedPublicRoot}/`);
console.log('mobile: packages/mobile');
console.log('admin: packages/admin');
console.log('backend: packages/backend');
console.log('music: packages/music');
console.log('local launcher: START_KEEP_LIVE_CLEAN.bat');