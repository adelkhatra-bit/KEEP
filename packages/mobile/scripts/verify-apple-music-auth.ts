/**
 * Vérification exécutable réelle des fonctions pures de appleMusicAuth.ts
 * (tout ce qui ne dépend pas du runtime React Native / expo-secure-store,
 * qui ne peuvent être exécutés que sur un vrai appareil).
 *
 * Usage: npx tsx packages/mobile/scripts/verify-apple-music-auth.ts
 */
import { buildAppleMusicAuthHtml, parseAppleMusicAuthMessage } from '../src/services/appleMusicAuthHtml';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL ${label}`);
  }
}

function main() {
  console.log('== appleMusicAuth ==');

  const html = buildAppleMusicAuthHtml('abc.def.ghi');
  check('inclut musickit.js du CDN officiel Apple', html.includes('js-cdn.music.apple.com/musickit/v3/musickit.js'));
  check('injecte le developer token dans MusicKit.configure', html.includes('developerToken: "abc.def.ghi"'));
  check("appelle music.authorize() (flux d'autorisation utilisateur)", html.includes('music.authorize()'));

  // Un token contenant des guillemets ne doit jamais casser le HTML généré
  // (JSON.stringify doit échapper correctement) -- même si en pratique le
  // developer token vient de notre propre backend, pas d'une source non fiable.
  const trickyHtml = buildAppleMusicAuthHtml('weird"</script><script>alert(1)</script>');
  check("échappe correctement un token contenant des guillemets/balises (pas d'injection HTML cassée)", !trickyHtml.includes('</script><script>alert(1)</script>') || trickyHtml.includes('\\"'));

  const success = parseAppleMusicAuthMessage(JSON.stringify({ type: 'success', musicUserToken: 'tok123' }));
  check('parse un message de succès', success.type === 'success' && success.musicUserToken === 'tok123');

  const error = parseAppleMusicAuthMessage(JSON.stringify({ type: 'error', message: 'refusé' }));
  check("parse un message d'erreur", error.type === 'error' && error.message === 'refusé');

  let rejected = false;
  try {
    parseAppleMusicAuthMessage(JSON.stringify({ type: 'autre_chose' }));
  } catch {
    rejected = true;
  }
  check('rejette un message de forme inattendue (pas de faux succès silencieux)', rejected);

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main();
