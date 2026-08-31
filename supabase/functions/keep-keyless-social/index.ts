import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CANONICAL_PATH = "/functions/v1/keep-music-keyless-source";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

/**
 * Alias de compatibilité uniquement.
 * `keep-music-keyless-source` est l'unique moteur sans clé de KEEP. Les
 * anciennes installations qui appellent encore ce slug historique reçoivent
 * exactement le même résultat, sans second algorithme ni second scoring.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!SUPABASE_URL) return json(503, { ok: false, error: "canonical_resolver_unavailable", recognition: null });

  try {
    const body = await req.text();
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}${CANONICAL_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: req.headers.get("apikey") || SUPABASE_ANON_KEY,
        Authorization: req.headers.get("authorization") || `Bearer ${SUPABASE_ANON_KEY}`,
        "x-keep-device-id": req.headers.get("x-keep-device-id") || "legacy-keyless-client",
      },
      body,
      signal: AbortSignal.timeout(14000),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "x-keep-compatibility-proxy": "keep-music-keyless-source",
      },
    });
  } catch {
    return json(200, {
      ok: false,
      provider: "KEYLESS_SOURCE",
      compatibilityAlias: true,
      recognition: null,
      reason: "canonical_resolver_unavailable",
    });
  }
});
