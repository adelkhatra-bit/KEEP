'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { generateKeyPairSync } = require('node:crypto');
// Restore the existing Edge import npm:jose@5.9.6, without changing manifests.
const jose = require(process.env.KEEP_JOSE_TEST_MODULE || 'jose');
const key = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const firstKey = key();
const pem = (pair) => pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const appleSecrets = () => ({
  APPLE_MUSICKIT_TEAM_ID: 'TEAM123456',
  APPLE_MUSICKIT_KEY_ID: 'KEY1234567',
  APPLE_MUSICKIT_PRIVATE_KEY: pem(firstKey),
});
const appleRow = {
  id: '123', attributes: {
    name: 'Song', artistName: 'Artist', albumName: 'Album',
    artwork: { url: 'https://image.example/{w}x{h}.{f}' },
    previews: [{ url: 'https://audio.example/apple.m4a' }],
    url: 'https://music.apple.com/fr/song/123', isrc: 'FRABC2600001',
    genreNames: ['Pop'], releaseDate: '2026-01-01',
  },
};
const spotifyRow = {
  id: '1234567890123456789012', name: 'Song', artists: [{ name: 'Artist' }],
  album: { name: 'Album', images: [{ url: 'https://image.example/spotify.jpg' }], release_date: '2026-01-01' },
  external_urls: { spotify: 'https://open.spotify.com/track/1234567890123456789012' },
  external_ids: { isrc: 'FRABC2600001' }, preview_url: null,
};
function fixture(initial = {}) {
  const secrets = { ...initial };
  const calls = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'service_get_integration_secret') return { data: secrets[args.p_key] ?? null, error: null };
      return { data: true, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user', is_anonymous: false } }, error: null }) },
  };
  let served;
  const environment = {};
  const runtime = { env: { get: (name) => environment[name] }, serve: (handler) => { served = handler; } };
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const importer = (specifier) => {
      if (specifier.startsWith('jsr:')) return {};
      if (specifier === 'npm:jose@5.9.6') return jose;
      if (specifier === 'npm:@supabase/supabase-js@2') return { createClient: () => admin };
      if (specifier.endsWith('fingerprintSeed.ts')) return { seedInBackground: () => {} };
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(file), specifier));
      return require(specifier);
    };
    new Function('exports', 'require', 'module', 'Deno', compiled)(mod.exports, importer, mod, runtime);
    return mod.exports;
  }
  return { secrets, calls, admin, environment, load, handler: () => served };
}
function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}
async function withFetch(fetcher, action) {
  const original = global.fetch;
  global.fetch = fetcher;
  try { return await action(); } finally { global.fetch = original; }
}

test('Apple ES256 réel : kid, iss, expiration 12h, cache et rotation des trois credentials', async () => {
  const f = fixture(appleSecrets());
  const api = f.load('musicProviderCredentials.ts');
  const initial = await api.getAppleMusicDeveloperToken(f.admin);
  assert.ok(initial);
  const verified = await jose.jwtVerify(initial.token, firstKey.publicKey);
  assert.equal(verified.protectedHeader.alg, 'ES256');
  assert.equal(verified.protectedHeader.kid, 'KEY1234567');
  assert.equal(verified.payload.iss, 'TEAM123456');
  assert.equal(verified.payload.exp - verified.payload.iat, 43200);
  assert.equal(initial.expiresAt, verified.payload.exp);
  assert.deepEqual(await api.getAppleMusicDeveloperToken(f.admin), initial);
  f.secrets.APPLE_MUSICKIT_KEY_ID = 'NEW1234567';
  const keyRotated = await api.getAppleMusicDeveloperToken(f.admin);
  assert.notEqual(keyRotated.token, initial.token);
  f.secrets.APPLE_MUSICKIT_TEAM_ID = 'TEAM654321';
  assert.notEqual((await api.getAppleMusicDeveloperToken(f.admin)).token, keyRotated.token);
  const secondKey = key();
  f.secrets.APPLE_MUSICKIT_PRIVATE_KEY = pem(secondKey).replace(/\n/g, '\\n');
  const privateRotated = await api.getAppleMusicDeveloperToken(f.admin);
  await jose.jwtVerify(privateRotated.token, secondKey.publicKey);
  await assert.rejects(jose.jwtVerify(privateRotated.token, firstKey.publicKey));
  f.secrets.APPLE_MUSICKIT_PRIVATE_KEY = '';
  assert.equal(await api.getAppleMusicDeveloperToken(f.admin), null);
  assert.ok(f.calls.every((call) => call.name === 'service_get_integration_secret'));
});

