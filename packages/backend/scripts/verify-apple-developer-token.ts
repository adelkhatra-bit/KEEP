/**
 * Vérification exécutable réelle de la signature JWT ES256 du developer
 * token Apple Music : génère une vraie paire de clés EC P-256 (même format
 * que la clé .p8 fournie par Apple), signe un token avec le code réel de
 * lib/appleDeveloperToken.ts, puis VÉRIFIE la signature avec crypto.verify
 * et la clé publique correspondante -- preuve cryptographique réelle que le
 * format produit est valide, pas une supposition sur le format JWS.
 *
 * Usage: npx tsx packages/backend/scripts/verify-apple-developer-token.ts
 */
import crypto from 'crypto';
import {
  signAppleMusicDeveloperToken,
  getOrCreateAppleMusicDeveloperToken,
  resetAppleMusicDeveloperTokenCacheForTests,
} from '../src/lib/appleDeveloperToken';

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

function base64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const { token, expiresAt } = signAppleMusicDeveloperToken({
    teamId: 'TEAMID1234',
    keyId: 'KEYID5678',
    privateKeyPem: privateKey,
    lifetimeSec: 3600,
  });

  const [headerB64, payloadB64, sigB64] = token.split('.');
  check('le token a bien la forme header.payload.signature', [headerB64, payloadB64, sigB64].every(Boolean));

  const header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
  check('header alg=ES256 (exigé par Apple Music API)', header.alg === 'ES256');
  check('header kid = keyId fourni', header.kid === 'KEYID5678');

  const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  check('payload iss = teamId fourni', payload.iss === 'TEAMID1234');
  check('exp respecte la durée demandée (3600s)', payload.exp - payload.iat === 3600);
  check('expiresAt renvoyé cohérent avec le payload', expiresAt === payload.exp);

  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureValid = crypto.verify(
    'sha256',
    Buffer.from(signingInput),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    base64urlDecode(sigB64)
  );
  check('la signature ES256 est cryptographiquement valide (vérifiée avec la clé publique correspondante)', signatureValid);

  const wrongKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const invalidWithWrongKey = crypto.verify(
    'sha256',
    Buffer.from(signingInput),
    { key: wrongKeyPair.publicKey, dsaEncoding: 'ieee-p1363' },
    base64urlDecode(sigB64)
  );
  check("la signature échoue avec une clé publique différente (pas de faux positif)", invalidWithWrongKey === false);

  check('durée max forcée à 6 mois même si on demande plus (plafond Apple)', (() => {
    const { expiresAt: e2, token: t2 } = signAppleMusicDeveloperToken({ teamId: 'T', keyId: 'K', privateKeyPem: privateKey, lifetimeSec: 999999999 });
    const p2 = JSON.parse(base64urlDecode(t2.split('.')[1]).toString('utf8'));
    return p2.exp - p2.iat === 15777000 && e2 === p2.exp;
  })());

  resetAppleMusicDeveloperTokenCacheForTests();
  const first = getOrCreateAppleMusicDeveloperToken({ teamId: 'T', keyId: 'K', privateKeyPem: privateKey });
  const second = getOrCreateAppleMusicDeveloperToken({ teamId: 'T', keyId: 'K', privateKeyPem: privateKey });
  check('getOrCreateAppleMusicDeveloperToken() réutilise le cache tant que non expiré (pas de resignature inutile)', first.token === second.token);

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
