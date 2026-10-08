'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'supabase/functions/keep-admin-control/index.ts');
const source = fs.readFileSync(file, 'utf8');

// Adaptateur JOSE du banc Node : clés et signatures réelles, aucune dépendance ajoutée.
const joseForTests = {
  importPKCS8: (pem, algorithm) => {
    assert.equal(algorithm, 'ES256');
    const bytes = Buffer.from(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''), 'base64');
    return webcrypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  },
  SignJWT: class {
    constructor(payload) { this.payload = { ...payload }; }
    setProtectedHeader(header) { this.header = header; return this; }
    setIssuer(issuer) { this.payload.iss = issuer; return this; }
    setIssuedAt(timestamp) { this.payload.iat = timestamp; return this; }
    setExpirationTime(timestamp) { this.payload.exp = timestamp; return this; }
    async sign(key) {
      const input = [this.header, this.payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
      const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
      return `${input}.${Buffer.from(signature).toString('base64url')}`;
    }
  },
};

function harness({ saved = {}, hints = {}, env = {}, role = 'TECH', authenticated = true, active = true, fetcher, rpcError = false } = {}) {
  const calls = [], writes = [], network = [];
  let handler, emails = 0, running = 0, peak = 0;
  const values = { ...saved };
  const storedHints = { ...hints };
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'admin-fixture' } : null } }) },
    rpc(name, args) {
      calls.push({ name, args });
      const run = async () => {
        if (rpcError) return { error: new Error('private-server-fixture'), data: null };
        if (name === 'service_get_integration_secret') return { data: values[args.p_key] ?? null, error: null };
        if (name === 'service_set_integration_secret') {
          values[args.p_key] = args.p_value;
          storedHints[args.p_key] = args.p_hint;
        }
        writes.push({ name, args });
        return { data: null, error: null };
      };
      return { then: (resolve, reject) => run().then(resolve, reject), abortSignal: () => ({ then: (resolve, reject) => run().then(resolve, reject) }) };
    },
    from(table) {
      const rows = table === 'integration_secrets' ? Object.keys(values).map(key => ({ key, is_configured: true, value_hint: storedHints[key] ?? 'ancien indice' })) : [];
      const query = {
        select: () => query, eq: () => query, order: () => query, abortSignal: () => query,
        maybeSingle: async () => ({ data: active ? { role, id: 'admin-fixture' } : null }),
        then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
        upsert: async value => { writes.push({ table, value }); return { error: null }; },
        insert: async value => { writes.push({ table, value }); return { error: null }; },
      };
      return query;
    },
  };
  const context = vm.createContext({
    console, Request, Response, Headers, FormData, Blob, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView,
    atob, btoa, crypto: webcrypto, AbortSignal, setTimeout, clearTimeout,
    Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback; } },
    fetch: async (url, options = {}) => {
      network.push({ url: String(url), options });
      running++; peak = Math.max(peak, running);
      try {
        if (!fetcher) throw new Error('network-not-mocked');
        return await fetcher(String(url), options);
      } finally { running--; }
    },
  });
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const mod = { exports: {} };
    cache.set(filename, mod.exports);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const requireMock = name => {
      if (name.startsWith('jsr:')) return {};
      if (name.startsWith('npm:@supabase/')) return { createClient: () => client };
      if (name.startsWith('npm:bcrypt')) return {};
      if (name === 'npm:jose@5.9.6') return joseForTests;
      if (name.includes('lokiEmailShell')) return { lokiEmailShell: () => '', lokiEmailCtaShell: () => '' };
      if (name.includes('lokiEmailSend')) return { sendTransactionalEmail: async () => { emails++; throw new Error('email-forbidden'); } };
      return load(path.resolve(path.dirname(filename), name));
    };
    vm.runInContext(`(function(exports,require,module){${compiled.outputText}\n})`, context, { filename })(mod.exports, requireMock, mod);
    cache.set(filename, mod.exports);
    return mod.exports;
  }
  load(file);
  return {
    calls, writes, network, values, get emails() { return emails; }, get peak() { return peak; },
    async request(action, body = {}) {
      const response = await handler(new Request('https://fixture.invalid/control', {
        method: 'POST', headers: { authorization: '******', 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function applePem() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
}

test('ouverture protégée par identité admin active et rôle identique à list', async () => {
  for (const options of [{ authenticated: false }, { active: false }, { role: 'FINANCE' }]) {
    const h = harness(options);
    assert.ok([401, 403].includes((await h.request('integrations.test')).status));
    assert.equal(h.calls.length, 0); assert.equal(h.network.length, 0);
  }
});

test('ouverture lecture seule : RPC prioritaire, repli env, groupes dédupliqués et concurrence bornée', async () => {
  const pem = await applePem();
  const h = harness({
    saved: {
      APPLE_MUSICKIT_TEAM_ID: 'TEAM123456', APPLE_MUSICKIT_KEY_ID: 'KEY1234567', APPLE_MUSICKIT_PRIVATE_KEY: pem,
      SPOTIFY_CLIENT_ID: 'spotify-id-fixture', SPOTIFY_CLIENT_SECRET: 'saved-spotify-fixture',
      PIPEDREAM_CLIENT_ID: 'pipe-id', PIPEDREAM_CLIENT_SECRET: 'pipe-secret', PIPEDREAM_PROJECT_ID: 'proj_fixture',
      ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com', ACRCLOUD_ACCESS_KEY: 'acr-fixture-key', ACRCLOUD_ACCESS_SECRET: 'acr-fixture-secret',
      BREVO_API_KEY: 'saved-brevo-fixture', BREVO_SENDER_EMAIL: 'sender@example.org', BREVO_SENDER_NAME: 'Loki Music', GOOGLE_TRANSLATE_API_KEY: 'translation-fixture',
    },
    env: { SPOTIFY_CLIENT_SECRET: 'wrong-env-fixture', YOUTUBE_API_KEY: 'youtube-env-fixture' },
    fetcher: async (url, options) => {
      const hostname = new URL(url).hostname;
      assert.ok(options.signal, 'chaque appel fournisseur est borné');
      await new Promise(resolve => setTimeout(resolve, 5));
      if (hostname === 'api.music.apple.com') {
        assert.match(url, /\/v1\/catalog\/fr\/search/); assert.match(url, /types=songs/);
        const jwt = options.headers.Authorization.slice('Bearer '.length).split('.');
        assert.deepEqual(JSON.parse(Buffer.from(jwt[0], 'base64url')), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
        assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).iss, 'TEAM123456');
        assert.equal(Buffer.from(jwt[2], 'base64url').length, 64);
        return reply({ results: { songs: { data: [{ id: 'fixture-song', attributes: { name: 'Get Lucky', artistName: 'Daft Punk' } }] } } });
      }
      if (hostname === 'accounts.spotify.com') {
        assert.equal(options.headers.Authorization, `Basic ${btoa('spotify-id-fixture:saved-spotify-fixture')}`);
        return reply({ access_token: 'token-fixture', token_type: 'Bearer', expires_in: 3600 });
      }
      if (hostname === 'api.spotify.com') return reply({ tracks: { items: [{ id: 'spotify-song', name: 'Get Lucky', artists: [{ name: 'Daft Punk' }] }] } });
      if (hostname === 'api.pipedream.com') return reply({ access_token: 'pipe-token-fixture' });
      if (hostname === 'identify-eu-west-1.acrcloud.com') return reply({ status: { code: 1001 } });
      if (hostname === 'api.brevo.com') {
        assert.equal(options.headers['api-key'], 'saved-brevo-fixture');
        return reply(new URL(url).pathname === '/v3/senders' ? { senders: [{ email: 'sender@example.org', active: true }] } : {});
      }
      if (hostname === 'www.googleapis.com' && new URL(url).pathname === '/youtube/v3/videos') { assert.match(url, /youtube-env-fixture/); return reply({ items: [{ id: 'fixture' }] }); }
      if (hostname === 'translation.googleapis.com') {
        assert.equal(options.headers['X-Goog-Api-Key'], 'translation-fixture');
        assert.equal(JSON.parse(options.body).q, 'Bonjour');
        return reply({ data: { translations: [{ translatedText: 'Hello' }] } });
      }
      throw new Error('unexpected-provider');
    },
  });
  const { status, body } = await h.request('integrations.test');
  assert.equal(status, 200);
  for (const key of ['APPLE_MUSICKIT', 'SPOTIFY', 'PIPEDREAM_CONNECT', 'ACRCLOUD', 'BREVO_API_KEY', 'YOUTUBE_API_KEY', 'GOOGLE_TRANSLATE_API_KEY']) {
    const rows = body.data.filter(row => row.key === key);
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'ACTIVE', `${key}: ${rows[0].last_error}`);
    assert.equal(rows[0].last_error, null); assert.ok(Date.parse(rows[0].last_checked_at));
  }
  assert.equal(h.network.filter(call => new URL(call.url).hostname === 'api.music.apple.com').length, 1);
  assert.equal(h.network.filter(call => new URL(call.url).hostname === 'accounts.spotify.com').length, 1);
  assert.ok(h.peak <= 3); assert.ok(h.peak > 1);
  assert.equal(h.writes.length, 0); assert.equal(h.emails, 0);
  assert.ok(h.calls.every(call => call.name === 'service_get_integration_secret'));
  assert.equal(new Set(h.calls.map(call => call.args.p_key)).size, h.calls.length, 'lecture des membres partagée par groupe');
  assert.equal(body.data.find(row => row.key === 'PIPEDREAM_ENVIRONMENT').status, 'NOT_CONFIGURED');
  for (const secret of [pem, 'saved-spotify-fixture', 'translation-fixture', 'token-fixture']) assert.ok(!JSON.stringify(body).includes(secret));
});

test('groupe incomplet : clé absente NOT_CONFIGURED, diagnostic missing, aucun appel fournisseur', async () => {
  const h = harness({ saved: {
    APPLE_MUSICKIT_TEAM_ID: 'TEAM123456', SPOTIFY_CLIENT_ID: 'spotify-fixture',
    PIPEDREAM_CLIENT_ID: 'pipe-fixture', ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com',
    APPLE_IAP_KEY_ID: 'KEY1234567',
  } });
  const rows = (await h.request('integrations.test')).body.data;
  for (const [group, missing] of [
    ['APPLE_MUSICKIT', 'APPLE_MUSICKIT_PRIVATE_KEY'], ['SPOTIFY', 'SPOTIFY_CLIENT_SECRET'],
    ['PIPEDREAM_CONNECT', 'PIPEDREAM_CLIENT_SECRET'], ['ACRCLOUD', 'ACRCLOUD_ACCESS_SECRET'],
    ['APPLE_IAP', 'APPLE_IAP_PRIVATE_KEY'],
  ]) {
    const grouped = rows.find(row => row.key === group);
    const member = rows.find(row => row.key === missing);
    assert.equal(grouped.status, 'NOT_CONFIGURED'); assert.ok(grouped.last_error.includes(missing));
    assert.equal(member.status, 'NOT_CONFIGURED'); assert.ok(member.last_error.includes('non renseigné'));
  }
  assert.equal(h.network.length, 0); assert.equal(h.writes.length, 0);
  assert.equal(new Set(h.calls.map(call => call.args.p_key)).size, h.calls.length);
});

test('Apple JWT valide ne suffit pas : refus catalogue 401 et résultats absents ne sont pas ACTIVE', async () => {
  for (const response of [reply({ error: 'private-fixture' }, 401), reply({}), reply({ results: { songs: { data: [] } } })]) {
    const h = harness({ saved: {
      APPLE_MUSICKIT_TEAM_ID: 'TEAM123456', APPLE_MUSICKIT_KEY_ID: 'KEY1234567', APPLE_MUSICKIT_PRIVATE_KEY: await applePem(),
    }, fetcher: async () => response });
    const result = (await h.request('integrations.test')).body.data.find(row => row.key === 'APPLE_MUSICKIT');
    assert.notEqual(result.status, 'ACTIVE');
    assert.ok(!result.last_error.includes('private-fixture'));
  }
});

test('Spotify token accepté sans recherche utilisable ne donne pas ACTIVE', async () => {
  for (const response of [reply({}, 403), reply({}), reply({ tracks: { items: [] } })]) {
    const h = harness({ saved: { SPOTIFY_CLIENT_ID: 'fixture-id', SPOTIFY_CLIENT_SECRET: 'fixture-secret' },
      fetcher: async url => new URL(url).hostname === 'accounts.spotify.com' ? reply({ access_token: 'fixture-token', token_type: 'Bearer', expires_in: 3600 }) : response });
    const result = (await h.request('integrations.test')).body.data.find(row => row.key === 'SPOTIFY');
    assert.equal(result.status, 'ERROR'); assert.equal(h.network.length, 2);
  }
});

test('.p8 : noms spécifiques, PKCS8 P256, extraction Clé ID et IAP reste optionnel', async () => {
  const pem = await applePem();
  const h = harness();
  for (const [key, fileName, value] of [
    ['APPLE_MUSICKIT_PRIVATE_KEY', 'SubscriptionKey_KEY1234567.p8', pem],
    ['APPLE_IAP_PRIVATE_KEY', 'AuthKey_KEY1234567.p8', pem],
    ['APPLE_IAP_PRIVATE_KEY', '../SubscriptionKey_KEY1234567.p8', pem],
    ['APPLE_IAP_PRIVATE_KEY', 'SubscriptionKey_KEY1234567.txt', pem],
    ['APPLE_IAP_PRIVATE_KEY', 'SubscriptionKey_KEY1234567.p8', '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----'],
  ]) assert.equal((await h.request('integrations.set', { key, fileName, value })).status, 400);
  assert.equal(h.writes.length, 0);
  const saved = await h.request('integrations.set', { key: 'APPLE_IAP_PRIVATE_KEY', value: pem, fileName: 'SubscriptionKey_KEY1234567.p8' });
  assert.equal(saved.status, 200); assert.equal(saved.body.validation.status, 'UNKNOWN');
  assert.equal(h.values.APPLE_IAP_KEY_ID, 'KEY1234567');
  assert.equal(saved.body.hint, 'Clé KEY1234567');
  const listed = await h.request('integrations.list');
  const row = listed.body.data.find(row => row.key === 'APPLE_IAP_PRIVATE_KEY');
  assert.equal(row.hint, 'Clé KEY1234567');
  assert.ok(!JSON.stringify(listed.body).includes(pem));
  h.values.APPLE_IAP_ISSUER_ID = 'issuer-fixture';
  const opened = (await h.request('integrations.test')).body.data.find(row => row.key === 'APPLE_IAP');
  assert.equal(opened.status, 'UNKNOWN'); assert.equal(h.emails, 0);
});

test('.p8 mauvais algorithme et incohérence ID refusés ; nom absent reste accepté', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign', 'verify']);
  const wrong = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
  const h = harness({ saved: { APPLE_MUSICKIT_KEY_ID: 'OTHER12345' } });
  assert.equal((await h.request('integrations.set', { key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: wrong })).status, 400);
  assert.equal((await h.request('integrations.set', { key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: await applePem(), fileName: 'AuthKey_KEY1234567.p8', keyId: 'OTHER12345' })).status, 400);
  const result = await h.request('integrations.set', { key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: await applePem() });
  assert.equal(result.status, 200); assert.notEqual(result.body.validation.status, 'ACTIVE');
  assert.equal(result.body.hint, 'Clé OTHER12345');
});

test('rotation .p8 remplace ancienne Clé ID en un geste après validation réelle ; pending incohérent refusé', async () => {
  for (const explicit of [false, true]) {
    const pem = await applePem();
    const h = harness({
      saved: { APPLE_MUSICKIT_TEAM_ID: 'TEAM123456', APPLE_MUSICKIT_KEY_ID: 'OLDKEY1234', APPLE_MUSICKIT_PRIVATE_KEY: await applePem() },
      hints: { APPLE_MUSICKIT_PRIVATE_KEY: 'Clé ID : OLDKEY1234' },
      fetcher: async (url, options) => {
        assert.equal(new URL(url).hostname, 'api.music.apple.com');
        const jwt = options.headers.Authorization.slice('Bearer '.length).split('.');
        assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).kid, 'KEY1234567');
        return reply({ results: { songs: { data: [{ id: 'song', attributes: { name: 'Get Lucky', artistName: 'Daft Punk' } }] } } });
      },
    });
    const saved = await h.request('integrations.set', { key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: pem, fileName: 'AuthKey_KEY1234567.p8', ...(explicit ? { keyId: 'KEY1234567' } : {}) });
    assert.equal(saved.status, 200); assert.equal(saved.body.validation.status, 'ACTIVE');
    assert.equal(saved.body.hint, 'Clé KEY1234567');
    assert.equal(h.values.APPLE_MUSICKIT_KEY_ID, 'KEY1234567'); assert.equal(h.values.APPLE_MUSICKIT_PRIVATE_KEY, pem);
    assert.equal((await h.request('integrations.list')).body.data.find(row => row.key === 'APPLE_MUSICKIT_PRIVATE_KEY').configurationIssue, null);
    h.values.APPLE_MUSICKIT_KEY_ID = 'OTHER12345';
    const listedRow = (await h.request('integrations.list')).body.data.find(row => row.key === 'APPLE_MUSICKIT_PRIVATE_KEY');
    assert.equal(listedRow.hint, 'Clé KEY1234567', 'indice du fichier conservé malgré nouvelle KEY_ID isolée');
    assert.match(listedRow.configurationIssue, /diffère/);
    const count = h.network.length;
    const opened = await h.request('integrations.test');
    const grouped = opened.body.data.find(row => row.key === 'APPLE_MUSICKIT');
    assert.equal(grouped.status, 'ERROR'); assert.match(grouped.last_error, /diffère/);
    assert.equal(h.network.length, count, 'paire incohérente détectée avant appel fournisseur');
  }
});