test('Apple token expiré régénéré, mauvaise clé rejetée, Vault prioritaire et fallback env', async () => {
  const f = fixture(appleSecrets());
  const api = f.load('musicProviderCredentials.ts');
  const before = await api.getAppleMusicDeveloperToken(f.admin);
  const now = Date.now;
  Date.now = () => now() + 43200 * 1000;
  try {
    const after = await api.getAppleMusicDeveloperToken(f.admin);
    assert.notEqual(after.token, before.token);
    assert.ok(after.expiresAt > before.expiresAt);
  } finally { Date.now = now; }
  f.secrets.APPLE_MUSICKIT_PRIVATE_KEY = 'PRIVATE_INVALID_DO_NOT_EXPOSE';
  assert.equal(await api.getAppleMusicDeveloperToken(f.admin), null);
  f.environment.APPLE_MUSICKIT_PRIVATE_KEY = pem(firstKey);
  assert.equal(await api.getAppleMusicDeveloperToken(f.admin), null);
  f.admin.rpc = async () => { throw new Error('RPC_PRIVATE_DO_NOT_EXPOSE'); };
  Object.assign(f.environment, appleSecrets());
  assert.ok(await api.getAppleMusicDeveloperToken(f.admin));
});

test('Spotify OAuth serveur : formulaire, cache, concurrence, rotation client ID + secret', async () => {
  const f = fixture({ SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'server-secret' });
  const api = f.load('musicProviderCredentials.ts');
  let requests = 0;
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://accounts.spotify.com/api/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    assert.equal(options.body.get('grant_type'), 'client_credentials');
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from(`${f.secrets.SPOTIFY_CLIENT_ID}:${f.secrets.SPOTIFY_CLIENT_SECRET}`).toString('base64'));
    return response({ access_token: `access-${++requests}`, token_type: 'Bearer', expires_in: 3600 });
  }, async () => {
    const tokens = await Promise.all(Array.from({ length: 5 }, () => api.getSpotifyAccessToken(f.admin)));
    assert.equal(requests, 1);
    assert.ok(tokens.every((token) => token.token === 'access-1'));
    assert.equal((await api.getSpotifyAccessToken(f.admin)).token, 'access-1');
    f.secrets.SPOTIFY_CLIENT_SECRET = 'rotated-secret';
    assert.equal((await api.getSpotifyAccessToken(f.admin)).token, 'access-2');
    f.secrets.SPOTIFY_CLIENT_ID = 'rotated-client';
    assert.equal((await api.getSpotifyAccessToken(f.admin)).token, 'access-3');
    const now = Date.now;
    Date.now = () => now() + 3600 * 1000;
    try { assert.equal((await api.getSpotifyAccessToken(f.admin)).token, 'access-4'); }
    finally { Date.now = now; }
    f.secrets.SPOTIFY_CLIENT_SECRET = '';
    assert.equal(await api.getSpotifyAccessToken(f.admin), null);
  });
});

