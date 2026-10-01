const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-ui-baseline.json'), 'utf8'));
const productContract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
const profile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx'), 'utf8');

const fail = (message) => { throw new Error(`KEEP UI BASELINE: ${message}`); };
const must = (condition, message) => { if (!condition) fail(message); };

must(baseline.canonicalBranch === 'reconcile/claude-main-20260825', 'wrong canonical branch');
must(baseline.profileOwner?.freePlacement === 'beside-profile-kind', 'machine baseline must keep FREE beside Utilisateur/Créateur');
must(baseline.profileOwner?.freeMustAppearBesideProfileKind === true, 'machine baseline must keep FREE beside profile type');
must(baseline.profileOwner?.certificationMustAppearBesideUsername === true, 'machine baseline must keep certification beside username');
must(baseline.profileOwner.freePlacement === productContract.profileOwner.freePlacement, 'UI baseline disagrees with canonical product contract');
must(JSON.stringify(baseline.profileOwner.metricsBarOrder) === JSON.stringify(productContract.profileOwner.metricsBarOrder), 'metrics order disagrees with canonical product contract');

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
const free = meta.indexOf('style={[s.profileFreeInline');
const battle = meta.indexOf('<BattleGlowButton');
must(kind >= 0, 'profile type badge missing');
must(free > kind, 'FREE must be aligned immediately after Utilisateur/Créateur');
must(battle > free, 'Battle must remain aligned after FREE');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen ? (', metricsStart);
must(metricsStart >= 0 && metricsEnd > metricsStart, 'profile metrics bar not found');
const metrics = profile.slice(metricsStart, metricsEnd);
for (const marker of ['>PLUS</Text>', '>Abonnés</Text>', '>Reprises</Text>']) must(metrics.includes(marker), `metrics marker missing: ${marker}`);
must(!metrics.includes('topMetricFreeHero'), 'FREE must not be duplicated after Reprises');
must(!metrics.includes('>FREE</Text>'), 'FREE must appear only beside profile type');

must(!profile.includes("{ key: 'account'"), 'Compte entry reintroduced in hamburger');
must(!profile.includes("AccountActionsPanel"), 'duplicate account/session panel reintroduced in hamburger');
must(settings.includes("Se déconnecter de Loki Music ?"), 'canonical logout control missing from profile settings');

console.log('KEEP UI baseline: PASS');
console.log('profile: type -> FREE -> Battle; metrics: PLUS -> Abonnés -> Reprises');
console.log('hamburger: no duplicate account/session entry');
