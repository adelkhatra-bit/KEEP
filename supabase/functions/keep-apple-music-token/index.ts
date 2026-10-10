import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
function b64url(data: Uint8Array) {
  let str = "";
  for (const value of data) str += String.fromCharCode(value);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const encode = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));
function pkcs8(pem: string) {
  const clean = pem.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length < 80) throw new Error("invalid_musickit_key");
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return Deno.env.get(key)?.trim() || null;
}
let cached: { token: string; expiresAt: number } | null = null;
let cacheKey = "";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });
  try {
    const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!auth) return response(401, { error: "auth_required" });
    const { data: { user }, error: authError } = await admin.auth.getUser(auth);
    if (authError || !user || user.is_anonymous) return response(401, { error: "auth_required" });
    const [teamId, keyId, privateKey] = await Promise.all([
      getSecret("APPLE_MUSICKIT_TEAM_ID"),
      getSecret("APPLE_MUSICKIT_KEY_ID"),
      getSecret("APPLE_MUSICKIT_PRIVATE_KEY"),
    ]);
    if (!teamId || !keyId || !privateKey) return response(503, { error: "musickit_not_configured" });
    const now = Math.floor(Date.now() / 1000);
    // One-hour token, generated only on the server. Cache identity does not include secret material.
    const identity = teamId + ":" + keyId;
    if (cached && cacheKey === identity && cached.expiresAt - now > 300) {
      return response(200, cached);
    }
    const key = await crypto.subtle.importKey("pkcs8", pkcs8(privateKey), {
      name: "ECDSA", namedCurve: "P-256",
    }, false, ["sign"]);
    const expiresAt = now + 3600;
    const input = encode({ alg: "ES256", kid: keyId }) + "." +
      encode({ iss: teamId, iat: now, exp: expiresAt });
    // WebCrypto ECDSA returns IEEE-P1363 r||s (JWS ES256 wire format).
    const signature = new Uint8Array(await crypto.subtle.sign({
      name: "ECDSA", hash: "SHA-256",
    }, key, new TextEncoder().encode(input)));
    if (signature.length !== 64) throw new Error("invalid_signature_size");
    cached = { token: input + "." + b64url(signature), expiresAt };
    cacheKey = identity;
    return response(200, cached);
  } catch (error) {
    console.error("[keep-apple-music-token] failure", error instanceof Error ? error.name : "unknown");
    return response(503, { error: "musickit_token_temporarily_unavailable" });
  }
});
