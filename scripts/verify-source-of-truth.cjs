const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

// Local agents do not always expose GITHUB_REF_NAME. When a real git checkout is
// available, refuse to validate a product task from any non-canonical branch.
try {
  const localBranch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (localBranch && localBranch !== expectedBranch) failures.push(`WRONG LOCAL BRANCH: ${localBranch}`);
} catch {
  // Source archives / CI environments without git metadata still use the explicit
  // repository + branch guards above.
}

const mustExist = [
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
  '.github/workflows/branch-hygiene.yml',
  'BRANCH_SOURCE_OF_TRUTH.json',
  'docs/KEEP_MASTER_SPEC.md',
  'docs/KEEP_CAHIER_DES_CHARGES_UI.md',
  'config/keep-product-contract.json',
  'config/platform-parity-contract.json',
  'config/keep-ui-baseline.json',
  'scripts/verify-product-contract.cjs',
  'scripts/verify-ui-layout-baseline.cjs',
  'packages/mobile',
  'packages/admin',
  'packages/backend',
  'packages/music',
  'packages/mobile/src/navigation/Navigation.tsx',
  'packages/mobile/src/components/UsernameAccountForm.tsx',
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
  'packages/mobile/src/screens/PublicUserProfileScreen.tsx',
  'packages/mobile/src/services/sharingService.ts',
  'packages/mobile/src/services/authService.ts',
  'packages/mobile/src/services/profileService.ts',
  'packages/mobile/src/services/keepMusicCoreRecognition.ts',
  'packages/mobile/share-profile.html',
  'packages/admin/pages/_app.tsx',
  'packages/admin/pages/users.tsx',
  'packages/admin/pages/plans.tsx',
  'packages/admin/pages/integrations.tsx',
  'packages/admin/pages/remote-config.tsx',
  'supabase/functions/keep-admin-control/index.ts',
  'supabase/functions/keep-username-auth/index.ts',
  'supabase/functions/keep-music-core/index.ts',
  'supabase/functions/keep-music-fallback/index.ts',
  'supabase/functions/keep-public/index.ts',
  'supabase/functions/keep-preview/index.ts',
  'supabase/functions/keep-admin-preview/index.ts',
  'supabase/migrations/20260827061000_permanent_profile_username_aliases.sql',
  'supabase/migrations/20260827094000_restore_signup_bonus_twenty.sql',
  'render.yaml',
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
  'START_KEEP_PRO.ps1',
  '.github/workflows/admin-preview.yml',
  '.github/workflows/web-public-from-reconcile.yml',
]) {
  if (fs.existsSync(path.join(root, forbidden))) failures.push(`LEGACY PATH PRESENT: ${forbidden}`);
}

const branchContract = JSON.parse(fs.readFileSync(path.join(root, 'BRANCH_SOURCE_OF_TRUTH.json'), 'utf8'));
for (const [key, expected] of Object.entries({
  repository: expectedRepository,
  canonicalBranch: expectedBranch,
  applicationSourceBranch: expectedBranch,
  publicWebSourceBranch: expectedBranch,
  githubPagesWorkflow: '.github/workflows/web-preview-pages.yml',
  frozenDefaultBranch: 'main',
  productSourceCount: 1,
})) {
  if (branchContract[key] !== expected) failures.push(`BRANCH CONTRACT MISMATCH: ${key}=${branchContract[key]}`);
}
for (const forbiddenBranch of ['web-preview', 'admin-preview']) {
  if (!branchContract.forbiddenRemoteBranches?.includes(forbiddenBranch)) {
    failures.push(`BRANCH CONTRACT MUST FORBID REMOTE BRANCH: ${forbiddenBranch}`);
  }
}

