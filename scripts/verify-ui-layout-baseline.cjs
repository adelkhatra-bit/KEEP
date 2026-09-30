const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-ui-baseline.json'), 'utf8'));
const profile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx'), 'utf8');

const fail = (message) => { throw new Error(`KEEP UI BASELINE: ${message}`); };
const must = (condition, message) => { if (!condition) fail(message); };

must(baseline.canonicalBranch === 'reconcile/claude-main-20260825', 'wrong canonical branch');

const metaStart = profile.indexOf('<View style={s.profileMetaTopRow}>');
const locationStart = profile.indexOf('{(user.city || user.countryCode)', metaStart);
must(metaStart >= 0 && locationStart > metaStart, 'owner identity row not found');
const meta = profile.slice(metaStart, locationStart);

const kind = meta.indexOf('style={[s.kindBadge');
const battle = meta.indexOf('<BattleGlowButton');
must(kind >= 0, 'profile type badge missing');
must(battle > kind, 'Battle must remain aligned with the profile type');
must(!meta.includes('profileFreeInline'), 'FREE must not be beside Utilisateur/Créateur');

const metricsStart = profile.indexOf('<View style={s.topMetricsBar}');
const metricsEnd = profile.indexOf('{freeDetailsOpen ? (', metricsStart);
must(metricsStart >= 0 && metricsEnd > metricsStart, 'profile metrics bar not found');
const metrics = profile.slice(metricsStart, metricsEnd);
for (const marker of ['>PLUS</Text>', '>Abonnés</Text>', '>Reprises</Text>', '>FREE</Text>']) must(metrics.includes(marker), `metrics marker missing: ${marker}`);
const reprises = metrics.indexOf('>Reprises</Text>');
const free = metrics.indexOf('topMetricFreeHero');
must(free > reprises, 'FREE must be aligned immediately after Reprises in the metrics row');
must(!metrics.includes('profileFreeInline'), 'old compact FREE badge reintroduced in metrics');

must(!profile.includes("{ key: 'account'"), 'Compte entry reintroduced in hamburger');
must(!profile.includes("AccountActionsPanel"), 'duplicate account/session panel reintroduced in hamburger');
must(settings.includes("Se déconnecter de Loki Music ?"), 'canonical logout control missing from profile settings');

console.log('KEEP UI baseline: PASS');
console.log('profile: type -> Battle; metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('hamburger: no duplicate account/session entry');
