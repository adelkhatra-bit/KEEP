const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(repo, file));
const failures = [];
const pass = (label, condition) => condition ? console.log(`PASS  ${label}`) : failures.push(label);
const contains = (file, value) => exists(file) && read(file).includes(value);

console.log('\nKEEP — PRODUCTION RESILIENCE CONTRACT');

const nativeFirst = 'packages/mobile/src/services/nativeFirstRecognitionProvider.ts';
const nativeShazam = 'packages/mobile/src/services/nativeShazamRecognition.ts';
const shazamBridge = 'packages/mobile/modules/keep-shazam/src/KeepShazamModule.ts';
const shazamSwift = 'packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift';
const musicEngine = 'packages/mobile/src/services/musicEngine.ts';
const appConfig = 'packages/mobile/app.json';
pass('iOS ShazamKit reste prioritaire', contains(nativeFirst, 'recognizeWithNativeShazam(audioSample)'));
pass('Moteur actif enveloppe réellement le provider serveur avec NativeFirst', contains(musicEngine, 'new NativeFirstRecognitionProvider(serverRecognitionProvider)'));
pass('Bridge Shazam est optionnel hors build iOS natif', contains(shazamBridge, 'requireOptionalNativeModule'));
pass('Module Swift ShazamKit génère une signature audio', contains(shazamSwift, 'import ShazamKit') && contains(shazamSwift, 'SHSignatureGenerator'));
pass('Module Swift interroge réellement le catalogue Shazam', contains(shazamSwift, 'SHSession().result(from: signature)'));
pass('Erreur ShazamKit retombe silencieusement sur les autres moteurs', contains(nativeShazam, 'return null') && contains(nativeShazam, 'NATIVE_ERROR_BACKOFF_MS'));
pass('Pas de faux entitlement ShazamKit local', !contains(appConfig, 'com.apple.developer.shazamkit'));

pass('Résolution gratuite du lien partagé avant API payante', contains(nativeFirst, 'recognizeSharedSourceKeyless()'));
pass('API serveur reste un fallback et non une dépendance unique', contains(nativeFirst, 'this.fallback.recognize(audioSample)'));
pass('Client shared-source sans clé existe', exists('packages/mobile/src/services/keylessSharedSourceRecognition.ts'));
pass('Resolver Supabase sans clé existe', exists('supabase/functions/keep-music-keyless-source/index.ts'));
pass('Resolver sans clé utilise Apple Search public', contains('supabase/functions/keep-music-keyless-source/index.ts', 'itunes.apple.com/search'));
pass('Resolver sans clé utilise Deezer public en recoupement', contains('supabase/functions/keep-music-keyless-source/index.ts', 'api.deezer.com'));
pass('Share intent global reste monté', contains('packages/mobile/index.js', 'SharedMusicHandoff'));
pass('Share intent lance la résolution sans clé', contains('packages/mobile/src/components/SharedMusicHandoff.tsx', 'resolveKeylessSocialMusic'));
pass('Share intent injecte le morceau résolu dans la session', contains('packages/mobile/src/components/SharedMusicHandoff.tsx', 'ingestExternalRecognition(recognition)'));

const recognition = 'packages/mobile/src/services/keepMusicCoreRecognition.ts';
pass('Absence AudD/ACRCloud ne casse plus la session', contains(recognition, "fallback.payload?.error === 'fallback_not_configured'") && contains(recognition, 'markFallbackUnavailable();') && contains(recognition, 'return null;'));
pass('AudD et ACRCloud restent en cascade serveur', contains(recognition, 'keep-music-recognition-v2') && contains(recognition, 'keep-music-fallback'));

