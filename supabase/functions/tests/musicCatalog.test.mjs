import assert from "node:assert/strict";
import { generateKeyPairSync, verify, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const keyPair = () => generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function fixture({ secrets = {}, env = {}, fetchImpl, user = { id: "user-1" } } = {}) {
  let handler;
  let now = Date.now();
  const calls = [];
  const admin = {
    rpc(name, args) {
      const result = Promise.resolve(name === "service_get_integration_secret"
        ? { data: secrets[args.p_key] ?? null, error: null }
        : { data: true, error: null });
      result.abortSignal = () => result;
      return result;
    },
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  };
  const context = vm.createContext({
    crypto: webcrypto, btoa, atob, TextEncoder, Uint8Array, AbortSignal, setTimeout, clearTimeout,
    URL, Request, Response,
    Date: class extends Date { static now() { return now; } },
    console: { error() {} },
    Deno: { env: { get: (key) => env[key] }, serve: (fn) => { handler = fn; } },
    createClient: () => admin,
    seedFingerprintInBackground() {},
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      assert.ok(init.signal, `timeout absent: ${url}`);
      return fetchImpl ? fetchImpl(String(url), init) : new Response("{}", { status: 404 });
    },
  });
  function load(path, exports = []) {
    let source = readFileSync(new URL(path, root), "utf8");
    source = source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
    const js = stripTypeScriptTypes(source);
    vm.runInContext(`${js}\n;globalThis.exposed = {${exports.join(",")}};`, context, { filename: path });
    return context.exposed;
  }
  const shared = load("_shared/appleMusicToken.ts", ["getAppleMusicToken"]);
  const spotify = load("_shared/spotifyCatalog.ts", ["getSpotifyCatalogToken"]);
  return {
    shared, spotify, admin, calls, secrets, env,
    advance: (ms) => { now += ms; },
    loadCatalog: () => load("keep-music-keyless-source/index.ts", ["sameSong", "searchApple", "searchSpotify", "recognition"]),
    loadEndpoint: () => load("keep-apple-music-token/index.ts"),
    request: (body, authorization = "") => handler(new Request("https://keep.test/function", {
      method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify(body),
    })),
  };
}

const configured = (privateKey) => ({
  APPLE_MUSICKIT_TEAM_ID: "TEAM_TEST",
  APPLE_MUSICKIT_KEY_ID: "KEY_TEST",
  APPLE_MUSICKIT_PRIVATE_KEY: privateKey,
});
const decode = (token, part) => JSON.parse(Buffer.from(token.split(".")[part], "base64url").toString());

test("Apple ES256 réel, priorité admin, cache 12h, rotations et expiration", async () => {
  const firstKey = keyPair();
  const f = fixture({ secrets: configured(firstKey.privateKey), env: configured("invalid-env-pem") });
  const first = await f.shared.getAppleMusicToken(f.admin);
  assert.equal(decode(first.token, 0).alg, "ES256");
  assert.equal(decode(first.token, 0).kid, "KEY_TEST");
  assert.equal(decode(first.token, 1).iss, "TEAM_TEST");
  assert.equal(decode(first.token, 1).exp - decode(first.token, 1).iat, 43200);
  assert.equal(first.expiresAt, decode(first.token, 1).exp);
  const [header, payload, signature] = first.token.split(".");
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  assert.ok(verify("sha256", Buffer.from(`${header}.${payload}`), {
    key: firstKey.publicKey, dsaEncoding: "ieee-p1363",
  }, Buffer.from(signature, "base64url")));
  assert.equal((await f.shared.getAppleMusicToken(f.admin)).token, first.token);
  f.secrets.APPLE_MUSICKIT_KEY_ID = "ROTATED_KEY";
  const rotatedId = await f.shared.getAppleMusicToken(f.admin);
  assert.equal(decode(rotatedId.token, 0).kid, "ROTATED_KEY");
  assert.notEqual(rotatedId.token, first.token);
  f.secrets.APPLE_MUSICKIT_TEAM_ID = "ROTATED_TEAM";
  assert.equal(decode((await f.shared.getAppleMusicToken(f.admin)).token, 1).iss, "ROTATED_TEAM");
  const secondKey = keyPair();
  f.secrets.APPLE_MUSICKIT_PRIVATE_KEY = secondKey.privateKey;
  const rotatedPem = await f.shared.getAppleMusicToken(f.admin);
  assert.notEqual(rotatedPem.token, rotatedId.token);
  const parts = rotatedPem.token.split(".");
  assert.ok(verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), {
    key: secondKey.publicKey, dsaEncoding: "ieee-p1363",
  }, Buffer.from(parts[2], "base64url")));
  f.advance((43200 - 299) * 1000);
  assert.ok((await f.shared.getAppleMusicToken(f.admin)).expiresAt > rotatedPem.expiresAt);
});

