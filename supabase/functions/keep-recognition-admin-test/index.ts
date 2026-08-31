import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type RuntimeStatus = "ACTIVE" | "EXHAUSTED" | "ERROR" | "NOT_CONFIGURED";
type ProviderResult = {
  provider: "KEYLESS_SOURCE" | "AUDD" | "ACRCLOUD";
  status: RuntimeStatus;
  configured: boolean;
  message: string;
  checkedAt: string;
  providerCode?: number;
};

type AdminActor = { id: string; role: string };

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

async function requireAdmin(req: Request): Promise<AdminActor> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("unauthorized");
  const { data: role, error: roleError } = await admin
    .from("admin_users")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (roleError || !role || !["SUPER_ADMIN", "ADMIN", "TECH"].includes(String(role.role))) {
    throw new Error("admin_required");
  }
  return { id: userData.user.id, role: String(role.role) };
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  const edge = Deno.env.get(key);
  return typeof edge === "string" && edge.trim() ? edge.trim() : null;
}

async function setRuntimeStatus(key: string, status: RuntimeStatus, message: string | null) {
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key,
    status,
    last_checked_at: now,
    last_error: status === "ACTIVE" ? null : message,
    updated_at: now,
  }, { onConflict: "key" });
}

async function audit(actorId: string, providers: ProviderResult[]) {
  await admin.from("audit_logs").insert({
    actor_admin_id: actorId,
    action: "recognition.providers.tested",
    target_type: "integration_health",
    target_id: "recognition",
    before: null,
    after: {
      providers: providers.map((item) => ({
        provider: item.provider,
        status: item.status,
        configured: item.configured,
        message: item.message,
        providerCode: item.providerCode ?? null,
      })),
    },
  });
}

function plausibleAuddToken(value: string | null): value is string {
  if (!value) return false;
  const clean = value.trim();
  return clean.length >= 16 && clean.length <= 256 && !/\s/.test(clean)
    && !/^(test|demo|null|none|todo|fake|key|token|1234)$/i.test(clean);
}