test('indice historique filename .p8 détecte une Clé ID modifiée séparément dans list et test', async () => {
  const h = harness({
    saved: { APPLE_MUSICKIT_TEAM_ID: 'TEAM123456', APPLE_MUSICKIT_KEY_ID: 'KEY1234567', APPLE_MUSICKIT_PRIVATE_KEY: await applePem() },
    hints: { APPLE_MUSICKIT_PRIVATE_KEY: 'AuthKey_OLDKEY1234.p8' },
  });
  const listed = await h.request('integrations.list');
  const row = listed.body.data.find(row => row.key === 'APPLE_MUSICKIT_PRIVATE_KEY');
  assert.equal(row.hint, 'Clé OLDKEY1234');
  assert.match(row.configurationIssue, /diffère/);
  const opened = await h.request('integrations.test');
  assert.equal(opened.body.data.find(row => row.key === 'APPLE_MUSICKIT').status, 'ERROR');
  assert.equal(h.network.length, 0);
});

test('indice legacy sans provenance : repli Clé sauvegardée, sans prétendre lire le filename', async () => {
  const h = harness({ saved: { APPLE_MUSICKIT_KEY_ID: 'MWL46J72TM', APPLE_MUSICKIT_PRIVATE_KEY: await applePem() } });
  const row = (await h.request('integrations.list')).body.data.find(row => row.key === 'APPLE_MUSICKIT_PRIVATE_KEY');
  assert.equal(row.hint, 'Clé MWL46J72TM'); assert.equal(row.configurationIssue, null);
  assert.ok(!JSON.stringify(row).includes('AuthKey_'));
});