const platformParity = JSON.parse(fs.readFileSync(path.join(root, 'config/platform-parity-contract.json'), 'utf8'));
if (platformParity.canonicalRuntime !== 'packages/mobile') failures.push('PLATFORM PARITY CANONICAL RUNTIME MISMATCH');
if (platformParity.webBuildSource !== 'packages/mobile') failures.push('PLATFORM PARITY WEB SOURCE MUST BE packages/mobile');
for (const forbidden of platformParity.forbiddenParallelRoots || []) {
  if (fs.existsSync(path.join(root, forbidden))) failures.push(`PARALLEL MOBILE/WEB PRODUCT ROOT FORBIDDEN: ${forbidden}`);
}
const dualViewportWorkflow = fs.readFileSync(path.join(root, platformParity.dualViewportWorkflow), 'utf8');
for (const marker of ['packages/mobile/**', '390', '844', '1440', '900']) {
  if (!dualViewportWorkflow.toLowerCase().includes(marker.toLowerCase())) failures.push(`MOBILE/DESKTOP PARITY MARKER MISSING: ${marker}`);
}

const productContract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
if (productContract.profileOwner?.freePlacement !== 'immediately-after-Reprises-in-owner-metrics-bar') failures.push('PRODUCT CONTRACT FREE PLACEMENT MISMATCH');
if (productContract.profileOwner?.freeBesideProfileKind !== false) failures.push('PRODUCT CONTRACT FREE BESIDE PROFILE KIND MISMATCH');
if (productContract.profileOwner?.freeImmediatelyAfterReprises !== true) failures.push('PRODUCT CONTRACT FREE AFTER REPRISES MISMATCH');
if (JSON.stringify(productContract.profileOwner?.metricsBarOrder) !== JSON.stringify(['PLUS','Abonnés','Reprises','FREE'])) failures.push('PRODUCT CONTRACT METRICS ORDER MISMATCH');

const masterSpec = fs.readFileSync(path.join(root, 'docs/KEEP_MASTER_SPEC.md'), 'utf8');
for (const expected of [
  expectedRepository,
  expectedBranch,
  '**PLUS | Abonnés | Reprises | FREE**',
  'FREE est immédiatement à droite de Reprises',
  'listen = 0',
  'recognize = 0',
  'PASS = 0',
  'KEEP = -3',
  'rrhqsqzcplvmwxizqnla.supabase.co',
]) {
  if (!masterSpec.includes(expected)) failures.push(`MASTER SPEC MARKER MISSING: ${expected}`);
}

const claudeInstructions = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
for (const expected of [expectedRepository, expectedBranch, `${expectedPublicRoot}/`, `${expectedPublicRoot}/share-profile/?u=<username>`]) {
  if (!claudeInstructions.includes(expected)) failures.push(`CLAUDE SOURCE MARKER MISSING: ${expected}`);
}
if (!/pseudo \+ mot de passe \+ e-mail vérifié \(les trois obligatoires\)/i.test(claudeInstructions)) {
  failures.push('CLAUDE AUTH RULE DOES NOT REQUIRE USERNAME + PASSWORD + VERIFIED EMAIL AT SIGNUP');
}

const copilotInstructions = fs.readFileSync(path.join(root, '.github/copilot-instructions.md'), 'utf8');
for (const expected of [expectedRepository, expectedBranch, expectedPublicRoot, 'Never create or deploy a second KEEP app']) {
  if (!copilotInstructions.includes(expected)) failures.push(`COPILOT SOURCE MARKER MISSING: ${expected}`);
}

const nav = fs.readFileSync(path.join(root, 'packages/mobile/src/navigation/Navigation.tsx'), 'utf8');
for (const label of ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) {
  if (!nav.includes(`tabBarLabel: '${label}'`)) failures.push(`KEEP TAB MISSING: ${label}`);
}
if (!nav.includes('component={ProfilePublicScreen}')) failures.push('PROFILE TAB IS NOT ProfilePublicScreen');
if (!nav.includes('name="ProfileSettings" component={ProfileSettingsMobileScreen}')) failures.push('PROFILE SETTINGS ROUTE MISSING');
if (!nav.includes('name="PublicProfile" component={PublicUserProfileScreen}')) failures.push('PUBLIC USER PROFILE ROUTE MISSING');
if (!nav.includes('name="Notifications" component={NotificationsScreen}')) failures.push('NOTIFICATIONS ROUTE MISSING');
if (!nav.includes(expectedPublicRoot)) failures.push('NAVIGATION PUBLIC PREFIX IS NOT CANONICAL KEEP URL');