test('Spotify erreurs OAuth / réseau / payload restent null, jamais secrets', async () => {
  for (const fetcher of [
    async () => response({ error_description: 'SECRET_PRIVATE' }, 401),
    async () => { throw new Error('SECRET_PRIVATE'); },
    async () => response({ access_token: 'bad', token_type: 'other', expires_in: 3600 }),
    async () => response({ access_token: 'bad', token_type: 'Bearer', expires_in: -1 }),
  ]) {
    const f = fixture({ SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' });
    await withFetch(fetcher, async () => assert.equal(await f.load('musicProviderCredentials.ts').getSpotifyAccessToken(f.admin), null));
  }
});

test('Catalogues Apple Music + Spotify : HTTP simulé authentifié et mapping extraits, pochettes, ISRC', async () => {
  const f = fixture({ ...appleSecrets(), SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' });
  const api = f.load('musicProviderCatalog.ts');
  await withFetch(async (raw, options) => {
    const url = new URL(raw);
    if (url.hostname === 'accounts.spotify.com') return response({ access_token: 'spotify-token', token_type: 'Bearer', expires_in: 3600 });
    assert.ok(options.headers.Authorization.startsWith('Bearer '));
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (url.hostname === 'api.music.apple.com') {
      assert.ok(url.pathname.startsWith('/v1/catalog/fr/'));
      if (url.pathname.endsWith('/search')) {
        assert.equal(url.searchParams.get('term'), 'Artist Song');
        assert.equal(url.searchParams.get('types'), 'songs');
        return response({ results: { songs: { data: [appleRow] } } });
      }
      return response({ data: [appleRow] });
    }
    assert.equal(url.hostname, 'api.spotify.com');
    assert.equal(url.searchParams.get('market'), 'FR');
    return url.pathname.endsWith('/search') ? response({ tracks: { items: [spotifyRow] } }) : response(spotifyRow);
  }, async () => {
    const apple = (await api.searchAppleMusicCatalog(f.admin, 'Artist Song'))[0];
    assert.equal(apple.previewUrl, 'https://audio.example/apple.m4a');
    assert.equal(apple.artworkUrl, 'https://image.example/600x600.jpg');
    assert.equal(apple.isrc, 'FRABC2600001');
    assert.equal(apple.releaseYear, 2026);
    assert.deepEqual(await api.lookupAppleMusicCatalog(f.admin, '123'), apple);
    const spotify = (await api.searchSpotifyCatalog(f.admin, 'Artist Song'))[0];
    assert.equal(spotify.source, 'spotify'); assert.equal(spotify.isrc, apple.isrc);
    assert.equal(spotify.previewUrl, undefined);
    assert.deepEqual(await api.lookupSpotifyCatalog(f.admin, spotifyRow.id), spotify);
  });
});

test('Catalogues indépendants : absence credentials / HTTP erreur / timeout ne casse aucun fallback', async () => {
  const absent = fixture();
  const a = absent.load('musicProviderCatalog.ts');
  await withFetch(async () => { throw new Error('must_not_fetch'); }, async () => {
    assert.deepEqual(await a.searchAppleMusicCatalog(absent.admin, 'Song'), []);
    assert.deepEqual(await a.searchSpotifyCatalog(absent.admin, 'Song'), []);
    assert.equal(await a.lookupSpotifyCatalog(absent.admin, '../bad'), null);
  });
  const configured = fixture(appleSecrets());
  const b = configured.load('musicProviderCatalog.ts');
  await withFetch(async () => response({ error: 'SECRET_PRIVATE' }, 401), async () => {
    assert.deepEqual(await b.searchAppleMusicCatalog(configured.admin, 'Song'), []);
  });
  await withFetch(async () => { throw new Error('SECRET_PRIVATE'); }, async () => {
    assert.deepEqual(await b.searchAppleMusicCatalog(configured.admin, 'Song'), []);
  });
  assert.equal(b.appleMusicCatalogTrack({ ...appleRow, attributes: { ...appleRow.attributes, previews: [{ url: 'javascript:bad' }] } }).previewUrl, undefined);
});

test('Endpoint token : OPTIONS, méthode, vrais utilisateurs uniquement, réponse publique sans secret', async () => {
  const f = fixture(appleSecrets());
  f.load('../keep-apple-music-token/index.ts');
  const handler = f.handler();
  assert.equal((await handler(new Request('https://edge.example', { method: 'OPTIONS' }))).status, 200);
  assert.equal((await handler(new Request('https://edge.example'))).status, 405);
  assert.equal((await handler(new Request('https://edge.example', { method: 'POST' }))).status, 401);
  const request = () => new Request('https://edge.example', { method: 'POST', headers: { Authorization: 'Bearer ' + 'user-jwt' } });
  for (const user of [null, { id: 'anon', is_anonymous: true }]) {
    f.admin.auth.getUser = async () => ({ data: { user }, error: null });
    assert.equal((await handler(request())).status, 401);
  }
  assert.equal(f.calls.length, 0);
  f.admin.auth.getUser = async () => ({ data: { user: { id: 'real', is_anonymous: false } }, error: null });
  const result = await handler(request());
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  const payload = await result.json();
  assert.deepEqual(Object.keys(payload).sort(), ['expiresAt', 'ok', 'token']);
  await jose.jwtVerify(payload.token, firstKey.publicKey);
  f.secrets.APPLE_MUSICKIT_PRIVATE_KEY = 'PRIVATE_INVALID_DO_NOT_EXPOSE';
  const failure = await handler(request());
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), '{"ok":false,"error":"apple_music_unavailable"}');
});

test('Pipeline catalogue existant : Apple + Spotify correspondent, Spotify sans extrait ne supprime pas Apple', async () => {
  const f = fixture({ ...appleSecrets(), SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' });
  f.load('../keep-music-keyless-source/index.ts');
  await withFetch(async (raw) => {
    const url = new URL(raw);
    if (url.hostname === 'accounts.spotify.com') return response({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
    if (url.hostname === 'api.music.apple.com') return response({ results: { songs: { data: [appleRow] } } });
    if (url.hostname === 'api.spotify.com') return response({ tracks: { items: [spotifyRow] } });
    if (url.hostname === 'itunes.apple.com') return response({ results: [] });
    if (url.hostname === 'api.deezer.com') return response({ data: [{ id: 456, title: 'Song', artist: { name: 'Artist' } }] });
    throw new Error('Unexpected fetch: ' + url.hostname);
  }, async () => {
    const res = await f.handler()(new Request('https://edge.example', {
      method: 'POST', body: JSON.stringify({ title: 'Artist - Song' }),
    }));
    const payload = await res.json();
    assert.equal(payload.ok, true); assert.equal(payload.strategy, 'cross-catalog');
    assert.equal(payload.recognition.providerIds.appleMusic, '123');
    assert.equal(payload.recognition.providerIds.spotify, spotifyRow.id);
    assert.equal(payload.recognition.providerIds.deezer, '456');
    assert.equal(payload.recognition.previewUrl, 'https://audio.example/apple.m4a');
    assert.equal(payload.recognition.isrc, 'FRABC2600001');
    assert.ok(payload.recognition.availableOn.includes('Spotify'));
    assert.doesNotMatch(JSON.stringify(payload), /access_token|PRIVATE KEY|server-secret/);
  });
});

test('Pipeline sans clés / fournisseurs en échec : iTunes et Deezer historiques restent opérationnels', async () => {
  for (const initial of [{}, { ...appleSecrets(), SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' }]) {
    const f = fixture(initial);
    f.load('../keep-music-keyless-source/index.ts');
    await withFetch(async (raw) => {
      const url = new URL(raw);
      if (url.hostname === 'itunes.apple.com') return response({ results: [{
        trackId: 123, trackName: 'Song', artistName: 'Artist', previewUrl: 'https://audio.example/public.m4a',
      }] });
      if (url.hostname === 'api.deezer.com') return response({ data: [{ id: 456, title: 'Song', artist: { name: 'Artist' } }] });
      return response({ error: 'provider-secret-error' }, 503);
    }, async () => {
      const res = await f.handler()(new Request('https://edge.example', { method: 'POST', body: JSON.stringify({ title: 'Artist - Song' }) }));
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.recognition.providerIds.appleMusic, '123');
      assert.equal(payload.recognition.providerIds.deezer, '456');
      assert.equal(payload.recognition.previewUrl, 'https://audio.example/public.m4a');
    });
  }
});

test('Liens directs Apple et Spotify consultent leurs catalogues serveur et conservent ISRC', async () => {
  for (const [url, source] of [
    ['https://music.apple.com/fr/song/123', 'apple'],
    ['https://open.spotify.com/intl-fr/track/1234567890123456789012', 'spotify'],
  ]) {
    const f = fixture({ ...appleSecrets(), SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' });
    f.load('../keep-music-keyless-source/index.ts');
    await withFetch(async (raw) => {
      const target = new URL(raw);
      if (target.hostname === 'accounts.spotify.com') return response({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
      if (target.hostname === 'api.music.apple.com') return response({ data: [appleRow] });
      if (target.hostname === 'api.spotify.com') return response(spotifyRow);
      if (target.hostname === 'itunes.apple.com') return response({ results: [] });
      throw new Error('Unexpected fetch: ' + target.hostname);
    }, async () => {
      const res = await f.handler()(new Request('https://edge.example', { method: 'POST', body: JSON.stringify({ url }) }));
      const payload = await res.json();
      assert.equal(payload.strategy, source + '-direct');
      assert.equal(payload.recognition.isrc, 'FRABC2600001');
    });
  }
});

test('Échec Apple indépendant : Spotify peut encore matcher sans extrait, sans clé serveur exposée', async () => {
  const f = fixture({ ...appleSecrets(), SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' });
  f.load('../keep-music-keyless-source/index.ts');
  await withFetch(async (raw) => {
    const target = new URL(raw);
    if (target.hostname === 'accounts.spotify.com') return response({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
    if (target.hostname === 'api.spotify.com') return response({ tracks: { items: [spotifyRow] } });
    return response({ error: 'private-upstream-error' }, 503);
  }, async () => {
    const res = await f.handler()(new Request('https://edge.example', { method: 'POST', body: JSON.stringify({ title: 'Artist - Song' }) }));
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.recognition.providerIds.spotify, spotifyRow.id);
    assert.equal(payload.recognition.previewUrl, undefined);
    assert.equal(payload.evidence.crossCatalogConfirmed, false);
  });
});

test('Apple officiel sans extrait : enrichissement iTunes préservé sur le même ID, avec ISRC officiel', async () => {
  const f = fixture(appleSecrets());
  f.load('../keep-music-keyless-source/index.ts');
  await withFetch(async (raw) => {
    const target = new URL(raw);
    if (target.hostname === 'api.music.apple.com') return response({ results: { songs: { data: [{
      ...appleRow, attributes: { ...appleRow.attributes, previews: [] },
    }] } } });
    if (target.hostname === 'itunes.apple.com') return response({ results: [{
      trackId: 123, trackName: 'Song', artistName: 'Artist', previewUrl: 'https://audio.example/public.m4a',
    }] });
    return response({ data: [] });
  }, async () => {
    const res = await f.handler()(new Request('https://edge.example', { method: 'POST', body: JSON.stringify({ title: 'Artist - Song' }) }));
    const payload = await res.json();
    assert.equal(payload.recognition.previewUrl, 'https://audio.example/public.m4a');
    assert.equal(payload.recognition.isrc, 'FRABC2600001');
  });
});

test('Validation Apple : PEM valide insuffisant, ACTIVE exige le catalogue HTTP 200', async () => {
  const f = fixture();
  const api = f.load('appleMusicToken.ts');
  assert.equal((await api.validateAppleMusicCredentials('', '', '')).status, 'NOT_CONFIGURED');
  assert.equal((await api.validateAppleMusicCredentials('TEAM123456', '', '')).status, 'ERROR');
  let calls = 0;
  await withFetch(async () => { calls += 1; return response({}, 401); }, async () => {
    const invalid = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', 'INVALID_PRIVATE');
    assert.equal(invalid.valid, false); assert.equal(calls, 0);
    const rejected = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', pem(firstKey));
    assert.equal(rejected.status, 'ERROR'); assert.equal(rejected.valid, false); assert.equal(calls, 1);
    assert.doesNotMatch(rejected.message, /PRIVATE|TEAM123456|KEY1234567/);
  });
  await withFetch(async (raw, options) => {
    assert.equal(new URL(raw).hostname, 'api.music.apple.com');
    assert.equal(new URL(raw).searchParams.get('types'), 'songs');
    assert.equal(options.redirect, 'error');
    const signed = options.headers.Authorization.slice('Bearer '.length);
    await jose.jwtVerify(signed, firstKey.publicKey);
    return response({ results: { songs: { data: [appleRow] } } });
  }, async () => {
    const active = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', pem(firstKey));
    assert.equal(active.valid, true); assert.equal(active.status, 'ACTIVE');
  });
  await withFetch(async () => { throw new Error('PRIVATE_ERROR'); }, async () => {
    const failed = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', pem(firstKey));
    assert.equal(failed.status, 'ERROR'); assert.doesNotMatch(failed.message, /PRIVATE_ERROR/);
  });
  for (const payload of [{}, { results: { songs: { data: [] } } }, { results: { songs: { data: [{}] } } }]) {
    await withFetch(async () => response(payload), async () => {
      const result = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', pem(firstKey));
      assert.equal(result.valid, false); assert.equal(result.status, 'ERROR');
    });
  }
  await withFetch(async () => response({}, 429), async () => {
    const result = await api.validateAppleMusicCredentials('TEAM123456', 'KEY1234567', pem(firstKey));
    assert.equal(result.valid, false); assert.equal(result.status, 'EXHAUSTED');
  });
});

test('Validation Spotify : OAuth valide insuffisant, ACTIVE exige le catalogue HTTP 200', async () => {
  const f = fixture();
  const api = f.load('spotifyCatalog.ts');
  assert.equal((await api.validateSpotifyCredentials('', '')).status, 'NOT_CONFIGURED');
  assert.equal((await api.validateSpotifyCredentials('client', '')).status, 'ERROR');
  for (const catalogStatus of [200, 201, 401, 403, 429, 503]) {
    const hosts = [];
    await withFetch(async (raw, options) => {
      const host = new URL(raw).hostname;
      hosts.push(host);
      if (host === 'accounts.spotify.com') return response({ access_token: 'secret-access', token_type: 'Bearer', expires_in: 3600 });
      assert.equal(host, 'api.spotify.com');
      assert.equal(new URL(raw).searchParams.get('type'), 'track');
      assert.equal(options.headers.Authorization, 'Bearer ' + 'secret-access');
      return response(catalogStatus === 200 ? { tracks: { items: [spotifyRow] } } : { error: 'PRIVATE_UPSTREAM_ERROR' }, catalogStatus);
    }, async () => {
      const result = await api.validateSpotifyCredentials('client', 'private-secret');
      assert.deepEqual(hosts, ['accounts.spotify.com', 'api.spotify.com']);
      assert.equal(result.valid, catalogStatus === 200);
      assert.equal(result.status, catalogStatus === 200 ? 'ACTIVE' : catalogStatus === 429 ? 'EXHAUSTED' : 'ERROR');
      assert.doesNotMatch(JSON.stringify(result), /private-secret|secret-access|PRIVATE_UPSTREAM_ERROR/);
    });
  }
  for (const payload of [{}, { tracks: { items: [] } }, { tracks: { items: [{}] } }]) {
    await withFetch(async (raw) => new URL(raw).hostname === 'accounts.spotify.com'
      ? response({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 }) : response(payload), async () => {
      const result = await api.validateSpotifyCredentials('client', 'private-secret');
      assert.equal(result.valid, false); assert.equal(result.status, 'ERROR');
    });
  }
});

test('Typecheck strict Edge : helpers, endpoint et catalogue existant (imports runtime existants)', () => {
  const runtimePath = path.resolve(__dirname, '__edge_runtime_types__.d.ts');
  const runtimeSource = `
    declare const Deno: {
      env: { get(key: string): string | undefined };
      serve(handler: (req: Request) => Response | Promise<Response>): void;
    };
    declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
    declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
  `;
  const options = {
    noEmit: true, strict: true, skipLibCheck: true,
    allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, types: [],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, ...args) => file === runtimePath
    ? ts.createSourceFile(file, runtimeSource, languageVersion)
    : getSourceFile(file, languageVersion, ...args);
  host.resolveModuleNames = (names, containingFile) => names.map((name) => {
    if (name === 'npm:jose@5.9.6') {
      const joseRoot = path.resolve(path.dirname(require.resolve(process.env.KEEP_JOSE_TEST_MODULE || 'jose')), '../../..');
      return { resolvedFileName: path.join(joseRoot, 'dist/types/index.d.ts'), extension: ts.Extension.Dts };
    }
    const restored = {
      'npm:fft.js@4.0.4': ['fft', 'lib/fft.d.ts'],
      'npm:mpg123-decoder@1.0.3': ['mpg', 'types.d.ts'],
    }[name];
    if (restored && process.env.KEEP_EDGE_TEST_IMPORTS) return {
      resolvedFileName: path.resolve(process.env.KEEP_EDGE_TEST_IMPORTS, restored[0], 'package', restored[1]),
      extension: ts.Extension.Dts,
    };
    if (name.startsWith('npm:')) name = name.replace(/^npm:/, '').replace(/@\d.*$/, '');
    return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  });
  const files = [
    runtimePath, path.resolve(__dirname, 'musicProviderCredentials.ts'),
    path.resolve(__dirname, 'musicProviderCatalog.ts'),
    path.resolve(__dirname, 'appleMusicToken.ts'),
    path.resolve(__dirname, 'spotifyCatalog.ts'),
    path.resolve(__dirname, '../keep-apple-music-token/index.ts'),
    path.resolve(__dirname, '../keep-music-keyless-source/index.ts'),
  ];
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
});