test('save puis ouverture Apple et Spotify utilisent credentials du coffre et testent catalogue réel', async () => {
  for (const provider of ['APPLE_MUSICKIT', 'SPOTIFY']) {
    const h = harness({
      saved: provider === 'APPLE_MUSICKIT' ? { APPLE_MUSICKIT_TEAM_ID: 'TEAM123456' } : { SPOTIFY_CLIENT_ID: 'spotify-fixture' },
      fetcher: async url => new URL(url).hostname === 'accounts.spotify.com' ? reply({ access_token: 'fixture', token_type: 'Bearer', expires_in: 3600 })
        : new URL(url).hostname === 'api.spotify.com' ? reply({ tracks: { items: [{ id: 'song', name: 'Get Lucky', artists: [{ name: 'Daft Punk' }] }] } })
        : reply({ results: { songs: { data: [{ id: 'song', attributes: { name: 'Get Lucky', artistName: 'Daft Punk' } }] } } }),
    });
    const body = provider === 'APPLE_MUSICKIT'
      ? { key: 'APPLE_MUSICKIT_PRIVATE_KEY', value: await applePem(), fileName: 'AuthKey_KEY1234567.p8' }
      : { key: 'SPOTIFY_CLIENT_SECRET', value: 'spotify-secret-fixture' };
    const saved = await h.request('integrations.set', body);
    assert.equal(saved.status, 200); assert.equal(saved.body.validation.status, 'ACTIVE');
    assert.ok(h.writes.some(write => write.table === 'integration_runtime_status' && write.value.key === provider && write.value.status === 'ACTIVE'));
    const writesBefore = h.writes.length;
    const opened = (await h.request('integrations.test')).body.data.find(row => row.key === provider);
    assert.equal(opened.status, 'ACTIVE'); assert.equal(h.writes.length, writesBefore);
    if (provider === 'APPLE_MUSICKIT') assert.equal(h.values.APPLE_MUSICKIT_KEY_ID, 'KEY1234567');
  }
});