const admin = fs.readFileSync(path.join(root, 'packages/admin/pages/_app.tsx'), 'utf8');
for (const expected of ['{APP_NAME} LIVE · RECONCILE', 'admin_users', 'signInWithPassword', 'Aucun lien e-mail n’est envoyé']) {
  if (!admin.includes(expected)) failures.push(`ADMIN LOGIN MARKER MISSING: ${expected}`);
}
if (/signInWithOtp|Recevoir un lien de secours|emailRedirectTo/i.test(admin)) failures.push('BROKEN ADMIN MAGIC-LINK FLOW REINTRODUCED');

if (admin.includes("const DEMO_PASSWORD = '1234'")) failures.push('DEMO ADMIN PASSWORD REINTRODUCED');
const authBoundary = productContract.authBoundary || {};
if (authBoundary.adminSurface !== 'packages/admin') failures.push('AUTH BOUNDARY ADMIN SURFACE MISMATCH');
if (authBoundary.userSurface !== 'packages/mobile') failures.push('AUTH BOUNDARY USER SURFACE MISMATCH');
if (authBoundary.adminAuthorityTable !== 'public.admin_users') failures.push('AUTH BOUNDARY ADMIN AUTHORITY MISMATCH');
if (authBoundary.adminFallback !== 'keep-admin-bootstrap one-time recovery code only') failures.push('AUTH BOUNDARY ADMIN FALLBACK MISMATCH');
if (authBoundary.userRecoveryService !== 'keep-auth-email') failures.push('AUTH BOUNDARY USER RECOVERY MISMATCH');
if (authBoundary.adminRecoveryMustNotUseUserEmailFlow !== true) failures.push('AUTH BOUNDARY MUST FORBID USER RECOVERY IN ADMIN');
if (admin.includes("keep-auth-email")) failures.push('ADMIN MUST NOT CALL USER keep-auth-email RECOVERY');
if (admin.includes("../mobile/") || admin.includes("packages/mobile")) failures.push('ADMIN MUST NOT IMPORT MOBILE AUTH RUNTIME');


const sharing = fs.readFileSync(path.join(root, 'packages/mobile/src/services/sharingService.ts'), 'utf8');
if (!sharing.includes('shareProfileByEmail')) failures.push('USER-OWNED EMAIL SHARE MISSING');
const hasCanonicalProfileBuilder = sharing.includes('buildPublicProfileLink')
  && sharing.includes("buildShareLanding({ u: cleanUsername(username), share: 'profile' })")
  && sharing.includes('/share-profile/');
if (!hasCanonicalProfileBuilder) failures.push('PUBLIC PROFILE LINK MISSING');
if (!sharing.includes(expectedPublicRoot)) failures.push('SHARING PUBLIC ROOT IS NOT CANONICAL KEEP URL');
if (/https?:\/\/localhost/i.test(sharing)) failures.push('LOCALHOST REINTRODUCED IN PUBLIC SHARING');

