const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-ui-baseline.json'), 'utf8'));
const productContract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
const profile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx'), 'utf8');
const home = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/HomeScreenCompact.tsx'), 'utf8');

const fail = (message) => { throw new Error(`KEEP UI BASELINE: ${message}`); };
const must = (condition, message) => { if (!condition) fail(message); };

must(baseline.canonicalBranch === 'reconcile/claude-main-20260825', 'wrong canonical branch');
must(baseline.profileOwner?.freePlacement === 'immediately-after-Reprises-in-owner-metrics-bar', 'machine baseline must keep FREE after Reprises');
must(baseline.profileOwner?.freeMustAppearBesideProfileKind === false, 'machine baseline must keep FREE out of profile type row');
must(baseline.profileOwner?.freeImmediatelyAfterReprises === true, 'machine baseline must lock FREE after Reprises');
must(baseline.profileOwner?.freeMustAppearExactlyOnce === true, 'machine baseline must lock one FREE instance');
must(baseline.profileOwner?.certificationMustAppearBesideUsername === true, 'machine baseline must keep certification beside username');
must(baseline.profileOwner.freePlacement === productContract.profileOwner.freePlacement, 'UI baseline disagrees with canonical product contract');
must(JSON.stringify(baseline.profileOwner.metricsBarOrder) === JSON.stringify(productContract.profileOwner.metricsBarOrder), 'metrics order disagrees with canonical product contract');
must(baseline.typography?.minimumFontSizePx === productContract.typography?.minimumFontSizePx, 'UI baseline typography minimum disagrees with product contract');
must(baseline.typography?.minimumFontSizePx === 11, 'all UI text must stay at least 11px');
must(JSON.stringify(baseline.typography?.mobileTextStyles) === JSON.stringify(productContract.typography?.mobileTextStyles), 'UI baseline Loki text styles disagree with product contract');

const touchRule = baseline.accessibilityTouchTargets || {};
must(touchRule.sharedMinimum === 48, 'shared touch target minimum must stay at 48');
must(productContract.accessibilityTouchTargets?.sharedMinimum === 48, 'product contract touch target minimum must stay at 48');
const spacingSource = fs.readFileSync(path.join(root, 'packages/mobile/src/theme/spacing.ts'), 'utf8');
must(spacingSource.includes('export const minTouchTarget = 48;'), 'theme minTouchTarget must stay at 48');

const identityStart = profile.indexOf('<View style={s.identity}>');
const usernameStart = profile.indexOf('<View style={s.usernameLine}>', identityStart);
const metaStart = profile.indexOf('<View style={s.profileMetaTopRow}>');
const usernameRow = profile.slice(usernameStart, metaStart);
must(usernameRow.includes('<ProfileCertificationBadge tier={certificationTier} compact />'), 'certification badge must stay beside username');
must(profile.includes("const certificationTier = publicSnapshot?.certificationTier ?? fallbackCertification;"), 'certification source disconnected');
const locationStart = profile.indexOf('{(user.city || user.countryCode)', metaStart);
must(metaStart >= 0 && locationStart > metaStart, 'owner identity row not found');
const meta = profile.slice(metaStart, locationStart);

const kind = meta.indexOf('style={[s.kindBadge');
const battle = meta.indexOf('<BattleGlowButton');
must(kind >= 0, 'profile type badge missing');
must(battle > kind, 'Battle must remain after profile type in the identity row');
must((meta.match(/>FREE<\/Text>/g) || []).length === 0, 'FREE must stay out of identity row');
must(!profile.includes('profileFreeInline'), 'stale FREE identity pill returned');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen', metricsStart);
must(metricsStart >= 0 && metricsEnd > metricsStart, 'profile metrics bar not found');
const metrics = profile.slice(metricsStart, metricsEnd);
for (const marker of ['>PLUS</Text>', '>Abonnés</Text>', '>Reprises</Text>', '>FREE</Text>']) must(metrics.includes(marker), `metrics marker missing: ${marker}`);
const plus = metrics.indexOf('>PLUS</Text>');
const followers = metrics.indexOf('>Abonnés</Text>');
const reprises = metrics.indexOf('>Reprises</Text>');
const free = metrics.indexOf('>FREE</Text>');
must(plus >= 0 && followers > plus && reprises > followers && free > reprises, 'metrics order must be PLUS -> Abonnés -> Reprises -> FREE');
must((metrics.match(/>FREE<\/Text>/g) || []).length === 1, 'FREE must appear exactly once in metrics');
must(metrics.includes('topMetricFreeItem'), 'FREE metric item missing');