test('erreurs RPC et fournisseur ne renvoient aucun secret ni logs', async () => {
  const h = harness({ rpcError: true });
  const opened = await h.request('integrations.test');
  assert.equal(opened.status, 200);
  assert.ok(opened.body.data.every(row => row.status === 'ERROR'));
  assert.ok(!JSON.stringify(opened.body).includes('private-server-fixture'));
  const listed = await h.request('integrations.list');
  assert.equal(listed.status, 500); assert.equal(listed.body.error, 'integration_server_error');
});

test('RPC indisponible : repli sur secret serveur existant, jamais sur donnée client', async () => {
  const h = harness({ rpcError: true, env: { GOOGLE_TRANSLATE_API_KEY: 'translation-env-fixture' },
    fetcher: async (url, options) => {
      assert.match(url, /translation\.googleapis\.com/);
      assert.equal(options.headers['X-Goog-Api-Key'], 'translation-env-fixture');
      return reply({ data: { translations: [{ translatedText: 'Hello' }] } });
    } });
  const opened = await h.request('integrations.test', { GOOGLE_TRANSLATE_API_KEY: 'wrong-client-fixture' });
  assert.equal(opened.body.data.find(row => row.key === 'GOOGLE_TRANSLATE_API_KEY').status, 'ACTIVE');
  assert.equal(h.network.length, 1);
  assert.ok(!JSON.stringify(opened.body).includes('translation-env-fixture'));
});

