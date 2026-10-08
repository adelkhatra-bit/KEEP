import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { checkIntegrations } from "../../supabase/functions/_shared/integrationChecks.ts";
import { ACTIVE_INTEGRATION_KEYS } from "../../supabase/functions/_shared/integrationUsage.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const deps = {
  getSecret: async () => "fixture",
  appleToken: async () => "fixture-token",
  spotifyToken: async () => "fixture-token",
  audd: async () => ({ valid: true, status: "ACTIVE", message: "Confirmé" }),
  acrcloud: async () => ({ valid: true, status: "ACTIVE", message: "Confirmé" }),
};

test("les clés manquantes ne déclenchent aucun appel fournisseur", async () => {
  globalThis.fetch = async () => { throw new Error("Unexpected fetch"); };
  const result = await checkIntegrations({ ...deps, getSecret: async () => null });
  assert.equal(result.length, ACTIVE_INTEGRATION_KEYS.length);
  assert.ok(result.every((row) => row.status === "NOT_CONFIGURED"));
});

test("les appels catalogue, traduction et expéditeur doivent réellement réussir", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("brevo.com")) return Response.json({ senders: [{ email: "fixture", active: true }] });
    if (url.includes("translation.googleapis.com")) return Response.json({ data: { translations: [{ translatedText: "Hello" }] } });
    return Response.json({});
  };
  const result = await checkIntegrations(deps);
  assert.ok(result.every((row) => row.status === "ACTIVE"));
  assert.ok(urls.some((url) => url.includes("/v1/catalog/fr/search?")));
  assert.ok(urls.some((url) => url.includes("api.spotify.com/v1/search?")));
});

test("un refus et un quota épuisé ne deviennent jamais OK", async () => {
  globalThis.fetch = async () => new Response(null, { status: 401 });
  const result = await checkIntegrations({
    ...deps,
    audd: async () => ({ valid: true, status: "EXHAUSTED", message: "Quota" }),
  });
  assert.equal(result.find((row) => row.key === "APPLE_MUSICKIT_KEY_ID")?.status, "ERROR");
  assert.equal(result.find((row) => row.key === "AUDD_API_KEY")?.status, "ERROR");
  assert.ok(result.every((row) => !row.message.includes("fixture")));
});

test("un bundle incomplet distingue le secret absent des compagnons inutilisables", async () => {
  globalThis.fetch = async () => new Response(null, { status: 401 });
  const result = await checkIntegrations({
    ...deps,
    getSecret: async (key) => key === "SPOTIFY_CLIENT_SECRET" ? null : "fixture",
    spotifyToken: async () => { throw new Error("Bundle incomplet"); },
  });
  assert.equal(result.find((row) => row.key === "SPOTIFY_CLIENT_SECRET")?.status, "NOT_CONFIGURED");
  assert.equal(result.find((row) => row.key === "SPOTIFY_CLIENT_ID")?.status, "ERROR");
});