must(!profile.includes("{ key: 'account'"), 'Compte entry reintroduced in hamburger');
must(!profile.includes("AccountActionsPanel"), 'duplicate account/session panel reintroduced in hamburger');
must(settings.includes("Se déconnecter de Loki Music ?"), 'canonical logout control missing from profile settings');

must(home.includes('<View style={s.idleLearnMoreSlot}>'), 'Listen home must keep the learn-more slot');
// 05/10/2026 (Adel : « écran Écouter sans défilement sur iPhone ») : l'aide s'ouvre
// PAR-DESSUS (surimpression) au lieu de réserver 108 px. Le but d'origine reste
// verrouillé : ouvrir l'aide ne déplace JAMAIS le bouton principal.
must(home.includes("idleLearnMoreSlot: { width: '100%', height: 0"), 'Listen learn-more slot must reserve 0 px (overlay help) so the screen fits an iPhone without scrolling');
must(/idleLearnMorePanel: \{ position: 'absolute'[^\n]*zIndex: 20/.test(home), 'Listen help panel must overlay (absolute, zIndex) so the CTA never jumps');
// 05/10/2026 (Adel) : Écouter = tout visible d'un coup, sans défilement ni swipe ; les bulles
// Loki Pulse quittent l'accueil (elles restent sur le profil) et les stories sont sur le profil.
must(!home.includes('homePulseWrap') && !home.includes('home-loki-pulse-track-bubbles'), 'Loki Pulse bubbles must not come back on the Listen home');
must(!home.includes('MusicStoryRail') && !home.includes('ProfileStoryBar'), 'Stories live on the profile, not on the Listen home');
must(home.includes('<View style={[s.main, s.idle, s.idleFit]}>'), 'Listen home must not scroll: fixed View, content fits the screen');
must(home.includes('const size = Math.max(96, Math.min(196, Math.round((height - 460) * 0.4)));'), 'Listen orb must scale with the screen height (responsive, no swipe)');
must(home.includes("idleSubtitle: { color: colors.white"), 'Listen primary subtitle must use high-contrast text on dark background');
must(home.includes("idleLearnMoreBody: { color: colors.white"), 'Expanded Listen help must use high-contrast text on dark background');

const battleSrc = fs.readFileSync(path.join(root, 'packages/mobile/src/components/KeepBattleMobileGameV3.tsx'), 'utf8');
const visualStyle = (battleSrc.match(/[\s,]visual: \{[^}]*\}/) || [''])[0];
must(visualStyle.includes('borderRadius: 20') && !/\bheight:\s*\d+/.test(visualStyle), 'Solo/Battle artwork must stay a 1:1 square (no fixed height in s.visual: react-native-web would squash it on desktop)');
must(battleSrc.includes("testID=\"battle-solo-artwork-square\"") && battleSrc.includes('aspectRatio: 1'), 'Solo artwork square must keep aspectRatio 1');

console.log('KEEP UI baseline: PASS');
console.log('profile: type -> Battle; metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('hamburger: no duplicate account/session entry');
console.log('accessibility: shared touch targets >= 48 locked');
console.log('listen home: no scroll, responsive orb, overlay help, high contrast; Pulse + stories not on home');