test("repli env PEM échappé, suppression et erreurs sans secret", async () => {
  const { privateKey } = keyPair();
  const f = fixture({ env: configured(privateKey.replace(/\n/g, "\\n")) });
  assert.ok((await f.shared.getAppleMusicToken(f.admin)).token);
  delete f.env.APPLE_MUSICKIT_TEAM_ID;
  await assert.rejects(f.shared.getAppleMusicToken(f.admin), { message: "apple_music_not_configured" });
  f.env.APPLE_MUSICKIT_TEAM_ID = "TEAM";
  f.env.APPLE_MUSICKIT_PRIVATE_KEY = "private-secret-invalid";
  await assert.rejects(f.shared.getAppleMusicToken(f.admin), { message: "apple_music_credentials_invalid" });
});

test("endpoint exige utilisateur réel et ne renvoie que jeton public/expiration", async () => {
  const f = fixture({ secrets: configured(keyPair().privateKey) });
  f.loadEndpoint();
  assert.equal((await f.request({})).status, 401);
  const response = await f.request({}, "******");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["expiresAt", "token"]);
  assert.ok(body.token);
  for (const user of [null, { id: "guest", is_anonymous: true }]) {
    const denied = fixture({ user });
    denied.loadEndpoint();
    assert.equal((await denied.request({}, "******")).status, 401);
  }
  const invalid = fixture({ secrets: configured("private-secret-invalid") });
  invalid.loadEndpoint();
  const failed = await invalid.request({}, "******");
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "apple_music_token_unavailable" });
});

function hasHostname(url, expected) {
  return new URL(url).hostname === expected;
}

function catalogs(url, { appleStatus = 200, noApplePreview = false } = {}) {
  if (hasHostname(url, "accounts.spotify.com")) return Response.json({ access_token: "spotify-test-token", expires_in: 3600 });
  if (hasHostname(url, "api.music.apple.com")) {
    if (appleStatus !== 200) return Response.json({ errors: [{ detail: "do-not-expose" }] }, { status: appleStatus });
    const songs = [{
      id: "123", attributes: {
        name: "Test Song", artistName: "Test Artist", albumName: "Album",
        artwork: { url: "https://art.test/{w}x{h}.jpg" }, previews: noApplePreview ? [] : [{ url: "https://audio.test/apple.m4a" }],
        url: "https://music.apple.com/fr/song/123", isrc: "FRTEST000001",
      },
    }];
    return Response.json(url.includes("/songs/") ? { data: songs } : { results: { songs: { data: songs } } });
  }
  if (hasHostname(url, "api.spotify.com")) {
    const track = {
      id: "1234567890123456789012", name: "Test Song", artists: [{ name: "Test Artist" }],
      album: { name: "Album", images: [{ url: "https://art.test/spotify.jpg" }] }, preview_url: null,
      external_ids: { isrc: "FRTEST000001" }, external_urls: { spotify: "https://open.spotify.com/track/1234567890123456789012" },
    };
    return Response.json(url.includes("/tracks/") ? track : { tracks: { items: [track] } });
  }
  if (hasHostname(url, "itunes.apple.com")) return Response.json({ results: [{
    trackId: 123, trackName: "Test Song", artistName: "Test Artist",
    artworkUrl100: "https://art.test/100x100bb.jpg", previewUrl: "https://audio.test/itunes.m4a",
    trackViewUrl: "https://music.apple.com/fr/song/123",
  }] });
  if (hasHostname(url, "api.deezer.com")) return Response.json({ data: [{
    id: 456, title: "Test Song", artist: { name: "Test Artist" },
    album: { title: "Album", cover_xl: "https://art.test/deezer.jpg" }, preview: "https://audio.test/deezer.mp3",
  }] });
  return new Response("", { status: 404 });
}

test("pipeline existant réunit Apple Music, Spotify et Deezer avec ISRC/preview/artwork", async () => {
  const f = fixture({ secrets: {
    ...configured(keyPair().privateKey), SPOTIFY_CLIENT_ID: "spotify-id", SPOTIFY_CLIENT_SECRET: "spotify-secret",
  }, fetchImpl: catalogs });
  f.loadCatalog();
  const response = await f.request({ title: "Test Artist - Test Song" });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recognition.providerIds.appleMusic, "123");
  assert.equal(body.recognition.providerIds.spotify, "1234567890123456789012");
  assert.equal(body.recognition.providerIds.deezer, "456");
  assert.equal(body.recognition.isrc, "FRTEST000001");
  assert.equal(body.recognition.previewUrl, "https://audio.test/apple.m4a");
  assert.equal(body.recognition.artworkUrl, "https://art.test/600x600.jpg");
  assert.ok(body.recognition.availableOn.includes("Spotify"));
  assert.ok(!JSON.stringify(body).includes("spotify-secret"));
  const appleCall = f.calls.find((call) => hasHostname(call.url, "api.music.apple.com"));
  assert.ok(appleCall.init.headers.Authorization.startsWith("Bearer "));
  const spotifyTokenCall = f.calls.find((call) => hasHostname(call.url, "accounts.spotify.com"));
  assert.equal(spotifyTokenCall.init.body, "grant_type=client_credentials");
  assert.equal(spotifyTokenCall.init.headers.Authorization, `Basic ${btoa("spotify-id:spotify-secret")}`);
  assert.equal(f.calls.filter((call) => hasHostname(call.url, "accounts.spotify.com")).length, 1);
});