const sharedProfileHtml = fs.readFileSync(path.join(root, 'packages/mobile/share-profile.html'), 'utf8');
for (const expected of ['profile_username_aliases', 'openAuthOverlay', 'SE CONNECTER / CRÉER POUR SUIVRE', 'keep_follow_profile', 'keep_unfollow_profile', expectedPublicRoot]) {
  if (!sharedProfileHtml.includes(expected)) failures.push(`PERMANENT SHARE PROFILE MARKER MISSING: ${expected}`);
}
// Adel (08/09/2026) : "il faut pas qu'il soit redirigé, il faut qu'il reste
// au même endroit" -- le suivi depuis un lien partagé ouvre désormais une
// pop-up EN PLACE (plus de redirection followAccountRoute/location.href),
// mais l'exigence d'origine reste vraie sous une autre forme : un compte
// Loki existant ne doit jamais être poussé vers la CRÉATION pour suivre,
// donc la pop-up doit ouvrir sur l'onglet Connexion par défaut.
if (sharedProfileHtml.includes('location.href=followAccountRoute')) failures.push('REDIRECT-BASED SHARED PROFILE FOLLOW REINTRODUCED');
if (!sharedProfileHtml.includes("button.onclick=()=>{openAuthOverlay('login');};")) failures.push('SHARED PROFILE FOLLOW MUST PRIORITIZE LOGIN FOR EXISTING KEEP USERS');
if (!sharedProfileHtml.includes("setTimeout(()=>controller.abort(),10000)")) failures.push('SHARED PROFILE FOLLOW REQUEST TIMEOUT MISSING');
if (/https?:\/\/localhost|raw\.githubusercontent\.com|\/web-preview\//i.test(sharedProfileHtml)) {
  failures.push('STALE OR LOCAL PUBLIC PROFILE TARGET REINTRODUCED');
}

const profileService = fs.readFileSync(path.join(root, 'packages/mobile/src/services/profileService.ts'), 'utf8');
if (!profileService.includes("from('profile_username_aliases')")) failures.push('IN-APP LEGACY PROFILE ALIAS RESOLUTION MISSING');

const aliasMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260827061000_permanent_profile_username_aliases.sql'), 'utf8');
for (const expected of ['profile_username_aliases', 'keep_guard_reserved_username', 'keep_capture_username_alias']) {
  if (!aliasMigration.includes(expected)) failures.push(`PROFILE LINK ALIAS MIGRATION MARKER MISSING: ${expected}`);
}

const freeCreditMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260827094000_restore_signup_bonus_twenty.sql'), 'utf8');
if (!freeCreditMigration.includes("'20'::jsonb") || !freeCreditMigration.includes('signup_bonus_successes') || !freeCreditMigration.includes('signup_bonus integer := 20')) {
  failures.push('FREE SIGNUP BONUS MUST REMAIN +20 (3 guest + 20 account = 23)');
}

const authService = fs.readFileSync(path.join(root, 'packages/mobile/src/services/authService.ts'), 'utf8');
for (const expected of ['keep-username-auth', 'setSession', 'signUpWithUsername', 'signInWithUsername']) {
  if (!authService.includes(expected)) failures.push(`USERNAME AUTH MARKER MISSING: ${expected}`);
}
if (!authService.includes("username_only: '1'")) failures.push('USERNAME AUTH DOES NOT REQUEST USERNAME-ONLY ACCOUNT FLOW');
if (/https?:\/\/localhost/i.test(authService)) failures.push('LOCALHOST REINTRODUCED IN AUTH REDIRECT');

const accountForm = fs.readFileSync(path.join(root, 'packages/mobile/src/components/UsernameAccountForm.tsx'), 'utf8');
for (const expected of ['signInWithUsername', 'Pseudo Loki']) {
  if (!accountForm.includes(expected)) failures.push(`USERNAME/PASSWORD ACCOUNT MARKER MISSING: ${expected}`);
}
if (!/adresse e-mail vérifiée sont nécessaires/i.test(accountForm)) {
  failures.push('USERNAME/PASSWORD/EMAIL ACCOUNT MARKER MISSING: mandatory email at signup (01/09/2026 policy)');
}
if (!accountForm.includes('signUpWithEmailIdentity(')) {
  failures.push('PRIMARY ACCOUNT FORM MUST CALL signUpWithEmailIdentity (mandatory verified email at signup)');
}