const adminControl = 'supabase/functions/keep-admin-control/index.ts';
pass('Super Admin valide AudD auprès du fournisseur avant sauvegarde', contains(adminControl, 'validateAuddToken(value)') && contains(adminControl, 'invalid_audd_token'));
pass('Super Admin valide le bundle ACRCloud avant activation', contains(adminControl, 'validateAcrCloudCredentials') && contains(adminControl, 'invalid_acrcloud_credentials'));
pass('Test global des moteurs de reconnaissance existe', exists('supabase/functions/keep-recognition-admin-test/index.ts'));
pass('Écran intégrations expose le test global', contains('packages/admin/pages/integrations.tsx', 'keep-recognition-admin-test'));
pass('Passerelle Pipedream reste serveur uniquement', exists('packages/backend/src/lib/pipedreamConnect.ts') && !contains('packages/mobile/src/services/musicProviderSyncService.ts', 'PIPEDREAM_CLIENT_SECRET'));
pass('Pipedream crée un jeton court par utilisateur KEEP', contains('packages/backend/src/lib/pipedreamConnect.ts', 'externalUserId: args.profileId') && contains('packages/backend/src/lib/pipedreamConnect.ts', 'expiresIn: 600'));
pass('Super Admin valide Pipedream avant activation', contains(adminControl, 'validatePipedreamCredentials') && contains(adminControl, 'invalid_pipedream_credentials'));
pass('Connexions directes restent disponibles en secours', contains('packages/backend/src/routes/musicConnections.ts', "provider === 'spotify' || provider === 'deezer'") && contains('packages/backend/src/routes/musicConnections.ts', 'createPipedreamConnectLink'));

const mic = 'packages/mobile/src/services/micCapture.ts';
const root = 'packages/mobile/index.js';
const lifecycle = 'packages/mobile/src/components/BackgroundListeningLifecycle.tsx';
pass('Foreground Service Android microphone existe', exists('packages/mobile/modules/keep-background-listening/android/src/main/java/expo/modules/keepbackground/KeepMicrophoneForegroundService.kt'));
pass('Lifecycle Android écoute est monté globalement', contains(root, 'BackgroundListeningLifecycle'));
pass('Lifecycle Android démarre le service avec une session active', contains(lifecycle, 'ensureBackgroundListeningService()'));
pass('Capture Android démarre aussi le service avant Audio.Recording', contains(mic, 'ensureBackgroundListeningService()'));
pass('Arrêt micro coupe aussi le service Android', contains(mic, 'stopBackgroundListeningService()'));
pass('iOS mélange le son des autres apps pendant écoute', contains(mic, 'InterruptionModeIOS.MixWithOthers'));
pass('ARRÊTER libère Audio.Recording immédiatement', contains(mic, 'stopAndUnloadAsync') && contains(mic, 'cancellationVersion'));

pass('Cycle de délivrabilité e-mail stocké en base', exists('supabase/migrations/20260828214500_brevo_email_delivery_lifecycle.sql'));
pass('Webhook Brevo sécurisé présent', exists('supabase/functions/keep-brevo-webhook/index.ts') && contains('supabase/functions/keep-brevo-webhook/index.ts', 'BREVO_WEBHOOK_TOKEN'));
pass('Auto-configuration webhook Brevo présente', exists('supabase/functions/keep-email-admin/index.ts') && contains('supabase/functions/keep-email-admin/index.ts', 'ensure_webhook'));
pass('Super Admin affiche la délivrabilité Brevo', contains('packages/admin/pages/email-test.tsx', 'Délivrabilité réelle'));

const authService = 'packages/mobile/src/services/authService.ts';
const authHandoff = 'packages/mobile/src/services/authLinkHandoff.ts';
const accountForm = 'packages/mobile/src/components/UsernameAccountForm.tsx';
pass('Récupération e-mail Supabase est active', contains(authService, 'signInWithOtp') && !contains(authService, "return { error: 'email_flow_disabled' }"));
pass('Récupération e-mail ne crée jamais un nouveau compte', contains(authService, 'shouldCreateUser: false'));
pass('Lien e-mail token_hash est vérifié réellement', contains(authHandoff, 'verifyOtp') && contains(authHandoff, 'token_hash'));
pass('Lien e-mail peut revenir dans l’app native', contains(authHandoff, 'keep://auth/callback') && contains(authHandoff, 'getSession()'));
pass('Lifecycle auth e-mail est monté hors navigation', contains(root, 'AuthEmailLinkLifecycle'));
pass('Mot de passe oublié utilise le vrai flux de réinitialisation', contains(accountForm, 'requestPasswordReset(email)') && contains(authService, 'resetPasswordForEmail') && contains(authService, 'updateUser({ password })'));
pass('Réinitialisation affiche un choix de nouveau mot de passe', contains('packages/mobile/src/components/AuthEmailLinkLifecycle.tsx', 'Nouveau mot de passe KEEP') && contains('packages/mobile/src/components/AuthEmailLinkLifecycle.tsx', "event === 'PASSWORD_RECOVERY'"));

if (failures.length) {
  console.error('\nKEEP production resilience failures:');
  for (const label of failures) console.error(`FAIL  ${label}`);
  process.exit(1);
}
console.log('\nKEEP production resilience: OK');
