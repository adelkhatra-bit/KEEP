const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { generateKeyPairSync, webcrypto } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
globalThis.crypto ||= webcrypto;

function compile(file, imports) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = new Module(file);
  module.require = (name) => {
    if (name in imports) return imports[name];
    throw new Error(`Import inattendu : ${name}`);
  };
  module._compile(compiled, file);
  return module.exports;
}

function setup({ rows = [], saved = {}, role = 'SUPER_ADMIN', failKeyId = false } = {}) {
  const writes = [];
  let handler;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-admin' } } }) },
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        maybeSingle: async () => ({ data: { role, is_active: true } }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        then(resolve) { return Promise.resolve({ data: table === 'integration_secrets' ? rows : [], error: null }).then(resolve); },
      };
      return query;
    },
    rpc(name, args) {
      if (name === 'service_set_integration_secret' || name === 'service_set_apple_integration_secret') {
        writes.push(args);
        return Promise.resolve({ error: failKeyId && name === 'service_set_apple_integration_secret' ? new Error('fixture') : null });
      }
      const request = Promise.resolve({ data: saved[args.p_key] ?? null, error: null });
      request.abortSignal = () => request;
      return request;
    },
  };
  const previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: () => '' }, serve: (fn) => { handler = fn; } };
  const p8 = compile(path.join(root, 'supabase/functions/_shared/appleP8.ts'), {});
  compile(path.join(root, 'supabase/functions/keep-admin-control/index.ts'), {
    'jsr:@supabase/functions-js/edge-runtime.d.ts': {},
    'npm:@supabase/supabase-js@2': { createClient: () => client },
    '../_shared/lokiEmailShell.ts': {},
    '../_shared/integrationChecks.ts': { checkIntegrations: async () => [{ key: 'YOUTUBE_API_KEY', status: 'ERROR', message: 'Fournisseur HTTP 403' }] },
    '../_shared/appleMusicToken.ts': { getAppleMusicToken: async () => ({ token: 'fixture' }) },
    '../_shared/spotifyCatalog.ts': { getSpotifyCatalogToken: async () => ({ token: 'fixture' }) },
    '../_shared/appleP8.ts': p8,
  });
  globalThis.Deno = previousDeno;
  return {
    writes,
    async invoke(body) {
      globalThis.Deno = { env: { get: () => '' } };
      try {
        const response = await handler(new Request('https://example.test/admin', {
          method: 'POST',
          headers: { Authorization: ['Bearer', 'fixture'].join(' '), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }));
        return { status: response.status, body: await response.json() };
      } finally {
        globalThis.Deno = previousDeno;
      }
    },
  };
}

const privateKey = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .privateKey.export({ format: 'pem', type: 'pkcs8' });

test('le fichier .p8 enregistre aussi son identifiant, sans indice privé', async () => {
  const app = setup();
  const pem = privateKey();
  const result = await app.invoke({
    action: 'integrations.set', key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: pem,
    fileName: 'AuthKey_MWL46J72TM.p8', keyId: 'MWL46J72TM',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.hint, 'Clé MWL46J72TM');
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].p_key, 'APPLE_MUSICKIT_PRIVATE_KEY');
  assert.equal(app.writes[0].p_key_id, 'MWL46J72TM');
  assert.ok(!JSON.stringify(result.body).includes(pem.trim()));
  assert.ok(!JSON.stringify(result.body).includes(pem.split('\n')[1]));
});

test('un type Apple incorrect ou un KEY_ID différent ne modifie pas le Vault', async () => {
  for (const params of [
    { fileName: 'SubscriptionKey_MWL46J72TM.p8', keyId: 'MWL46J72TM' },
    { fileName: 'AuthKey_MWL46J72TM.txt', keyId: 'MWL46J72TM' },
    { fileName: 'AuthKey_MWL46J72TM.p8', keyId: 'ABCDEFGHIJ' },
  ]) {
    const app = setup();
    const result = await app.invoke({ action: 'integrations.set', key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: privateKey(), ...params });
    assert.equal(result.status, 400);
    assert.equal(app.writes.length, 0);
  }
});