const usernameAuth = fs.readFileSync(path.join(root, 'supabase/functions/keep-username-auth/index.ts'), 'utf8');
for (const expected of ['usernameFlow', 'emailFlow', 'syntheticEmail', 'username_only', 'sessionFor']) {
  if (!usernameAuth.includes(expected)) failures.push(`USERNAME AUTH BACKEND MARKER MISSING: ${expected}`);
}
if (!usernameAuth.includes('@keep.local')) failures.push('SERVER-SIDE SYNTHETIC AUTH IDENTITY MISSING');

const publicProfile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
// IMPORTANT: validate profile-sharing BEHAVIOUR, not visible button copy.
// Product wording is allowed to evolve ("Mon QR Loki", "Ma carte d’identité Loki Music", etc.).
// A cosmetic rename must never block GitHub Pages again. Only fail when the QR/e-mail
// sharing capability itself disappears or is no longer wired to its action.
for (const [marker, capability] of [
  ['QRCode', 'QR renderer'],
  ['const showQr = () =>', 'QR action'],
  ['onPress={showQr}', 'QR button wiring'],
  ['const shareEmail = async () =>', 'e-mail share action'],
  ['onPress={shareEmail}', 'e-mail share button wiring'],
]) {
  if (!publicProfile.includes(marker)) failures.push(`PROFILE SHARE CAPABILITY MISSING: ${capability}`);
}

const viewedProfile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'), 'utf8');
for (const [marker, capability] of [["from('follows')", 'follow persistence'], ['toggleFollow', 'follow action'], ['keep_follow_profile', 'follow RPC']]) {
  if (!viewedProfile.includes(marker)) failures.push(`FOLLOW CAPABILITY MISSING: ${capability}`);
}

const recognition = fs.readFileSync(path.join(root, 'packages/mobile/src/services/keepMusicCoreRecognition.ts'), 'utf8');
for (const marker of ['keep-music-core', 'keep-music-fallback', 'x-keep-device-id', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'AUDD_PRIMARY_ENABLED = false']) {
  if (!recognition.includes(marker)) failures.push(`SECURE RECOGNITION MARKER MISSING: ${marker}`);
}
if (recognition.includes('EXPO_PUBLIC_AUDD_API_KEY') || recognition.includes('EXPO_PUBLIC_ACRCLOUD_ACCESS_SECRET')) {
  failures.push('MUSIC PROVIDER SECRET REINTRODUCED IN MOBILE');
}

const musicCore = fs.readFileSync(path.join(root, 'supabase/functions/keep-music-core/index.ts'), 'utf8');
for (const marker of ['service_get_integration_secret', 'service_allow_recognition', 'AUDD_API_KEY']) {
  if (!musicCore.includes(marker)) failures.push(`MUSIC CORE SERVER MARKER MISSING: ${marker}`);
}
const musicFallback = fs.readFileSync(path.join(root, 'supabase/functions/keep-music-fallback/index.ts'), 'utf8');
for (const marker of ['ACRCLOUD_ACCESS_KEY', 'ACRCLOUD_ACCESS_SECRET', 'service_allow_recognition']) {
  if (!musicFallback.includes(marker)) failures.push(`MUSIC FALLBACK SERVER MARKER MISSING: ${marker}`);
}