async function testAudd(): Promise<ProviderResult> {
  const checkedAt = new Date().toISOString();
  const token = await getSecret("AUDD_API_KEY");
  if (!plausibleAuddToken(token)) {
    const result: ProviderResult = {
      provider: "AUDD", status: "NOT_CONFIGURED", configured: false,
      message: "Aucun token AudD valide n'est configuré. Loki continue avec ShazamKit/fallback gratuit.", checkedAt,
    };
    await setRuntimeStatus("AUDD_API_KEY", result.status, result.message);
    return result;
  }

  const form = new FormData();
  form.append("api_token", token);
  try {
    const response = await fetch("https://api.audd.io/", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json().catch(() => null);
    const code = Number(payload?.error?.error_code ?? payload?.error?.code ?? 0);
    const detail = String(payload?.error?.error_message || payload?.error?.message || payload?.message || `AudD HTTP ${response.status}`);

    let result: ProviderResult;
    if (code === 900 || code === 901 || /invalid\s+(?:api\s*)?(?:key|token)|authorization|no api[_ -]?token/i.test(detail)) {
      result = { provider: "AUDD", status: "ERROR", configured: true, message: "AudD refuse le token actuellement enregistré.", checkedAt, providerCode: code };
    } else if (response.status === 402 || /quota|credit|balance|limit\s+(?:reached|exceeded)|payment|subscription|exhaust/i.test(detail)) {
      result = { provider: "AUDD", status: "EXHAUSTED", configured: true, message: "Token AudD authentifié, mais quota/crédit fournisseur épuisé.", checkedAt, providerCode: code };
    } else if (code === 700 || payload?.status === "success") {
      result = { provider: "AUDD", status: "ACTIVE", configured: true, message: "Token AudD vérifié en direct auprès du fournisseur.", checkedAt, providerCode: code };
    } else {
      result = { provider: "AUDD", status: "ERROR", configured: true, message: `AudD n'a pas confirmé le token (${detail.slice(0, 140)}).`, checkedAt, providerCode: code };
    }
    await setRuntimeStatus("AUDD_API_KEY", result.status, result.message);
    return result;
  } catch {
    const result: ProviderResult = { provider: "AUDD", status: "ERROR", configured: true, message: "AudD est temporairement injoignable.", checkedAt };
    await setRuntimeStatus("AUDD_API_KEY", result.status, result.message);
    return result;
  }
}

function normalizeAcrCloudHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function hmacSha1Base64(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(signed);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function silentWavBytes(durationMs = 650, sampleRate = 8000) {
  const samples = Math.max(1, Math.floor(sampleRate * durationMs / 1000));
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeAscii(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); writeAscii(8, "WAVE");
  writeAscii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(36, "data"); view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
}

async function testAcrCloud(): Promise<ProviderResult> {
  const checkedAt = new Date().toISOString();
  const [hostRaw, accessKey, accessSecret] = await Promise.all([
    getSecret("ACRCLOUD_HOST"),
    getSecret("ACRCLOUD_ACCESS_KEY"),
    getSecret("ACRCLOUD_ACCESS_SECRET"),
  ]);
  const host = hostRaw ? normalizeAcrCloudHost(hostRaw) : "";
  if (!host || !accessKey || !accessSecret || !/^[a-z0-9.-]+\.acrcloud\.com$/.test(host)) {
    const result: ProviderResult = {
      provider: "ACRCLOUD", status: "NOT_CONFIGURED", configured: false,
      message: "ACRCloud incomplet. Renseigne Host + Access Key + Access Secret pour activer ce secours.", checkedAt,
    };
    await setRuntimeStatus("ACRCLOUD", result.status, result.message);
    return result;
  }

  const httpUri = "/v1/identify";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha1Base64(accessSecret, ["POST", httpUri, accessKey, "audio", "1", timestamp].join("\n"));
  const wav = silentWavBytes();
  const form = new FormData();
  form.append("sample", new Blob([wav], { type: "audio/wav" }), "keep-provider-test.wav");
  form.append("access_key", accessKey);
  form.append("sample_bytes", String(wav.byteLength));
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("data_type", "audio");
  form.append("signature_version", "1");

  try {
    const response = await fetch(`https://${host}${httpUri}`, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => null);
    const code = Number(payload?.status?.code ?? -1);
    const detail = String(payload?.status?.msg || `ACRCloud HTTP ${response.status}`);
    let result: ProviderResult;
    if ([0, 1001, 2004].includes(code)) {
      result = { provider: "ACRCLOUD", status: "ACTIVE", configured: true, message: "Credentials ACRCloud vérifiés en direct auprès du fournisseur.", checkedAt, providerCode: code };
    } else if ([3003, 3015].includes(code)) {
      result = { provider: "ACRCLOUD", status: "EXHAUSTED", configured: true, message: "Credentials ACRCloud authentifiés, mais quota/limite atteint.", checkedAt, providerCode: code };
    } else {
      result = { provider: "ACRCLOUD", status: "ERROR", configured: true, message: `ACRCloud refuse ou ne confirme pas la configuration (${code}: ${detail.slice(0, 120)}).`, checkedAt, providerCode: code };
    }
    await setRuntimeStatus("ACRCLOUD", result.status, result.message);
    return result;
  } catch {
    const result: ProviderResult = { provider: "ACRCLOUD", status: "ERROR", configured: true, message: "ACRCloud est temporairement injoignable.", checkedAt };
    await setRuntimeStatus("ACRCLOUD", result.status, result.message);
    return result;
  }
}

async function testKeyless(): Promise<ProviderResult> {
  const checkedAt = new Date().toISOString();
  const [apple, deezer] = await Promise.all([
    fetch("https://itunes.apple.com/search?term=rick%20astley%20never%20gonna%20give%20you%20up&entity=song&limit=2&country=FR", {
      headers: { "User-Agent": "KEEP/1.0" }, signal: AbortSignal.timeout(8000),
    }).then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch("https://api.deezer.com/search?q=rick%20astley%20never%20gonna%20give%20you%20up&limit=2", {
      headers: { "User-Agent": "KEEP/1.0" }, signal: AbortSignal.timeout(8000),
    }).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  const appleOk = Array.isArray(apple?.results) && apple.results.some((row: any) => /never gonna give you up/i.test(String(row?.trackName || "")));
  const deezerOk = Array.isArray(deezer?.data) && deezer.data.some((row: any) => /never gonna give you up/i.test(String(row?.title || "")));
  const active = appleOk || deezerOk;
  const result: ProviderResult = {
    provider: "KEYLESS_SOURCE",
    status: active ? "ACTIVE" : "ERROR",
    configured: true,
    message: active
      ? `Fallback gratuit opérationnel (${[appleOk ? "Apple" : null, deezerOk ? "Deezer" : null].filter(Boolean).join(" + ")}).`
      : "Les catalogues publics sans clé sont temporairement injoignables.",
    checkedAt,
  };
  await setRuntimeStatus("KEYLESS_SOURCE", result.status, result.message);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const actor = await requireAdmin(req);
    const [keyless, audd, acrcloud] = await Promise.all([testKeyless(), testAudd(), testAcrCloud()]);
    const providers = [keyless, audd, acrcloud];
    await audit(actor.id, providers);
    return json(200, {
      ok: true,
      testedAt: new Date().toISOString(),
      secretExposed: false,
      providers,
      recognitionReady: providers.some((item) => item.status === "ACTIVE"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "admin_required" ? 403 : 500;
    return json(status, { ok: false, error: message, secretExposed: false });
  }
});
