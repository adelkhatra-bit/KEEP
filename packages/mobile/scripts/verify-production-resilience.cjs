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
pass('iOS ShazamKit reste prioritaire', contains(nativeFirst, 'recognizeWithNativeShazam(audioSample)'));
pass('Résolution gratuite du lien partagé avant API payante', contains(nativeFirst, 'recognizeSharedSourceKeyless()'));
pass('API serveur reste un fallback et non une dépendance unique', contains(nativeFirst, 'this.fallback.recognize(audioSample)'));
pass('Client shared-source sans clé existe', exists('packages/mobile/src/services/keylessSharedSourceRecognition.ts'));
pass('Resolver Supabase sans clé existe', exists('supabase/functions/keep-music-keyless-source/index.ts'));
pass('Resolver sans clé utilise Apple Search public', contains('supabase/functions/keep-music-keyless-source/index.ts', 'itunes.apple.com/search'));
pass('Resolver sans clé utilise Deezer public en recoupement', contains('supabase/functions/keep-music-keyless-source/index.ts', 'api.deezer.com'));
pass('Share intent global reste monté', contains('packages/mobile/index.js', 'SharedMusicHandoff'));
pass('Share intent lance la résolution sans clé', contains('packages/mobile/src/components/SharedMusicHandoff.tsx', 'recognizeSharedMusicSource'));

const recognition = 'packages/mobile/src/services/keepMusicCoreRecognition.ts';
pass('Absence AudD/ACRCloud ne casse plus la session', contains(recognition, 'recognition_not_configured') && contains(recognition, 'return null'));
pass('AudD et ACRCloud restent en cascade serveur', contains(recognition, 'keep-music-recognition-v2') && contains(recognition, 'keep-music-fallback'));

pass('Foreground Service Android microphone existe', exists('packages/mobile/modules/keep-background-listening/android/src/main/java/expo/modules/keepbackground/KeepMicrophoneForegroundService.kt'));
pass('Arrêt micro coupe aussi le service Android', contains('packages/mobile/src/services/micCapture.ts', 'stopBackgroundListeningService()'));

pass('Cycle de délivrabilité e-mail stocké en base', exists('supabase/migrations/20260828214500_brevo_email_delivery_lifecycle.sql'));
pass('Webhook Brevo sécurisé présent', exists('supabase/functions/keep-brevo-webhook/index.ts') && contains('supabase/functions/keep-brevo-webhook/index.ts', 'BREVO_WEBHOOK_TOKEN'));
pass('Auto-configuration webhook Brevo présente', exists('supabase/functions/keep-email-admin/index.ts') && contains('supabase/functions/keep-email-admin/index.ts', 'ensure_webhook'));
pass('Super Admin affiche la délivrabilité Brevo', contains('packages/admin/pages/email-test.tsx', 'Délivrabilité réelle'));

if (failures.length) {
  console.error('\nKEEP production resilience failures:');
  for (const label of failures) console.error(`FAIL  ${label}`);
  process.exit(1);
}
console.log('\nKEEP production resilience: OK');