const legacyRedirects = [
  ['supabase/functions/keep-public/index.ts', expectedPublicRoot],
  ['supabase/functions/keep-preview/index.ts', expectedPublicRoot],
  ['supabase/functions/keep-admin-preview/index.ts', `${expectedPublicRoot}/admin-preview/`],
];
for (const [rel, canonical] of legacyRedirects) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!source.includes(canonical)) failures.push(`LEGACY REDIRECT NOT CANONICAL: ${rel}`);
  if (!source.includes('status: 308')) failures.push(`LEGACY REDIRECT MUST BE PERMANENT: ${rel}`);
  if (/raw\.githubusercontent\.com|\/web-preview\//i.test(source)) failures.push(`LEGACY STALE BUNDLE SOURCE REINTRODUCED: ${rel}`);
  if (/SUPABASE_SERVICE_ROLE_KEY|PASS\s*=\s*['"]1234['"]/i.test(source)) failures.push(`LEGACY ENDPOINT EXPOSES PRIVILEGED LOGIC: ${rel}`);
}

const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
const renderBranches = [...render.matchAll(/^\s*branch:\s*(.+)\s*$/gm)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, ''));
if (!renderBranches.length) failures.push('RENDER BRANCH MISSING');
for (const branch of renderBranches) {
  if (branch !== expectedBranch) failures.push(`RENDER WRONG BRANCH: ${branch}`);
}
if (/^\s*branch:\s*main\s*$/m.test(render)) failures.push('RENDER MAIN BRANCH REINTRODUCED');

const workflowsDir = path.join(root, '.github', 'workflows');
for (const filename of fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name))) {
  const workflow = fs.readFileSync(path.join(workflowsDir, filename), 'utf8');
  if (/branches\s*:\s*\[[^\]]*(?:^|[,'"\s])main(?:[,'"\s]|$)[^\]]*\]/m.test(workflow)) failures.push(`WORKFLOW STILL TARGETS MAIN: ${filename}`);
  if (/^\s*-\s*main\s*$/m.test(workflow)) failures.push(`WORKFLOW STILL TARGETS MAIN: ${filename}`);
}

const pagesWorkflow = fs.readFileSync(path.join(root, '.github/workflows/web-preview-pages.yml'), 'utf8');
// Validate durable Pages capabilities, never the display name of an optional audit step.
// Renaming/removing a browser-matrix label must not block publication if the site still
// builds, deploys, restores deep links and smoke-tests critical Loki routes.
for (const [marker, capability] of [
  [expectedRepository, 'repository lock'],
  [expectedBranch, 'branch lock'],
  [expectedPublicRoot, 'public root'],
  ['__keep_route', 'deep-link fallback'],
  ['Deploy to GitHub Pages', 'Pages deployment'],
  ['Live refresh + direct-link HTTP smoke', 'live HTTP smoke'],
  ['playlist-sale', 'playlist sale deep link'],
]) {
  if (!pagesWorkflow.includes(marker)) failures.push(`PUBLIC DEPLOY CAPABILITY MISSING: ${capability}`);
}

const launchers = fs.readdirSync(root).filter((name) => /^START_.*KEEP.*\.bat$/i.test(name) || /^FORCE_.*KEEP.*\.bat$/i.test(name));
if (launchers.length !== 1 || launchers[0] !== 'START_KEEP_LIVE_CLEAN.bat') {
  failures.push(`EXPECTED ONE CANONICAL LAUNCHER, FOUND: ${launchers.join(', ') || 'none'}`);
}

try {
  execFileSync(process.execPath, [path.join(root, 'scripts/verify-product-contract.cjs')], { stdio: 'inherit' });
} catch {
  failures.push('PRODUCT CONTRACT GUARD FAILED');
}

if (failures.length) {
  console.error('\nKEEP SOURCE-OF-TRUTH CHECK FAILED\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KEEP source of truth: OK');
console.log(`repository: ${expectedRepository}`);
console.log(`branch: ${expectedBranch}`);
console.log('branch contract: ONE product source; mobile + public web use the same canonical branch; main is frozen metadata only');
console.log('branch hygiene: web-preview + admin-preview are forbidden remote branches');
console.log(`public root: ${expectedPublicRoot}/`);
console.log('public profile links: permanent aliases reserved per profile');
console.log('auth user: pseudo + mot de passe + e-mail vérifié obligatoires à la création (depuis le 01/09/2026)');
console.log('free credits: 3 guest + 20 signup bonus = 23');
console.log('auth admin: direct password session (no magic-link redirect)');
console.log('music recognition: shared memory + ACRCloud primary; AudD disabled until a valid server key is explicitly reactivated; no provider secret in mobile');
console.log('mobile: packages/mobile');
console.log('admin: packages/admin');
console.log('backend: packages/backend');
console.log('music: packages/music');
console.log('local launcher: START_KEEP_LIVE_CLEAN.bat');