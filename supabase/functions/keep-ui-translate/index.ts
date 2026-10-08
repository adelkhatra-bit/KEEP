import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user || auth.user.is_anonymous) return json(401, { error: "authentication_required" });
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const target = typeof body.target === "string" ? body.target : "";
    if (!text || text.length > 2000 || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(target)) {
      return json(400, { error: "invalid_translation_request" });
    }
    const identityBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ui-translate:${auth.user.id}`)));
    const identityHash = Array.from(identityBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { data: allowed, error: rateError } = await admin.rpc("service_allow_recognition", {
      p_identity_hash: identityHash, p_limit: 20, p_window_seconds: 60,
    }).abortSignal(AbortSignal.timeout(5000));
    if (rateError || allowed !== true) return json(429, { error: "translation_rate_limited" });
    const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: "GOOGLE_TRANSLATE_API_KEY" }).abortSignal(AbortSignal.timeout(5000));
    const key = !error && typeof data === "string" && data.trim() ? data.trim() : (Deno.env.get("GOOGLE_TRANSLATE_API_KEY") ?? "").trim();
    if (!key) return json(503, { error: "translation_not_configured" });
    const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ q: text, target, format: "text" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json(502, { error: "translation_provider_refused", providerStatus: response.status });
    const payload = await response.json();
    const translatedText = payload?.data?.translations?.[0]?.translatedText;
    if (typeof translatedText !== "string") return json(502, { error: "invalid_translation_response" });
    return json(200, { translatedText });
  } catch {
    return json(502, { error: "translation_unavailable" });
  }
});
