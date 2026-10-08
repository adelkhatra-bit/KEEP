const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const failures = [];
const expectedRepository = 'adelkhatra-bit/KEEP';
const expectedBranch = 'reconcile/claude-main-20260825';
const expectedPublicRoot = 'https://adelkhatra-bit.github.io/KEEP';
const branchContract = JSON.parse(read('BRANCH_SOURCE_OF_TRUTH.json'));
const copilotReview = branchContract.reviewBranches?.['copilot/*'];
if (!branchContract.allowedRemoteBranches?.includes('copilot/*')
  || branchContract.forbiddenRemoteBranches?.includes('copilot/*')
  || copilotReview?.pullRequestBase !== expectedBranch
  || copilotReview?.publicationSource !== false) {
  failures.push('BRANCH CONTRACT MUST ALLOW COPILOT REVIEW ONLY TOWARDS CANONICAL SOURCE');
}

if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== expectedRepository) {
  failures.push(`WRONG REPOSITORY: ${process.env.GITHUB_REPOSITORY}`);
}
// Une branche Copilot est une branche de revue, jamais une source de publication.
// Elle doit contenir la référence produit récupérée avant toute validation.
let verifiedAgentBranch = '';
try {
  const localBranch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  const reviewBranch = localBranch || process.env.GITHUB_HEAD_REF || '';
  if (reviewBranch.startsWith('copilot/')) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', `refs/remotes/origin/${expectedBranch}`, 'HEAD'], { cwd: root, stdio: 'pipe' });
      verifiedAgentBranch = reviewBranch;
    } catch {
      failures.push('AGENT BRANCH MUST CONTAIN FETCHED CANONICAL SOURCE');
    }
  }
  if (localBranch && localBranch !== expectedBranch && localBranch !== verifiedAgentBranch) failures.push(`WRONG LOCAL BRANCH: ${localBranch}`);
} catch {
  // Source archives / CI environments without git metadata still use the explicit
  // repository + branch guards above.
}

