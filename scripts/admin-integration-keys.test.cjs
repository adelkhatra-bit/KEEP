'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/admin/lib/integrationKeys.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
const api = mod.exports;

test('décision #55 verrouillée dans le contrat canonique', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'config/keep-product-contract.json'), 'utf8')).adminIntegrationKeys;
  assert.deepEqual(contract.displayStates, ['OK', 'Refusée', 'Manquante']);
  assert.deepEqual(contract.automaticChecks, ['page-open', 'after-save']);
  assert.equal(contract.appleDeveloperTokenMaxSeconds, 43200);
  assert.equal(contract.refusalReasonMaxWords, 5);
  assert.equal(contract.p8MaxVisibleLines, 3);
  assert.equal(contract.activeRequiresProviderConfirmation, true);
  assert.equal(contract.urgentKeysRequireRuntimeConsumer, true);
  assert.equal(contract.optionalSectionCollapsed, true);
  assert.equal(contract.deezerPublicCatalogRequiresKey, false);
});

test('Key ID extrait et type de fichier Apple contrôlé', () => {
  assert.equal(api.p8KeyId('AuthKey_MWL46J72TM.p8', 'APPLE_MUSICKIT_PRIVATE_KEY'), 'MWL46J72TM');
  assert.equal(api.p8KeyId('SubscriptionKey_MWL46J72TM.p8', 'APPLE_IAP_PRIVATE_KEY'), 'MWL46J72TM');
  for (const name of ['AuthKey_MWL46J72TM.txt', 'AuthKey_MWL46J72TM.p8.exe', 'AuthKey_SHORT.p8', '../../AuthKey_MWL46J72TM.p8']) {
    assert.throws(() => api.p8KeyId(name, 'APPLE_MUSICKIT_PRIVATE_KEY'));
  }
  assert.throws(() => api.p8KeyId('SubscriptionKey_MWL46J72TM.p8', 'APPLE_MUSICKIT_PRIVATE_KEY'));
  assert.throws(() => api.p8KeyId('AuthKey_MWL46J72TM.p8', 'APPLE_IAP_PRIVATE_KEY'));
});

test('lecture locale : ES256 PKCS8 valide, pas seulement une enveloppe PEM', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const bytes = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes).toString('base64')}\n-----END PRIVATE KEY-----`;
  const file = { name: 'AuthKey_MWL46J72TM.p8', size: pem.length, text: async () => pem };
  const parsed = await api.readP8File(file, 'APPLE_MUSICKIT_PRIVATE_KEY');
  assert.equal(parsed.keyId, 'MWL46J72TM');
  assert.equal(parsed.value, pem);
  await assert.rejects(api.readP8File({ ...file, size: 20_000 }, 'APPLE_MUSICKIT_PRIVATE_KEY'));
  await assert.rejects(api.readP8File({ ...file, text: async () => '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' }, 'APPLE_MUSICKIT_PRIVATE_KEY'));
  const wrongPair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign', 'verify']);
  const wrongBytes = await webcrypto.subtle.exportKey('pkcs8', wrongPair.privateKey);
  await assert.rejects(api.readP8File({ ...file, text: async () => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(wrongBytes).toString('base64')}\n-----END PRIVATE KEY-----` }, 'APPLE_MUSICKIT_PRIVATE_KEY'));
});

test('états groupés et raisons bornées à cinq mots', () => {
  assert.equal(api.runtimeIntegrationKey('APPLE_MUSICKIT_KEY_ID'), 'APPLE_MUSICKIT');
  assert.equal(api.runtimeIntegrationKey('SPOTIFY_CLIENT_ID'), 'SPOTIFY');
  assert.equal(api.runtimeIntegrationKey('ACRCLOUD_HOST'), 'ACRCLOUD');
  assert.equal(api.runtimeIntegrationKey('BREVO_SENDER_EMAIL'), 'BREVO');
  assert.equal(api.runtimeIntegrationKey('BREVO_SMTP_KEY'), 'BREVO_SMTP_KEY');
  assert.equal(api.shortIntegrationReason('Le fournisseur refuse cette clé API invalide'), 'Le fournisseur refuse cette clé');
});

test('aucune clé optionnelle ou inutilisée dans À corriger', () => {
  for (const key of ['DEEZER_APP_ID', 'DEEZER_APP_SECRET', 'APPLE_IAP_PRIVATE_KEY', 'RESEND_API_KEY',
    'MAILJET_API_KEY', 'PADDLE_API_KEY', 'MUSICAPI_CLIENT_ID', 'STRIPE_SECRET_KEY', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON']) {
    assert.ok(!api.REQUIRED_INTEGRATION_KEYS.includes(key), key);
  }
});

test('contrat : chaque clé urgente possède un consommateur RPC hors du panneau de configuration', () => {
  const functions = path.join(root, 'supabase/functions');
  const files = fs.readdirSync(functions, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'keep-admin-control' && entry.name !== '_shared')
    .flatMap((entry) => fs.readdirSync(path.join(functions, entry.name))
      .filter((name) => name.endsWith('.ts')).map((name) => path.join(functions, entry.name, name)));
  function runtimeCode(file, visited = new Set()) {
    if (visited.has(file)) return '';
    visited.add(file);
    const code = fs.readFileSync(file, 'utf8');
    return code + [...code.matchAll(/from\s+["'](\.\.?\/[^"']+\.ts)["']/g)].map((match) => {
      const dependency = path.resolve(path.dirname(file), match[1]);
      return fs.existsSync(dependency) ? runtimeCode(dependency, visited) : '';
    }).join('\n');
  }
  const runtimeSources = files.map((file) => runtimeCode(file));
  for (const key of api.REQUIRED_INTEGRATION_KEYS) {
    assert.ok(runtimeSources.some((code) => code.includes('service_get_integration_secret') &&
      new RegExp(`(?:integrationSecret|readIntegrationSecret|getSecret|secret)\\([^\\n]*["']${key}["']`).test(code)),
    `${key} : aucun consommateur RPC réel, ne pas l’afficher dans À corriger`);
  }
});

test('éditeur unique : import local, alerte mismatch, contrôles ouverture/sauvegarde et trois états', () => {
  const page = fs.readFileSync(path.join(root, 'packages/admin/pages/integrations.tsx'), 'utf8');
  assert.match(page, /action: 'integrations\.test'/);
  assert.match(page, /await load\(true\)/);
  assert.match(page, /onDrop=/);
  assert.match(page, /type="file" accept="\.p8"/);
  assert.match(page, /KEY_ID différent du fichier \.p8/);
  assert.match(page, /rows=\{3\}/);
  assert.match(page, /<details className="card"/);
  assert.doesNotMatch(page, /À tester|rows=\{6\}|resize: 'vertical'/);
});
