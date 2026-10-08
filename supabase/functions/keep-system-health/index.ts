import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { probeProviders } from "../_shared/providerHealth.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
});

export async function authorized(req: Request) {
  const supplied = req.headers.get("x-keep-worker-key");
  if (!supplied || supplied.length > 256) return false;
  const { data, error } = await admin.from("keep_internal_worker_secrets").select("secret_hash").eq("name", "system-health-worker").maybeSingle();
  if (error || !data?.secret_hash) return false;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)));
  return [...hash].map((x) => x.toString(16).padStart(2, "0")).join("") === data.secret_hash;
}

async function secret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw new Error("SECRET_READ_FAILED");
  return typeof data === "string" && data.trim() ? data.trim() : (Deno.env.get(key) || "").trim();
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    if (!(await authorized(req))) return json({ error: "UNAUTHORIZED" }, 401);
    const results = await probeProviders(secret);
    const { error } = await admin.rpc("service_record_system_health", { p_results: results });
    if (error) return json({ error: "HEALTH_PERSIST_FAILED" }, 503);
    const { error: collectError } = await admin.rpc("service_collect_system_health");
    if (collectError) return json({ error: "SYSTEM_OBSERVATION_FAILED" }, 503);
    return json({ ok: true, checked: results.length }, 200);
  } catch {
    return json({ error: "HEALTH_WORKER_FAILED" }, 503);
  }
});