test('un changement ultérieur de KEY_ID conserve une alerte du fichier enregistré', async () => {
  for (const savedId of ['ABCDEFGHIJ', null]) {
    const app = setup({
      rows: [{ key: 'APPLE_MUSICKIT_PRIVATE_KEY', is_configured: true, value_hint: 'Clé MWL46J72TM' }],
      saved: { APPLE_MUSICKIT_KEY_ID: savedId },
    });
    const result = await app.invoke({ action: 'integrations.list' });
    const row = result.body.data.find((row) => row.key === 'APPLE_MUSICKIT_PRIVATE_KEY');
    assert.equal(row.hint, 'Clé MWL46J72TM');
    assert.equal(row.configurationIssue, 'KEY_ID différent du fichier .p8');
  }
});

test('les vérifications sont réservées aux administrateurs autorisés', async () => {
  const result = await setup({ role: 'SUPPORT' }).invoke({ action: 'integrations.test' });
  assert.equal(result.status, 403);
});

test('le résultat fournisseur est renvoyé sans les valeurs des clés', async () => {
  const result = await setup().invoke({ action: 'integrations.test' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].status, 'ERROR');
  assert.ok(!JSON.stringify(result.body).includes('fixture'));
});

test('un échec de sauvegarde KEY_ID ne renvoie pas de faux succès', async () => {
  const result = await setup({ failKeyId: true }).invoke({
    action: 'integrations.set', key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: privateKey(),
    fileName: 'AuthKey_MWL46J72TM.p8', keyId: 'MWL46J72TM',
  });
  assert.notEqual(result.status, 200);
  assert.ok(!result.body.ok);
});

test('la rotation Apple est transactionnelle, sérialisée et réservée au service', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261008033000_atomic_apple_integration_secrets.sql'), 'utf8');
  assert.ok(migration.includes('pg_advisory_xact_lock'));
  assert.ok(migration.includes("pg_catalog.hashtextextended('keep-apple-integration|' || p_key"));
  assert.equal((migration.match(/perform public\.service_set_integration_secret\(/g) || []).length, 2);
  assert.ok(migration.includes('from public, anon, authenticated'));
  assert.ok(migration.includes('to service_role'));
});

test('la traduction exige authentification, paramètres bornés et quota serveur', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { translations: [{ translatedText: 'Hello' }] } });
  };
  try {
    for (const scenario of [
      { user: null, allowed: true, target: 'en', status: 401 },
      { user: { id: 'fixture' }, allowed: true, target: 'https://example.test', status: 400 },
      { user: { id: 'fixture' }, allowed: false, target: 'en', status: 429 },
      { user: { id: 'fixture' }, allowed: true, target: 'en', status: 200 },
    ]) {
      let handler;
      globalThis.Deno = { env: { get: () => '' }, serve: (fn) => { handler = fn; } };
      compile(path.join(root, 'supabase/functions/keep-ui-translate/index.ts'), {
        'jsr:@supabase/functions-js/edge-runtime.d.ts': {},
        'npm:@supabase/supabase-js@2': {
          createClient: () => ({
            auth: { getUser: async () => ({ data: { user: scenario.user }, error: null }) },
            rpc(name) {
              const result = Promise.resolve({
                data: name === 'service_allow_recognition' ? scenario.allowed : 'fixture-secret',
                error: null,
              });
              result.abortSignal = () => result;
              return result;
            },
          }),
        },
      });
      const response = await handler(new Request('https://example.test/translate', {
        method: 'POST',
        headers: { Authorization: ['Bearer', 'fixture'].join(' '), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Bonjour', target: scenario.target }),
      }));
      assert.equal(response.status, scenario.status);
      const body = await response.json();
      assert.ok(!JSON.stringify(body).includes('fixture-secret'));
      if (scenario.status === 200) assert.equal(body.translatedText, 'Hello');
    }
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});
