import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function secret(key: string): Promise<string> {
  const { data } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function protectVariables(text: string): { safe: string; vars: string[] } {
  const vars: string[] = [];
  const safe = text.replace(/\{\{[^{}]+\}\}/g, (value) => {
    const index = vars.push(value) - 1;
    return `__LOKI_VAR_${index}__`;
  });
  return { safe, vars };
}

function restoreVariables(text: string, vars: string[]): string {
  return vars.reduce((value, token, index) => value.replaceAll(`__LOKI_VAR_${index}__`, token), text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  const source = String(body?.source || "en").trim().toLowerCase().slice(0, 16);
  const target = String(body?.target || "").trim().toLowerCase().slice(0, 16);
  const texts = Array.isArray(body?.texts) ? body.texts.map((x: unknown) => String(x ?? "")) : [];
  if (!target || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(target)) return json(400, { error: "invalid_target" });
  if (!texts.length || texts.length > 128) return json(400, { error: "invalid_text_count" });
  if (texts.some((x: string) => x.length > 5000) || texts.join("").length > 30000) return json(413, { error: "translation_payload_too_large" });
  if (target === source) return json(200, { ok: true, target, translations: texts, provider: "LOCAL" });

  const hashes = await Promise.all(texts.map((value: string) => sha256(value)));
  const cached = new Map<string,string>();
  const { data: cachedRows } = await admin
    .from("ui_translation_cache")
    .select("source_hash,translated_text")
    .eq("source_lang", source)
    .eq("target_lang", target)
    .in("source_hash", hashes);
  for (const row of cachedRows ?? []) cached.set(String(row.source_hash), String(row.translated_text));

  const missingIndexes = hashes.map((hash, index) => cached.has(hash) ? -1 : index).filter((index) => index >= 0);
  if (missingIndexes.length) {
    const apiKey = await secret("GOOGLE_TRANSLATE_API_KEY");
    if (!apiKey) return json(503, { error: "translation_not_configured", cached: cached.size });

    const protectedItems = missingIndexes.map((index) => protectVariables(texts[index]));
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: protectedItems.map((item) => item.safe), source, target, format: "text" }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.data?.translations)) {
      return json(response.status || 502, { error: "translation_provider_failed", detail: payload?.error?.message || "unknown" });
    }

    const rows:any[] = [];
    payload.data.translations.forEach((item:any, position:number) => {
      const originalIndex = missingIndexes[position];
      const restored = restoreVariables(String(item?.translatedText ?? texts[originalIndex]), protectedItems[position].vars);
      cached.set(hashes[originalIndex], restored);
      rows.push({
        source_lang: source,
        target_lang: target,
        source_hash: hashes[originalIndex],
        source_text: texts[originalIndex],
        translated_text: restored,
        provider: "GOOGLE_TRANSLATE",
        updated_at: new Date().toISOString(),
      });
    });
    if (rows.length) await admin.from("ui_translation_cache").upsert(rows, { onConflict: "source_lang,target_lang,source_hash" });
  }

  return json(200, {
    ok: true,
    target,
    translations: hashes.map((hash, index) => cached.get(hash) ?? texts[index]),
    provider: "GOOGLE_TRANSLATE",
  });
});