test('Google Translate save et quota YouTube/ACRCloud conservent états fournisseurs', async () => {
  const h = harness({
    saved: { YOUTUBE_API_KEY: 'youtube-fixture', ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com', ACRCLOUD_ACCESS_KEY: 'fixture-key', ACRCLOUD_ACCESS_SECRET: 'fixture-secret' },
    fetcher: async url => new URL(url).hostname === 'translation.googleapis.com' ? reply({ data: { translations: [{ translatedText: 'Hello' }] } })
      : new URL(url).hostname === 'www.googleapis.com' && new URL(url).pathname === '/youtube/v3/videos' ? reply({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403)
      : reply({ status: { code: 3003 } }),
  });
  assert.equal((await h.request('integrations.set', { key: 'GOOGLE_TRANSLATE_API_KEY', value: 'translation-fixture' })).body.validation.status, 'ACTIVE');
  const rows = (await h.request('integrations.test')).body.data;
  assert.equal(rows.find(row => row.key === 'YOUTUBE_API_KEY').status, 'EXHAUSTED');
  assert.equal(rows.find(row => row.key === 'ACRCLOUD').status, 'EXHAUSTED');
  assert.equal(rows.find(row => row.key === 'GOOGLE_TRANSLATE_API_KEY').status, 'ACTIVE');
});

test('save puis ouverture Pipedream, ACRCloud, Brevo et YouTube valident le fournisseur sans email', async () => {
  const cases = [
    { group: 'PIPEDREAM_CONNECT', saved: { PIPEDREAM_CLIENT_ID: 'fixture-id', PIPEDREAM_PROJECT_ID: 'proj_fixture' }, key: 'PIPEDREAM_CLIENT_SECRET', value: 'fixture-secret', payload: { access_token: 'fixture-token' } },
    { group: 'ACRCLOUD', saved: { ACRCLOUD_HOST: 'identify-eu-west-1.acrcloud.com', ACRCLOUD_ACCESS_KEY: 'fixture-key' }, key: 'ACRCLOUD_ACCESS_SECRET', value: 'fixture-secret', payload: { status: { code: 1001 } } },
    { group: 'BREVO', saved: { BREVO_SENDER_EMAIL: 'sender@example.org', BREVO_SENDER_NAME: 'Loki Music' }, key: 'BREVO_API_KEY', value: 'fixture-secret', payload: { senders: [{ email: 'sender@example.org', active: true }] } },
    { group: 'YOUTUBE_API_KEY', saved: {}, key: 'YOUTUBE_API_KEY', value: 'fixture-secret', payload: { items: [{ id: 'fixture' }] } },
  ];
  for (const item of cases) {
    const h = harness({ saved: item.saved, fetcher: async () => reply(item.payload) });
    const saved = await h.request('integrations.set', { key: item.key, value: item.value });
    assert.equal(saved.status, 200, item.group); assert.equal(saved.body.validation.status, 'ACTIVE');
    const count = h.writes.length;
    const opened = (await h.request('integrations.test')).body.data.find(row => row.key === item.group);
    assert.equal(opened.status, 'ACTIVE', item.group); assert.equal(h.writes.length, count);
    assert.equal(h.network.length, item.group === 'BREVO' ? 4 : 2); assert.equal(h.emails, 0);
  }
});

test('Brevo vérifie compte et expéditeur actif, nom libre non vide, sans jamais envoyer un email', async () => {
  for (const active of [true, false]) {
    const h = harness({
      saved: { BREVO_API_KEY: 'brevo-fixture', BREVO_SENDER_EMAIL: 'Sender@example.org', BREVO_SENDER_NAME: 'Nom libre Adel' },
      fetcher: async (url, options) => {
        assert.equal(new URL(url).hostname, 'api.brevo.com'); assert.ok(options.signal);
        assert.ok(['/v3/account', '/v3/senders'].includes(new URL(url).pathname));
        return reply(new URL(url).pathname === '/v3/senders' ? { senders: [{ email: 'sender@example.org', active }] } : {});
      },
    });
    const opened = await h.request('integrations.test');
    for (const key of ['BREVO', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME']) {
      assert.equal(opened.body.data.find(row => row.key === key).status, active ? 'ACTIVE' : 'ERROR');
    }
    assert.equal(h.network.length, 2); assert.equal(h.emails, 0); assert.equal(h.writes.length, 0);
  }
  const incomplete = harness({ saved: { BREVO_API_KEY: 'brevo-fixture', BREVO_SENDER_EMAIL: 'sender@example.org' } });
  const opened = await incomplete.request('integrations.test');
  assert.equal(opened.body.data.find(row => row.key === 'BREVO').status, 'NOT_CONFIGURED');
  assert.match(opened.body.data.find(row => row.key === 'BREVO').last_error, /BREVO_SENDER_NAME/);
  assert.equal(incomplete.network.length, 0);
});

test('secrets internes : 32 octets non-placeholder valides sans faux test réseau relais', async () => {
  const secret = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const h = harness({ saved: { ACCOUNT_EMAIL_CODE_SECRET: secret, AI_RELAY_API_KEY: secret } });
  const opened = await h.request('integrations.test');
  for (const key of ['ACCOUNT_EMAIL_CODE_SECRET', 'AI_RELAY_API_KEY']) {
    assert.equal(opened.body.data.find(row => row.key === key).status, 'ACTIVE');
    assert.equal((await h.request('integrations.set', { key, value: secret })).body.validation.status, 'ACTIVE');
    for (const value of ['short', 'change-me'.repeat(8), 'demo'.repeat(16), 'x'.repeat(64)]) {
      assert.equal((await h.request('integrations.set', { key, value })).status, 400);
    }
  }
  assert.equal(h.network.length, 0); assert.equal(h.emails, 0);
  assert.ok(!JSON.stringify(opened.body).includes(secret));
});

test('Resend, Mailjet et Paddle : seuls appels lecture autorisés ; secrets jamais réfléchis', async () => {
  const h = harness({
    saved: { RESEND_API_KEY: 'resend-fixture', MAILJET_API_KEY: 'mailjet-fixture', MAILJET_SECRET_KEY: 'mailjet-secret-fixture', PADDLE_API_KEY: 'paddle-fixture', AUDD_API_KEY: 'audd-fixture-token' },
    fetcher: async (url, options) => {
      if (new URL(url).hostname === 'api.audd.io') return reply({ error: { error_code: 999, error_message: 'audd-fixture-token' } }, 400);
      assert.notEqual(options.method, 'POST');
      assert.ok(['https://api.resend.com/domains', 'https://api.mailjet.com/v3/REST/myprofile', 'https://api.paddle.com/event-types'].includes(url));
      if (new URL(url).hostname === 'api.mailjet.com') assert.equal(options.headers.Authorization, `Basic ${btoa('mailjet-fixture:mailjet-secret-fixture')}`);
      return reply({});
    },
  });
  const opened = await h.request('integrations.test');
  for (const key of ['RESEND_API_KEY', 'MAILJET_API_KEY', 'PADDLE_API_KEY']) {
    assert.equal(opened.body.data.find(row => row.key === key).status, 'ACTIVE');
  }
  assert.equal(opened.body.data.find(row => row.key === 'AUDD_API_KEY').status, 'ERROR');
  assert.ok(!JSON.stringify(opened.body).includes('audd-fixture-token'));
  assert.equal(h.emails, 0); assert.equal(h.writes.length, 0);
});

test('contrôle compilation TypeScript de la fonction Edge, imports Deno typés sans émission', () => {
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
    noEmit: true, strictNullChecks: true, noImplicitAny: true, skipLibCheck: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const virtual = path.join(root, 'scripts/admin-integrations-compile-fixture.d.ts');
  const declaration = `
    declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };
    declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
    declare module "npm:@supabase/supabase-js@2" {
      export function createClient(...args: any[]): {
        [key: string]: any;
        auth: { getUser: any; admin: {
          [key: string]: any;
          listUsers(...args: any[]): Promise<{ data: { users: { id: string; email?: string }[] }; error: any }>;
          createUser(...args: any[]): Promise<{ data: { user: { id: string; email?: string } | null }; error: any }>;
        } };
      };
    }
    declare module "npm:bcryptjs@2.4.3" { const bcrypt: any; export default bcrypt; }
    declare module "npm:jose@5.9.6" {
      export function importPKCS8(pem: string, algorithm: string): Promise<CryptoKey>;
      export class SignJWT {
        constructor(payload: Record<string, unknown>);
        setProtectedHeader(header: Record<string, unknown>): this;
        setIssuer(issuer: string): this;
        setIssuedAt(timestamp: number): this;
        setExpirationTime(timestamp: number): this;
        sign(key: CryptoKey): Promise<string>;
      }
    }
  `;
  const host = ts.createCompilerHost(options);
  const originalGetSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, createNew) => name === virtual
    ? ts.createSourceFile(name, declaration, language, true)
    : originalGetSource(name, language, onError, createNew);
  const program = ts.createProgram([file, virtual], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => '\n',
  }));
});