const verifiedPullRequestRef = verifiedAgentBranch
  && process.env.GITHUB_EVENT_NAME === 'pull_request'
  && process.env.GITHUB_HEAD_REF === verifiedAgentBranch
  && /^\d+\/merge$/.test(process.env.GITHUB_REF_NAME || '');
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== expectedBranch && process.env.GITHUB_REF_NAME !== verifiedAgentBranch && !verifiedPullRequestRef) {
  failures.push(`WRONG BRANCH: ${process.env.GITHUB_REF_NAME}`);
}
if (verifiedAgentBranch && process.env.GITHUB_BASE_REF !== copilotReview?.pullRequestBase) {
  failures.push(`WRONG AGENT REVIEW BASE: ${process.env.GITHUB_BASE_REF || 'missing'}`);
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
if (platformParity.webEntryMode !== 'qr-only-when-signed-out') failures.push('WEB ENTRY MUST REMAIN QR-ONLY');
if (platformParity.webAuthenticatedRuntime !== 'shared-packages-mobile-src') failures.push('WEB AUTHENTICATED RUNTIME MUST USE SHARED MOBILE SOURCE');
if (platformParity.webAccountCreationAllowed !== false) failures.push('WEB MUST NOT CREATE ACCOUNTS');
if (platformParity.webPasswordLoginAllowed !== false) failures.push('WEB MUST NOT EXPOSE PASSWORD LOGIN');
if (platformParity.webRemoteLogout !== true) failures.push('WEB REMOTE LOGOUT MUST REMAIN ENABLED');
if (platformParity.musicParity?.sharedBusinessLogic !== true) failures.push('MUSIC PARITY MUST USE SHARED BUSINESS LOGIC');
if (platformParity.musicParity?.designMustRemainShared !== true) failures.push('MUSIC PARITY MUST NOT SPLIT THE DESIGN');
if (platformParity.musicParity?.nativeAudioAdapterMayDiffer !== true) failures.push('MUSIC PARITY MUST ACKNOWLEDGE NATIVE AUDIO ADAPTER');
const parityRequirements = Array.isArray(platformParity.musicParity?.requirements) ? platformParity.musicParity.requirements.join('\n') : '';
for (const marker of [
  'PASSER updates the visible card immediately',
  'Battle Solo result hold is at most 700ms',
  'Web viewport emulation never counts as proof of native iOS audio parity',
]) {
  if (!parityRequirements.includes(marker)) failures.push(`MUSIC PARITY REQUIREMENT MISSING: ${marker}`);
}

const battleSource = read('packages/mobile/src/components/KeepBattleMobileGameV3.tsx');
const audioPreviewSource = read('packages/mobile/src/services/audioPreviewService.ts');
const swipeModalSource = read('packages/mobile/src/components/MusicSwipeDeckModal.tsx');
const homeListenSource = read('packages/mobile/src/screens/HomeScreenCompact.tsx');
const resultHoldMatch = battleSource.match(/const SOLO_RESULT_HOLD_MS\s*=\s*(\d+)/);
if (!resultHoldMatch || Number(resultHoldMatch[1]) > 700) failures.push('BATTLE SOLO RESULT HOLD MUST STAY <= 700MS');
if (!audioPreviewSource.includes('createSoundWithRetry(previewUrl, effectivePosition, () => {}, false, !activePlaying)')) {
  failures.push('IOS NEXT-PREVIEW PRELOAD MUST AVOID AUDIOSESSION RESET WHILE CURRENT TRACK PLAYS');
}
if (audioPreviewSource.includes('if (status.isLoaded && status.isPlaying) return;')) {
  failures.push('IOS NEXT-PREVIEW PRELOAD MUST NOT BE SKIPPED JUST BECAUSE CURRENT AUDIO IS PLAYING');
}
if (!swipeModalSource.includes('optimisticPass?: boolean')) failures.push('MUSIC SWIPE MUST RETAIN OPTIMISTIC PASS SUPPORT');
// Décision d'Adel 05/10/2026 : Loki Pulse retiré de l'accueil Écouter (reste sur le profil).
if (homeListenSource.includes('homePulseWrap')) failures.push('LOKI PULSE BUBBLES MUST NOT RETURN TO LISTEN HOME (ADEL 05/10/2026)');


const spacingSource = read('packages/mobile/src/theme/spacing.ts');
const motionButtonSource = read('packages/mobile/src/components/MotionActionButton.tsx');
if (!/export const minTouchTarget\s*=\s*48\s*;/.test(spacingSource)) {
  failures.push('ACCESSIBILITY TOUCH TARGET MUST REMAIN 48');
}
if (!motionButtonSource.includes('minWidth: minTouchTarget') || !motionButtonSource.includes('minHeight: minTouchTarget')) {
  failures.push('MOTION ACTION BUTTON MUST ENFORCE 48x48 TOUCH TARGET');
}
for (const forbidden of platformParity.forbiddenParallelRoots || []) {
  if (fs.existsSync(path.join(root, forbidden))) failures.push(`PARALLEL MOBILE/WEB PRODUCT ROOT FORBIDDEN: ${forbidden}`);
}
const dualViewportWorkflow = fs.readFileSync(path.join(root, platformParity.dualViewportWorkflow), 'utf8');
for (const marker of ['packages/mobile/**', '390', '844', '1440', '900']) {
  if (!dualViewportWorkflow.toLowerCase().includes(marker.toLowerCase())) failures.push(`MOBILE/DESKTOP PARITY MARKER MISSING: ${marker}`);
}

const productContract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
const iosCompatibility = productContract.iosCompatibility || {};
if (iosCompatibility.minimumSupportedVersion !== '15.1') failures.push('IOS MINIMUM SUPPORT MUST STAY 15.1');
if (iosCompatibility.shazamModuleMinimum !== '15.1') failures.push('SHAZAM MODULE MINIMUM MUST STAY 15.1');
if (iosCompatibility.iapModuleMinimum !== '15.1') failures.push('IAP MODULE MINIMUM MUST STAY 15.1');
const mobileAppConfig = JSON.parse(read('packages/mobile/app.json'));
const deploymentTarget = mobileAppConfig?.expo?.plugins?.find(p => Array.isArray(p) && p[0] === 'expo-build-properties')?.[1]?.ios?.deploymentTarget;
if (deploymentTarget !== '15.1') failures.push(`IOS DEPLOYMENT TARGET MUST STAY 15.1 (found: ${deploymentTarget || 'missing'})`);
const shazamPodspec = read('packages/mobile/modules/keep-shazam/ios/KeepShazam.podspec');
const iapPodspec = read('packages/mobile/modules/keep-iap/ios/KeepIAP.podspec');
if (!shazamPodspec.includes("s.platforms      = { :ios => '15.1' }")) failures.push('KEEP SHAZAM MUST SUPPORT IOS 15.1');
if (!iapPodspec.includes("s.platforms      = { :ios => '15.1' }")) failures.push('KEEP IAP MUST SUPPORT IOS 15.1');

const uxRules = productContract.uxInteractionRules || {};
if (uxRules.functionalGreyTextOnDarkForbidden !== true) failures.push('UX DARK BACKGROUND CONTRAST RULE MISSING');
if (uxRules.permanentLongExplanationsForbidden !== true) failures.push('UX PERMANENT LONG EXPLANATIONS MUST STAY FORBIDDEN');
if (uxRules.helpExpansionMustNotShiftPrimaryControls !== true) failures.push('UX HELP EXPANSION MUST NOT SHIFT PRIMARY CONTROLS');
if (Number(uxRules.primaryActionAccessMaxClicks) !== 1) failures.push('UX PRIMARY ACTION MUST STAY ONE-CLICK');
if (uxRules.secondClickReservedForSensitiveConfirmation !== true) failures.push('UX SECOND CLICK MUST BE RESERVED FOR SENSITIVE CONFIRMATION');
if (uxRules.buttonWithoutActionForbidden !== true) failures.push('UX BUTTON WITHOUT ACTION MUST STAY FORBIDDEN');
if (uxRules.preferInlineActionOverExtraNavigation !== true) failures.push('UX INLINE ACTION RULE MISSING');
if (uxRules.sameRulesMobileAndWeb !== true) failures.push('UX RULES MUST MATCH MOBILE AND WEB');
const uxColorsSource = read('packages/mobile/src/theme/colors.ts');
for (const uxMarker of ["textPrimary: '#FFFFFF'", "textSecondary: '#FFFFFF'", "textMuted: '#FFFFFF'"]) {
  if (!uxColorsSource.includes(uxMarker)) failures.push(`UX HIGH-CONTRAST TOKEN MISSING: ${uxMarker}`);
}
const uxHomeSource = read('packages/mobile/src/screens/HomeScreenCompact.tsx');
if (!uxHomeSource.includes('idleLearnMoreSlot')) failures.push('HOME HELP MUST RESERVE STABLE LAYOUT SPACE');
if (uxHomeSource.includes('MusicStoryRail')) failures.push('STORIES BELONG ON THE PROFILE, NOT ON LISTEN HOME (ADEL 05/10/2026)');
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

// Super Admin integration UX contract: every backend integration must have
// human-readable help in the UI; provider setup must keep the admin page open.
const adminIntegrations = read('packages/admin/pages/integrations.tsx');
const integrationLinks = read('packages/admin/lib/integrationLinks.ts');
const providerWindow = read('packages/admin/lib/providerWindow.ts');
const adminControl = read('supabase/functions/keep-admin-control/index.ts');
const catalogSource = adminControl.slice(adminControl.indexOf('const CATALOG:'), adminControl.indexOf('};', adminControl.indexOf('const CATALOG:')) + 2);
const catalogKeys = [...catalogSource.matchAll(/^\s{2}([A-Z0-9_]+):/gm)].map((match) => match[1]);
for (const key of catalogKeys) {
  if (!integrationLinks.includes(`  ${key}: {`)) failures.push(`SUPER ADMIN INTEGRATION HELP MISSING: ${key}`);
}
for (const marker of [
  "PIPEDREAM_PROJECT_ID: { label: 'Pipedream — Projects', url: 'https://pipedream.com/projects'",
  "PIPEDREAM_ENVIRONMENT: { label: 'Pipedream — Environment Variables', url: 'https://pipedream.com/settings/env-vars'",
  "fixedValue: 'production'",
  'openProviderWindow',
  'popup=yes',
  'Le Super Admin reste ouvert derrière',
]) {
  if (!integrationLinks.includes(marker) && !adminIntegrations.includes(marker) && !providerWindow.includes(marker)) {
    failures.push(`SUPER ADMIN PROVIDER UX MARKER MISSING: ${marker}`);
  }
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
if (verifiedAgentBranch) console.log(`review branch: ${verifiedAgentBranch} (canonical source verified; not a deployment source)`);
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