test("Spotify rotation invalide son cache et ISRC contradictoire refuse une corroboration", async () => {
  const f = fixture({ secrets: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }, fetchImpl: catalogs });
  const catalog = f.loadCatalog();
  await catalog.searchSpotify("Test Song");
  await catalog.searchSpotify("Test Song");
  assert.equal(f.calls.filter((call) => hasHostname(call.url, "accounts.spotify.com")).length, 1);
  f.secrets.SPOTIFY_CLIENT_SECRET = "rotated";
  await catalog.searchSpotify("Test Song");
  assert.equal(f.calls.filter((call) => hasHostname(call.url, "accounts.spotify.com")).length, 2);
  assert.equal(catalog.sameSong({ title: "Test Song", artist: "Test Artist", isrc: "ONE" }, {
    title: "Test Song", artist: "Test Artist", isrc: "TWO",
  }), false);
});

test("lien Apple direct ajoute le match Spotify par ISRC", async () => {
  const f = fixture({ secrets: {
    ...configured(keyPair().privateKey), SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret",
  }, fetchImpl: catalogs });
  f.loadCatalog();
  const body = await (await f.request({ url: "https://music.apple.com/fr/song/test-song/123" })).json();
  assert.equal(body.strategy, "apple-direct");
  assert.equal(body.recognition.providerIds.spotify, "1234567890123456789012");
  assert.ok(f.calls.some((call) => hasHostname(call.url, "api.spotify.com") &&
    new URL(call.url).pathname === "/v1/search" && call.url.includes("isrc%3AFRTEST000001")));
});

test("fallback public préservé sans clés, erreurs API ou preview Apple absente", async () => {
  for (const mode of ["no-keys", "api-error", "no-preview"]) {
    const f = fixture({
      secrets: mode === "no-keys" ? {} : configured(keyPair().privateKey),
      fetchImpl: (url) => catalogs(url, { appleStatus: mode === "api-error" ? 401 : 200, noApplePreview: mode === "no-preview" }),
    });
    f.loadCatalog();
    const body = await (await f.request({ title: "Test Artist - Test Song" })).json();
    assert.equal(body.ok, true, mode);
    assert.equal(body.recognition.previewUrl, "https://audio.test/itunes.m4a", mode);
    assert.equal(body.recognition.providerIds.appleMusic, "123", mode);
    assert.equal(body.recognition.providerIds.deezer, "456", mode);
    assert.ok(!JSON.stringify(body).includes("do-not-expose"));
  }
});

test("timeouts réseau restent best-effort et réponse Spotify directe utilise preview corroborée", async () => {
  const f = fixture({ secrets: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }, fetchImpl: catalogs });
  f.loadCatalog();
  const body = await (await f.request({ url: "https://open.spotify.com/track/1234567890123456789012" })).json();
  assert.equal(body.strategy, "spotify-direct", JSON.stringify(body));
  assert.equal(body.recognition.previewUrl, "https://audio.test/itunes.m4a");
  const timeout = fixture({ fetchImpl: async () => { throw new Error("upstream-private-data"); } });
  timeout.loadCatalog();
  const failed = await (await timeout.request({ title: "Test Artist - Test Song" })).json();
  assert.equal(failed.recognition, null);
  assert.equal(failed.reason, "catalog_no_match");
  assert.ok(!JSON.stringify(failed).includes("upstream-private-data"));
});

test("Deezer exact conserve la reconnaissance primaire si Apple secondaire ne répond jamais", {
  timeout: 4000,
}, async () => {
  const f = fixture({
    secrets: configured(keyPair().privateKey),
    fetchImpl: (url) => {
      if (hasHostname(url, "api.music.apple.com")) return new Promise(() => {});
      if (hasHostname(url, "api.deezer.com")) return Response.json({
        id: 456, title: "Test Song", artist: { name: "Test Artist" },
        album: { title: "Album", cover_xl: "https://art.test/deezer.jpg" },
        preview: "https://audio.test/deezer.mp3", link: "https://www.deezer.com/track/456",
      });
      return new Response("{}", { status: 404 });
    },
  });
  f.loadCatalog();
  const start = performance.now();
  const body = await (await f.request({ url: "https://www.deezer.com/track/456" })).json();
  assert.ok(performance.now() - start < 3000, "le budget secondaire doit rester inférieur au timeout client");
  assert.equal(body.ok, true);
  assert.equal(body.strategy, "deezer-direct");
  assert.equal(body.recognition.title, "Test Song");
  assert.equal(body.recognition.providerIds.deezer, "456");
  assert.equal(body.recognition.previewUrl, "https://audio.test/deezer.mp3");
  assert.equal(body.recognition.artworkUrl, "https://art.test/deezer.jpg");
  assert.equal(body.evidence.crossCatalogConfirmed, false);
  assert.ok(f.calls.some((call) => hasHostname(call.url, "api.music.apple.com")));
});
