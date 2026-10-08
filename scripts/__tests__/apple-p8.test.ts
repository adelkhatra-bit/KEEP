import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { p8KeyId, validateAppleP8 } from '../../supabase/functions/_shared/appleP8.ts';

function privatePem(type: 'ec' | 'rsa' = 'ec', curve = 'prime256v1', encoding: 'pkcs8' | 'sec1' = 'pkcs8'): string {
  const key = type === 'rsa'
    ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    : generateKeyPairSync('ec', { namedCurve: curve }).privateKey;
  return key.export({ type: encoding, format: 'pem' }) as string;
}

test('extrait la Clé ID du fichier MusicKit', () => {
  assert.equal(p8KeyId('AuthKey_MWL46J72TM.p8', 'APPLE_MUSICKIT_PRIVATE_KEY'), 'MWL46J72TM');
});

test('extrait la Clé ID de la clé achat intégré', () => {
  assert.equal(p8KeyId('SubscriptionKey_MWL46J72TM.p8', 'APPLE_IAP_PRIVATE_KEY'), 'MWL46J72TM');
});

test('refuse extensions, noms malformés et identifiants courts', () => {
  for (const name of ['AuthKey_MWL46J72TM.txt', 'AuthKey_MWL46J72TM.p8.txt', 'AuthKey_SHORT.p8', 'key.p8']) {
    assert.throws(() => p8KeyId(name, 'APPLE_MUSICKIT_PRIVATE_KEY'));
  }
});

test('ne confond pas les usages Apple', () => {
  assert.throws(() => p8KeyId('SubscriptionKey_MWL46J72TM.p8', 'APPLE_MUSICKIT_PRIVATE_KEY'), /pas MusicKit/);
  assert.throws(() => p8KeyId('AuthKey_MWL46J72TM.p8', 'APPLE_IAP_PRIVATE_KEY'), /achat intégré/);
  assert.throws(() => p8KeyId('AuthKey_MWL46J72TM.p8', 'SPOTIFY_CLIENT_SECRET'), /inconnue/);
});

test('accepte seulement une vraie clé privée PKCS8 EC P256', async () => {
  const pem = privatePem();
  assert.equal(await validateAppleP8(` \n${pem}\n `), pem.trim());
});

test('refuse PEM invalide, clé RSA, P384 et SEC1', async () => {
  for (const pem of [
    '-----BEGIN PRIVATE ' + 'KEY-----\nAAAA\n-----END PRIVATE ' + 'KEY-----',
    privatePem('rsa'),
    privatePem('ec', 'secp384r1'),
    privatePem('ec', 'prime256v1', 'sec1'),
    'contenu non PEM',
  ]) await assert.rejects(() => validateAppleP8(pem));
});
