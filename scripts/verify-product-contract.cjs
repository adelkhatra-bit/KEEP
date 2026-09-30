const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8'));
const master = fs.readFileSync(path.join(root, 'docs/KEEP_MASTER_SPEC.md'), 'utf8');
const uiBaseline = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-ui-baseline.json'), 'utf8'));
const profile = fs.readFileSync(path.join(root, 'packages/mobile/src/screens/ProfilePublicScreen.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'packages/mobile/src/navigation/Navigation.tsx'), 'utf8');
const webRoot = fs.readFileSync(path.join(root, 'packages/mobile/index.js'), 'utf8');

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
must(master.includes('FREE juste après Reprises'), 'master spec FREE placement missing');
must(!master.includes('FREE immédiatement à droite du badge de type'), 'stale FREE placement still present in master spec');

must(uiBaseline.profileOwner.freePlacement === contract.profileOwner.freePlacement, 'UI baseline disagrees with product contract');
must(uiBaseline.profileOwner.freeMustNotAppearBesideProfileKind === true, 'UI baseline allows FREE beside profile type');
must(JSON.stringify(uiBaseline.profileOwner.metricsBarOrder) === JSON.stringify(contract.profileOwner.metricsBarOrder), 'UI baseline metrics order disagrees with product contract');

for (const label of ['Loki Music','Découvertes','Playlists','Soirées','Profil']) {
  must(navigation.includes(`tabBarLabel: '${label}'`), `bottom tab missing: ${label}`);
}
must(webRoot.includes('height:100dvh'), 'desktop root 100dvh protection missing');
must(!webRoot.includes("#root { position:relative; inset:auto; height:auto"), 'desktop root height:auto regression detected');

if (failures.length) {
  console.error('\nKEEP PRODUCT CONTRACT FAILED\n');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('KEEP product contract: PASS');
console.log('profile metrics: PLUS -> Abonnés -> Reprises -> FREE');
console.log('certification + FREE remain live Supabase data, never UI-reset data');
