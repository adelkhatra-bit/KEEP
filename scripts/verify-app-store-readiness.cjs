const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(root, p));

const failures = [];
const passes = [];
const external = [];

function check(label, condition, detail = '') {
  if (condition) passes.push(label);
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}
function contains(file, needle) {
  return read(file).includes(needle);
}

const app = json('packages/mobile/app.json').expo;
const ios = app.ios || {};
const plist = ios.infoPlist || {};

check('Bundle ID KEEP figé', ios.bundleIdentifier === 'com.adelkhatra.keep', String(ios.bundleIdentifier || 'absent'));
check('iPhone uniquement au lancement', ios.supportsTablet === false, 'ios.supportsTablet doit être false');
check('Permission microphone expliquée', typeof plist.NSMicrophoneUsageDescription === 'string' && plist.NSMicrophoneUsageDescription.length >= 40);
check('Permission localisation expliquée', typeof plist.NSLocationWhenInUseUsageDescription === 'string' && plist.NSLocationWhenInUseUsageDescription.length >= 40);
check('Pas de permission réseau local inutile', !('NSLocalNetworkUsageDescription' in plist));
check('Déclaration chiffrement App Store', plist.ITSAppUsesNonExemptEncryption === false);
check('Mode audio arrière-plan déclaré', Array.isArray(plist.UIBackgroundModes) && plist.UIBackgroundModes.includes('audio'));
check('Icône App Store configurée', app.icon === './assets/icon.png' && exists('packages/mobile/assets/icon.png'));
check('Splash configuré', app.splash && app.splash.image === './assets/splash.png' && exists('packages/mobile/assets/splash.png'));
check('Identifiant projet EAS présent', Boolean(app.extra?.eas?.projectId));
check('Runtime version stable', app.runtimeVersion?.policy === 'appVersion');

const mic = 'packages/mobile/src/services/micCapture.ts';
check('Micro réellement actif en arrière-plan iOS', contains(mic, 'staysActiveInBackground: target'));
check('ARRÊTER libère Audio.Recording', contains(mic, 'stopAndUnloadAsync'));
check('ARRÊTER désactive le mode enregistrement iOS', contains(mic, 'setNativeRecordingMode(false)'));
check('Course STOP/START micro protégée', contains(mic, 'cancellationVersion'));

const settings = 'packages/mobile/src/screens/AdvancedProfileSettingsScreen.tsx';
check('Suppression de compte accessible dans l’app', contains(settings, 'Supprimer définitivement mon compte'));
check('Politique de confidentialité accessible dans l’app', contains(settings, 'Politique de confidentialité'));
check('Choix de confidentialité accessibles dans l’app', contains(settings, 'Choix de confidentialité'));
check('CGU accessibles dans l’app', contains(settings, 'Conditions d’utilisation'));
check('Support accessible dans l’app', contains(settings, 'Support KEEP'));

for (const [file, marker, label] of [
  ['packages/mobile/legal/privacy.html', 'Politique de confidentialité KEEP', 'Politique de confidentialité publique'],
  ['packages/mobile/legal/privacy-choices.html', 'Choix de confidentialité', 'Page choix de confidentialité'],
  ['packages/mobile/legal/terms.html', 'Conditions d’utilisation KEEP', 'Conditions d’utilisation publiques'],
  ['packages/mobile/legal/support.html', 'Support KEEP', 'Page support publique'],
]) {
  check(label, exists(file) && contains(file, marker));
}
check('Politique décrit la suppression du compte', contains('packages/mobile/legal/privacy.html', 'Supprimer définitivement mon compte'));
check('Politique décrit microphone et localisation', contains('packages/mobile/legal/privacy.html', 'Microphone') && contains('packages/mobile/legal/privacy.html', 'Localisation'));
check('Politique déclare absence de vente/suivi publicitaire', contains('packages/mobile/legal/privacy.html', 'ne vend pas') && contains('packages/mobile/legal/privacy.html', 'suivi publicitaire'));

const pages = '.github/workflows/web-preview-pages.yml';
check('Pages publie /privacy/', contains(pages, '_site/privacy/index.html') && contains(pages, '$base/privacy/'));
check('Pages publie /privacy-choices/', contains(pages, '_site/privacy-choices/index.html'));
check('Pages publie /terms/', contains(pages, '_site/terms/index.html'));
check('Pages publie /support/', contains(pages, '_site/support/index.html') && contains(pages, '$base/support/'));

const eas = json('packages/mobile/eas.json');
check('Profil EAS production existe', Boolean(eas.build?.production));
check('Build number auto-incrémenté', eas.build?.production?.autoIncrement === true);
check('Canal EAS production', eas.build?.production?.channel === 'production');
check('Build production non simulateur', eas.build?.production?.ios?.simulator !== true);

const iosWorkflow = '.github/workflows/eas-build-ios.yml';
check('Workflow iOS/TestFlight présent', exists(iosWorkflow));
check('Workflow iOS exige EXPO_TOKEN', contains(iosWorkflow, 'EXPO_TOKEN'));
check('Workflow utilise EAS production', contains(iosWorkflow, 'eas build --platform ios'));

const submit = eas.submit?.production?.ios || {};
if (!submit.appleTeamId || String(submit.appleTeamId).startsWith('REMPLACER_')) {
  external.push('APPLE_TEAM_ID / appleTeamId à fournir après inscription Apple Developer.');
}
if (!submit.ascAppId || String(submit.ascAppId).startsWith('REMPLACER_')) {
  external.push('ASC_APP_ID / ascAppId numérique à fournir après création de la fiche App Store Connect.');
}
external.push('GitHub Secret EXPO_TOKEN requis pour déclencher le build EAS iOS réel.');
external.push('Clé App Store Connect (ASC_KEY_ID + ASC_ISSUER_ID + clé .p8) requise pour soumission automatisée si elle n’est pas déjà gérée par EAS.');
external.push('Validation physique iPhone/TestFlight requise pour microphone arrière-plan, share extension, notifications et comportement inter-apps.');
external.push('Produits StoreKit / achats intégrés réels à finaliser côté Apple avant activation commerciale.');

console.log('\nKEEP — APP STORE READINESS CONTRACT');
for (const item of passes) console.log(`PASS  ${item}`);
if (failures.length) {
  console.error('\nCODE-CONTROLLED FAILURES');
  for (const item of failures) console.error(`FAIL  ${item}`);
}
console.log('\nEXTERNAL BLOCKERS (non bloquants pour ce contrat)');
for (const item of external) console.log(`WAIT  ${item}`);
console.log(`\nCode-controlled checks: ${passes.length}/${passes.length + failures.length} passed.`);
if (failures.length) process.exit(1);
