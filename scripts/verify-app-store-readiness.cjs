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
const android = app.android || {};
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

const sharePlugin = (app.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-share-intent');
const shareConfig = Array.isArray(sharePlugin) ? (sharePlugin[1] || {}) : {};
check('Extension de partage iOS a une cible native distincte', shareConfig.iosShareExtensionName === 'KEEPShareExtension', String(shareConfig.iosShareExtensionName || 'absente'));
check('Extension de partage accepte les URL web', Number(shareConfig.iosActivationRules?.NSExtensionActivationSupportsWebURLWithMaxCount || 0) >= 1);

const shazamSwift = 'packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift';
check('Module ShazamKit natif présent', exists(shazamSwift) && contains(shazamSwift, 'import ShazamKit'));
check('ShazamKit utilise SHSignatureGenerator', exists(shazamSwift) && contains(shazamSwift, 'SHSignatureGenerator'));
check('ShazamKit utilise SHSession', exists(shazamSwift) && contains(shazamSwift, 'SHSession'));
check('Aucun faux entitlement local ShazamKit', !read('packages/mobile/app.json').includes('com.apple.developer.shazamkit'));

const mic = 'packages/mobile/src/services/micCapture.ts';
check('Micro réellement actif en arrière-plan iOS', contains(mic, 'staysActiveInBackground: target'));
check('ARRÊTER libère Audio.Recording', contains(mic, 'stopAndUnloadAsync'));
check('ARRÊTER désactive le mode enregistrement iOS', contains(mic, 'setNativeRecordingMode(false)'));
check('Course STOP/START micro protégée', contains(mic, 'cancellationVersion'));

const androidManifest = 'packages/mobile/modules/keep-background-listening/android/src/main/AndroidManifest.xml';
const androidService = 'packages/mobile/modules/keep-background-listening/android/src/main/java/expo/modules/keepbackground/KeepMicrophoneForegroundService.kt';
const androidModule = 'packages/mobile/modules/keep-background-listening/android/src/main/java/expo/modules/keepbackground/KeepBackgroundListeningModule.kt';
const androidPermissions = Array.isArray(android.permissions) ? android.permissions : [];
check('Android RECORD_AUDIO déclaré', androidPermissions.includes('android.permission.RECORD_AUDIO'));
check('Android FOREGROUND_SERVICE déclaré', androidPermissions.includes('android.permission.FOREGROUND_SERVICE'));
check('Android FOREGROUND_SERVICE_MICROPHONE déclaré', androidPermissions.includes('android.permission.FOREGROUND_SERVICE_MICROPHONE'));
check('Manifest service microphone natif présent', exists(androidManifest) && contains(androidManifest, 'KeepMicrophoneForegroundService'));
check('Manifest service foreground type microphone', exists(androidManifest) && contains(androidManifest, 'android:foregroundServiceType="microphone"'));
check('Service Android démarre réellement en foreground', exists(androidService) && contains(androidService, 'ServiceCompat.startForeground'));
check('Service Android utilise le type MICROPHONE', exists(androidService) && contains(androidService, 'FOREGROUND_SERVICE_TYPE_MICROPHONE'));
check('Module Android exige RECORD_AUDIO avant service', exists(androidModule) && contains(androidModule, 'Manifest.permission.RECORD_AUDIO'));
check('Capture Android démarre le foreground service', contains(mic, 'ensureBackgroundListeningService()'));
check('ARRÊTER coupe le foreground service Android', contains(mic, 'stopBackgroundListeningService()'));

const settings = 'packages/mobile/src/screens/AdvancedProfileSettingsScreen.tsx';
check('Suppression de compte accessible dans l’app', contains(settings, 'Supprimer définitivement mon compte'));
check('Politique de confidentialité accessible dans l’app', contains(settings, 'Politique de confidentialité'));
check('Choix de confidentialité accessibles dans l’app', contains(settings, 'Choix de confidentialité'));
check('CGU accessibles dans l’app', contains(settings, 'Conditions d’utilisation'));
check('Support accessible dans l’app', contains(settings, 'Support KEEP'));
check('Liens légaux ouvrables via Linking', contains(settings, 'Linking.openURL'));

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
check('Image EAS production compatible Xcode 26', eas.build?.production?.ios?.image === 'sdk-54', String(eas.build?.production?.ios?.image || 'absente'));
check('Aucun faux identifiant Apple dans eas.json', !read('packages/mobile/eas.json').includes('REMPLACER_'));

const iosWorkflow = '.github/workflows/eas-build-ios.yml';
check('Workflow iOS/TestFlight présent', exists(iosWorkflow));
check('Workflow iOS gère EXPO_TOKEN', contains(iosWorkflow, 'EXPO_TOKEN'));
check('Workflow build EAS iOS', contains(iosWorkflow, 'build --platform ios') && contains(iosWorkflow, 'eas "${args[@]}"'));
check('Workflow auto-submit TestFlight protégé', contains(iosWorkflow, '--auto-submit-with-profile production') && contains(iosWorkflow, 'submit_ready'));
check('Team ID injecté hors repo', contains(iosWorkflow, 'APPLE_TEAM_ID') && contains(iosWorkflow, 'eas.submit.production.ios.appleTeamId = process.env.APPLE_TEAM_ID'));
check('ASC App ID injecté hors repo', contains(iosWorkflow, 'ASC_APP_ID') && contains(iosWorkflow, 'eas.submit.production.ios.ascAppId = process.env.ASC_APP_ID'));

check('Dossier de soumission App Store préparé', exists('docs/APP_STORE_SUBMISSION_READY.md'));
check('Préflight iOS natif sans credential présent', exists('.github/workflows/app-store-native-preflight.yml'));

external.push('GitHub Secret EXPO_TOKEN requis pour déclencher le build EAS iOS réel.');
external.push('Dans Apple Developer > Identifiers > App Services, activer ShazamKit pour com.adelkhatra.keep. ShazamKit est un App Service côté App ID, pas un entitlement local à ajouter au projet.');
external.push('APPLE_TEAM_ID et ASC_APP_ID numériques requis pour armer la soumission TestFlight automatique.');
external.push('Clé App Store Connect : ASC_API_KEY_P8_BASE64 + ASC_KEY_ID + ASC_ISSUER_ID requise pour la soumission automatisée.');
external.push('Validation physique iPhone/TestFlight requise pour microphone arrière-plan, share extension, notifications et comportement inter-apps.');
external.push('Validation physique Android requise pour confirmer le maintien microphone avec une autre app au premier plan malgré les politiques constructeur/batterie.');
external.push('Produits StoreKit / achats intégrés réels à finaliser côté Apple avant activation commerciale.');
external.push('App Privacy, Age Rating, Content Rights, DSA/trader et contact App Review doivent être validés dans App Store Connect par le compte Apple autorisé.');

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
