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

const CATALOG: Record<string, { category: string; label: string; secret?: boolean }> = {
  BREVO_API_KEY: { category: "email", label: "Brevo API key", secret: true },
  BREVO_SMTP_KEY: { category: "email", label: "Brevo SMTP key", secret: true },
  BREVO_SMTP_LOGIN: { category: "email", label: "Brevo SMTP login" },
  BREVO_SENDER_EMAIL: { category: "email", label: "E-mail expéditeur Loki" },
  BREVO_SENDER_NAME: { category: "email", label: "Nom expéditeur Loki" },
  SPOTIFY_CLIENT_ID: { category: "music", label: "Spotify Client ID" },
  SPOTIFY_CLIENT_SECRET: { category: "music", label: "Spotify Client Secret", secret: true },
  DEEZER_APP_ID: { category: "music", label: "Deezer App ID" },
  DEEZER_APP_SECRET: { category: "music", label: "Deezer App Secret", secret: true },
  APPLE_MUSICKIT_TEAM_ID: { category: "music", label: "Apple MusicKit Team ID" },
  APPLE_MUSICKIT_KEY_ID: { category: "music", label: "Apple MusicKit Key ID" },
  APPLE_MUSICKIT_PRIVATE_KEY: { category: "music", label: "Apple MusicKit Private Key", secret: true },
  MUSICAPI_CLIENT_ID: { category: "music", label: "MusicAPI — clé catalogue unifié", secret: true },
  MUSICAPI_CLIENT_SECRET: { category: "music", label: "MusicAPI — secret SSO bibliothèques", secret: true },
  PIPEDREAM_CLIENT_ID: { category: "automation", label: "Pipedream Connect — Client ID" },
  PIPEDREAM_CLIENT_SECRET: { category: "automation", label: "Pipedream Connect — Client Secret", secret: true },
  PIPEDREAM_PROJECT_ID: { category: "automation", label: "Pipedream Connect — Project ID" },
  PIPEDREAM_ENVIRONMENT: { category: "automation", label: "Pipedream Connect — environnement" },
  AUDD_API_KEY: { category: "recognition", label: "AudD API key", secret: true },
  ACRCLOUD_ACCESS_KEY: { category: "recognition", label: "ACRCloud Access Key", secret: true },
  ACRCLOUD_ACCESS_SECRET: { category: "recognition", label: "ACRCloud Access Secret", secret: true },
  ACRCLOUD_HOST: { category: "recognition", label: "ACRCloud Host" },
  APPLE_IAP_ISSUER_ID: { category: "payments", label: "Apple IAP Issuer ID" },
  APPLE_IAP_KEY_ID: { category: "payments", label: "Apple IAP Key ID" },
  APPLE_IAP_PRIVATE_KEY: { category: "payments", label: "Apple IAP Private Key", secret: true },
  GOOGLE_PLAY_PACKAGE_NAME: { category: "payments", label: "Google Play Package Name" },
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: { category: "payments", label: "Google Play Service Account JSON", secret: true },
  STRIPE_SECRET_KEY: { category: "payments", label: "Stripe Secret Key", secret: true },
  STRIPE_WEBHOOK_SECRET: { category: "payments", label: "Stripe Webhook Secret", secret: true },
};

const ADMIN_TEAM_ROLES = ["ADMIN", "SUPPORT", "FINANCE", "MARKETING", "MODERATOR", "TECH"] as const;
type AdminActor = { id: string; role: string };

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function hint(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.includes("@") && !clean.includes(" ")) {
    const [left, domain] = clean.split("@");
    return `${left.slice(0, 2)}•••@${domain}`;
  }
  if (clean.length <= 8) return "••••••••";
  return `${clean.slice(0, 3)}••••••${clean.slice(-4)}`;
}

function existingEdgeSecret(key: string): string | null {
  const value = Deno.env.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plausibleAuddToken(value: string | null | undefined): value is string {
  if (!value) return false;
  const clean = value.trim();
  if (clean.length < 16 || clean.length > 256 || /\s/.test(clean)) return false;
  if (/^(test|demo|null|none|todo|fake|key|token|1234)$/i.test(clean)) return false;
  return true;
}

type AuddValidation = { valid: boolean; status: "ACTIVE" | "EXHAUSTED" | "ERROR"; message: string };

async function validateAuddToken(value: string): Promise<AuddValidation> {
  if (!plausibleAuddToken(value)) {
    return { valid: false, status: "ERROR", message: "Clé AudD invalide : le token est trop court ou ressemble à une valeur de test." };
  }

  const form = new FormData();
  form.append("api_token", value);
  let response: Response;
  try {
    response = await fetch("https://api.audd.io/", { method: "POST", body: form });
  } catch {
    return { valid: false, status: "ERROR", message: "Impossible de joindre AudD pour valider la clé. Réessaie sans enregistrer une clé non vérifiée." };
  }

  const payload = await response.json().catch(() => null);
  const code = Number(payload?.error?.error_code ?? payload?.error?.code ?? 0);
  const providerMessage = String(payload?.error?.error_message || payload?.error?.message || payload?.message || `AudD HTTP ${response.status}`);
  if (code === 900 || code === 901 || /invalid\s+(?:api\s*)?(?:key|token)|authorization|no api[_ -]?token/i.test(providerMessage)) {
    return { valid: false, status: "ERROR", message: "AudD a refusé ce token. Rien n'a été enregistré." };
  }
  if (response.status === 402 || /quota|credit|balance|limit\s+(?:reached|exceeded)|payment|subscription|exhaust/i.test(providerMessage)) {
    return { valid: true, status: "EXHAUSTED", message: "Token AudD authentifié, mais quota/crédit fournisseur épuisé." };
  }
  // AudD #700 = authentification acceptée, fichier audio absent. C'est le test
  // volontaire utilisé ici pour valider le token sans consommer une reconnaissance.
  if (code === 700 || payload?.status === "success") {
    return { valid: true, status: "ACTIVE", message: "Token AudD vérifié par le fournisseur." };
  }
  return { valid: false, status: "ERROR", message: `AudD n'a pas confirmé le token (${providerMessage.slice(0, 160)}). Rien n'a été enregistré.` };
}

async function validateMusicApiClientId(value: string) {
  const clean = value.trim();
  if (clean.length < 16 || clean.length > 160 || /\s/.test(clean)) {
    return { valid: false, status: "ERROR" as const, message: "Clé MusicAPI invalide ou incomplète." };
  }
  try {
    const response = await fetch("https://api.musicapi.com/search/introspection", {
      headers: { Authorization: `Token ${clean}`, "content-type": "application/json; charset=utf-8" },
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json().catch(() => null);
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    if (!response.ok || sources.length === 0) {
      return { valid: false, status: "ERROR" as const, message: `MusicAPI a refusé la clé (HTTP ${response.status}).` };
    }
    return {
      valid: true,
      status: "ACTIVE" as const,
      message: `MusicAPI vérifié : ${sources.length} catalogues unifiés disponibles.`,
      sources,
      authSources: Array.isArray(payload?.authSources) ? payload.authSources : [],
    };
  } catch {
    return { valid: false, status: "ERROR" as const, message: "Impossible de joindre MusicAPI pour vérifier la clé." };
  }
}

async function validatePipedreamCredentials(clientId: string, clientSecret: string, projectId: string) {
  try {
    const response = await fetch("https://api.pipedream.com/v1/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return { valid: false, status: "ERROR" as const, message: `Pipedream a refusé les identifiants (HTTP ${response.status}).` };
    }
    const payload = await response.json().catch(() => ({}));
    if (!payload?.access_token) return { valid: false, status: "ERROR" as const, message: "Pipedream n'a pas renvoyé de jeton d'accès." };
    if (!/^proj_/i.test(projectId)) return { valid: false, status: "ERROR" as const, message: "Project ID Pipedream invalide." };
    return { valid: true, status: "OK" as const, message: "Pipedream Connect vérifié et prêt pour les fenêtres d'autorisation." };
  } catch {
    return { valid: false, status: "ERROR" as const, message: "Impossible de joindre Pipedream pour vérifier les identifiants." };
  }
}

type AcrCloudValidation = { valid: boolean; status: "ACTIVE" | "EXHAUSTED" | "ERROR"; message: string; providerCode?: number };

function normalizeAcrCloudHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function plausibleAcrCloudHost(value: string) {
  const host = normalizeAcrCloudHost(value);
  return /^[a-z0-9.-]+\.acrcloud\.com$/.test(host) && !host.includes("..") && host.length <= 180;
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
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
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
}

async function validateAcrCloudCredentials(hostValue: string, accessKey: string, accessSecret: string): Promise<AcrCloudValidation> {
  const host = normalizeAcrCloudHost(hostValue);
  if (!plausibleAcrCloudHost(hostValue)) {
    return { valid: false, status: "ERROR", message: "Hôte ACRCloud invalide. Utilise le host identify-….acrcloud.com fourni par ton projet ACRCloud." };
  }
  if (accessKey.trim().length < 8 || accessSecret.trim().length < 8 || /\s/.test(accessKey.trim()) || /\s/.test(accessSecret.trim())) {
    return { valid: false, status: "ERROR", message: "Access Key ou Access Secret ACRCloud invalide ou incomplet." };
  }

  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = [httpMethod, httpUri, accessKey.trim(), dataType, signatureVersion, timestamp].join("\n");
  const signature = await hmacSha1Base64(accessSecret.trim(), stringToSign);
  const wav = silentWavBytes();
  const form = new FormData();
  form.append("sample", new Blob([wav], { type: "audio/wav" }), "keep-credential-check.wav");
  form.append("access_key", accessKey.trim());
  form.append("sample_bytes", String(wav.byteLength));
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);

  let response: Response;
  try {
    response = await fetch(`https://${host}${httpUri}`, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  } catch {
    return { valid: false, status: "ERROR", message: "Impossible de joindre l'hôte ACRCloud. Vérifie le Host avant sauvegarde." };
  }

  const payload = await response.json().catch(() => null);
  const code = Number(payload?.status?.code ?? -1);
  const providerMessage = String(payload?.status?.msg || `ACRCloud HTTP ${response.status}`);

  // Documentation ACRCloud : 0=succès, 1001=aucun résultat ; ces réponses
  // prouvent que Host + Access Key + signature sont acceptés. Un petit WAV
  // silencieux peut aussi retourner 2004 (empreinte impossible), après auth.
  if (code === 0 || code === 1001 || code === 2004) {
    return { valid: true, status: "ACTIVE", message: "Credentials ACRCloud vérifiés par le fournisseur.", providerCode: code };
  }
  if (code === 3003 || code === 3015) {
    return { valid: true, status: "EXHAUSTED", message: `Credentials ACRCloud authentifiés, mais quota/limite fournisseur atteint (${code}).`, providerCode: code };
  }
  if (code === 3001) return { valid: false, status: "ERROR", message: "ACRCloud refuse l'Access Key. Rien n'a été activé.", providerCode: code };
  if (code === 3014) return { valid: false, status: "ERROR", message: "ACRCloud refuse la signature : vérifie l'Access Secret. Rien n'a été activé.", providerCode: code };
  if (code === 3000) return { valid: false, status: "ERROR", message: "ACRCloud signale un hôte/service incorrect. Rien n'a été activé.", providerCode: code };
  return { valid: false, status: "ERROR", message: `ACRCloud n'a pas confirmé les credentials (${code}: ${providerMessage.slice(0, 140)}). Rien n'a été activé.`, providerCode: code };
}

async function setRecognitionRuntimeStatus(key: string, status: string, message: string | null) {
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key,
    status,
    last_checked_at: now,
    last_error: status === "ACTIVE" ? null : message,
    updated_at: now,
  }, { onConflict: "key" });
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `K!${body}7`;
}

function syntheticKeepEmail(userId: string) {
  return `${userId.toLowerCase()}@keep.local`;
}

function assertRole(actor: AdminActor, allowed: string[]) {
  if (!allowed.includes(actor.role)) throw new Error("role_forbidden");
}

async function requireAdmin(req: Request): Promise<AdminActor> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("unauthorized");

  const { data: role, error: roleError } = await admin
    .from("admin_users")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (roleError || !role) throw new Error("admin_required");
  return { id: userData.user.id, role: String(role.role) };
}

async function audit(actorId: string, action: string, targetType: string, targetId: string | null, after: unknown) {
  await admin.from("audit_logs").insert({
    actor_admin_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    before: null,
    after,
  });
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  if (typeof data === "string" && data.trim()) return data.trim();
  return existingEdgeSecret(key);
}

async function resetIntegrationRuntimeStatus(key: string, configured: boolean) {
  const runtimeKey = key.startsWith("ACRCLOUD_") ? "ACRCLOUD" : key;
  if (runtimeKey !== "AUDD_API_KEY" && runtimeKey !== "ACRCLOUD") return;
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key: runtimeKey,
    status: configured ? "UNKNOWN" : "NOT_CONFIGURED",
    last_checked_at: now,
    last_error: configured ? "Configuration enregistrée, validation fournisseur en attente." : null,
    updated_at: now,
  }, { onConflict: "key" });
}

async function findAuthUserByEmail(email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function findAuthUserByIdentity(identity: string) {
  const raw = identity.trim();
  if (!raw) return null;
  if (raw.includes("@")) return findAuthUserByEmail(raw.toLowerCase());

  const username = raw.replace(/^@+/, "").normalize("NFKC");
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id,username")
    .ilike("username", username)
    .limit(2);
  if (profileError) throw profileError;
  if (!profiles?.length) return null;
  if (profiles.length > 1) throw new Error("ambiguous_username");

  const { data, error } = await admin.auth.admin.getUserById(profiles[0].id);
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const actor = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "plans.list") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "FINANCE"]);
      const { data, error } = await admin
        .from("plans")
        .select("id,code,name,trial_days,plan_prices(id,currency_code,period,amount,is_active)")
        .order("code");
      if (error) throw error;
      return json(200, { data: data ?? [] });
    }

    if (action === "plans.update") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "FINANCE"]);
      const planId = String(body?.planId ?? "").trim();
      const trialDays = Number(body?.trialDays ?? 0);
      const prices = Array.isArray(body?.prices) ? body.prices : [];
      if (!planId) return json(400, { error: "plan_id_required" });
      if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return json(400, { error: "invalid_trial_days" });
      if (prices.length > 8) return json(400, { error: "too_many_prices" });

      const { error: planError } = await admin.from("plans").update({ trial_days: trialDays }).eq("id", planId);
      if (planError) throw planError;

      const updatedPrices: { id: string; amount: number }[] = [];
      for (const price of prices) {
        const id = String(price?.id ?? "").trim();
        const amount = Number(price?.amount);
        if (!id || !Number.isFinite(amount) || amount < 0 || amount > 100000) return json(400, { error: "invalid_price" });
        const { error: priceError } = await admin
          .from("plan_prices")
          .update({ amount })
          .eq("id", id)
          .eq("plan_id", planId);
        if (priceError) throw priceError;
        updatedPrices.push({ id, amount });
      }

      await audit(actor.id, "plan.updated", "plan", planId, { trialDays, prices: updatedPrices });
      return json(200, { ok: true, planId, trialDays, prices: updatedPrices });
    }

    if (action === "integrations.list") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "TECH"]);
      const { data, error } = await admin
        .from("integration_secrets")
        .select("key,category,value_hint,is_configured,updated_at")
        .order("category")
        .order("key");
      if (error) throw error;
      const indexed = new Map((data ?? []).map((row: any) => [row.key, row]));
      return json(200, {
        data: Object.entries(CATALOG).map(([key, meta]) => {
          const row: any = indexed.get(key);
          const edgeConfigured = Boolean(existingEdgeSecret(key));
          const vaultConfigured = Boolean(row?.is_configured);
          return {
            key,
            ...meta,
            configured: vaultConfigured || edgeConfigured,
            hint: row?.value_hint ?? (edgeConfigured ? "configuré côté serveur" : null),
            updatedAt: row?.updated_at ?? null,
            source: vaultConfigured ? "VAULT" : edgeConfigured ? "EDGE_SECRET" : null,
          };
        }),
      });
    }

    if (action === "integrations.set") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "TECH"]);
      const key = String(body?.key ?? "");
      const value = String(body?.value ?? "").trim();
      const meta = CATALOG[key];
      if (!meta) return json(400, { error: "integration_key_not_allowed" });
      if (!value) return json(400, { error: "value_required" });
      const providerValidation = key === "AUDD_API_KEY" ? await validateAuddToken(value) : null;
      if (providerValidation && !providerValidation.valid) {
        await resetIntegrationRuntimeStatus(key, false);
        return json(400, { error: "invalid_audd_token", message: providerValidation.message, validation: providerValidation });
      }
      const musicApiValidation = key === "MUSICAPI_CLIENT_ID" ? await validateMusicApiClientId(value) : null;
      if (musicApiValidation && !musicApiValidation.valid) {
        await resetIntegrationRuntimeStatus(key, false);
        return json(400, { error: "invalid_musicapi_client_id", message: musicApiValidation.message, validation: musicApiValidation });
      }

      let pipedreamValidation: Awaited<ReturnType<typeof validatePipedreamCredentials>> | null = null;
      let pipedreamBundleComplete = false;
      if (key.startsWith("PIPEDREAM_")) {
        if (key === "PIPEDREAM_ENVIRONMENT" && value !== "development" && value !== "production") {
          return json(400, { error: "invalid_pipedream_environment", message: "Utilise development ou production." });
        }
        const [savedClientId, savedClientSecret, savedProjectId] = await Promise.all([
          key === "PIPEDREAM_CLIENT_ID" ? Promise.resolve(value) : getSecret("PIPEDREAM_CLIENT_ID"),
          key === "PIPEDREAM_CLIENT_SECRET" ? Promise.resolve(value) : getSecret("PIPEDREAM_CLIENT_SECRET"),
          key === "PIPEDREAM_PROJECT_ID" ? Promise.resolve(value) : getSecret("PIPEDREAM_PROJECT_ID"),
        ]);
        pipedreamBundleComplete = Boolean(savedClientId && savedClientSecret && savedProjectId);
        if (pipedreamBundleComplete) {
          pipedreamValidation = await validatePipedreamCredentials(String(savedClientId), String(savedClientSecret), String(savedProjectId));
          if (!pipedreamValidation.valid) return json(400, { error: "invalid_pipedream_credentials", message: pipedreamValidation.message, validation: pipedreamValidation });
        }
      }

      let acrValidation: AcrCloudValidation | null = null;
      let acrBundleComplete = false;
      if (key.startsWith("ACRCLOUD_")) {
        const [savedAccessKey, savedAccessSecret, savedHost] = await Promise.all([
          key === "ACRCLOUD_ACCESS_KEY" ? Promise.resolve(value) : getSecret("ACRCLOUD_ACCESS_KEY"),
          key === "ACRCLOUD_ACCESS_SECRET" ? Promise.resolve(value) : getSecret("ACRCLOUD_ACCESS_SECRET"),
          key === "ACRCLOUD_HOST" ? Promise.resolve(value) : getSecret("ACRCLOUD_HOST"),
        ]);
        acrBundleComplete = Boolean(savedAccessKey && savedAccessSecret && savedHost);
        if (acrBundleComplete) {
          acrValidation = await validateAcrCloudCredentials(String(savedHost), String(savedAccessKey), String(savedAccessSecret));
          if (!acrValidation.valid) {
            await setRecognitionRuntimeStatus("ACRCLOUD", "ERROR", acrValidation.message);
            return json(400, { error: "invalid_acrcloud_credentials", message: acrValidation.message, validation: acrValidation });
          }
        }
      }
      const valueHint = hint(value);
      const { error } = await admin.rpc("service_set_integration_secret", {
        p_key: key,
        p_category: meta.category,
        p_value: value,
        p_hint: valueHint,
        p_updated_by: actor.id,
      });
      if (error) throw error;
      if (key === "AUDD_API_KEY" && providerValidation) {
        await setRecognitionRuntimeStatus("AUDD_API_KEY", providerValidation.status, providerValidation.message);
      } else if (key.startsWith("ACRCLOUD_") && acrValidation) {
        await setRecognitionRuntimeStatus("ACRCLOUD", acrValidation.status, acrValidation.message);
      } else if (key.startsWith("ACRCLOUD_") && !acrBundleComplete) {
        await setRecognitionRuntimeStatus("ACRCLOUD", "NOT_CONFIGURED", "Configuration ACRCloud incomplète : renseigne Host + Access Key + Access Secret.");
      } else if (key === "MUSICAPI_CLIENT_ID" && musicApiValidation) {
        await setRecognitionRuntimeStatus("MUSICAPI_CLIENT_ID", musicApiValidation.status, musicApiValidation.message);
      } else if (key.startsWith("PIPEDREAM_") && pipedreamValidation) {
        await setRecognitionRuntimeStatus("PIPEDREAM_CONNECT", pipedreamValidation.status, pipedreamValidation.message);
      } else if (key.startsWith("PIPEDREAM_") && !pipedreamBundleComplete) {
        await setRecognitionRuntimeStatus("PIPEDREAM_CONNECT", "NOT_CONFIGURED", "Configuration Pipedream incomplète : Client ID + Client Secret + Project ID requis.");
      } else {
        await resetIntegrationRuntimeStatus(key, true);
      }
      const validation = providerValidation ?? acrValidation ?? musicApiValidation ?? pipedreamValidation;
      await audit(actor.id, "integration_secret.updated", "integration_secret", key, { key, category: meta.category, hint: valueHint, validation });
      return json(200, { ok: true, key, configured: true, hint: valueHint, validation, recognitionReady: key.startsWith("ACRCLOUD_") ? Boolean(acrValidation?.valid) : undefined });
    }

    if (action === "integrations.delete") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "TECH"]);
      const key = String(body?.key ?? "");
      if (!CATALOG[key]) return json(400, { error: "integration_key_not_allowed" });
      const { error } = await admin.rpc("service_delete_integration_secret", { p_key: key });
      if (error) throw error;
      const edgeStillActive = Boolean(existingEdgeSecret(key));
      if (key.startsWith("ACRCLOUD_")) {
        await setRecognitionRuntimeStatus("ACRCLOUD", "NOT_CONFIGURED", "Configuration ACRCloud incomplète après suppression d'un credential.");
      } else {
        await resetIntegrationRuntimeStatus(key, edgeStillActive);
      }
      await audit(actor.id, "integration_secret.deleted", "integration_secret", key, { key, configured: edgeStillActive });
      return json(200, { ok: true, configured: edgeStillActive, legacyEdgeSecretStillActive: edgeStillActive });
    }

    if (action === "integrations.test_email") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "TECH"]);
      const email = String(body?.email ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "invalid_email" });
      const apiKey = await getSecret("BREVO_API_KEY");
      const senderEmail = await getSecret("BREVO_SENDER_EMAIL");
      const senderName = (await getSecret("BREVO_SENDER_NAME")) ?? "Loki";
      if (!apiKey || !senderEmail) return json(409, { error: "brevo_not_configured", message: "Renseigne BREVO_API_KEY et BREVO_SENDER_EMAIL." });

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": apiKey, accept: "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email }],
          subject: "Loki — test e-mail réussi",
          htmlContent: `<div style="background:#07070d;padding:32px;font-family:Arial,sans-serif;color:#fff"><div style="max-width:560px;margin:auto;background:#151021;border:1px solid #382a55;border-radius:24px;padding:32px"><div style="font-size:28px;font-weight:900;letter-spacing:8px">Loki</div><h2 style="margin-top:28px">Ton e-mail Loki est bien connecté.</h2><p style="color:#c8bfd8;line-height:1.6">Tes goûts te ressemblent. Partage ton Loki DNA, fais grandir ta communauté.</p></div></div>`,
          textContent: "Loki — ton e-mail est bien connecté. Tes goûts te ressemblent. Partage ton Loki DNA, fais grandir ta communauté.",
        }),
      });
      const details = await response.text();
      if (!response.ok) return json(response.status, { error: "brevo_send_failed", details: details.slice(0, 500) });
      await audit(actor.id, "integration_email.tested", "brevo", email, { ok: true });
      return json(200, { ok: true, provider: "brevo" });
    }

    if (action === "users.invite") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "invalid_email" });
      const existing = await findAuthUserByEmail(email);
      if (existing) return json(409, { error: "user_already_exists", userId: existing.id });
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://adelkhatra-bit.github.io/KEEP/",
      });
      if (error) throw error;
      await audit(actor.id, "user.invited", "auth_user", data.user?.id ?? null, { email });
      return json(200, { ok: true, userId: data.user?.id ?? null });
    }

    if (action === "users.recover_legacy") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
      const username = String(body?.username ?? "").trim().replace(/^@+/, "");
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return json(400, { error: "invalid_username" });

      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id,username")
        .ilike("username", username)
        .limit(2);
      if (profileError) throw profileError;
      if (!profiles?.length) return json(404, { error: "profile_not_found" });
      if (profiles.length > 1) return json(409, { error: "ambiguous_username" });

      const profile = profiles[0];
      const { data: authData, error: authError } = await admin.auth.admin.getUserById(profile.id);
      if (authError || !authData.user) return json(404, { error: "auth_user_not_found" });
      if (!authData.user.is_anonymous) {
        return json(409, { error: "not_legacy_anonymous", message: "Ce profil possède déjà un vrai compte Loki." });
      }

      const temporaryPassword = generateTemporaryPassword();
      const syntheticEmail = syntheticKeepEmail(profile.id);
      const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
        email: syntheticEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          ...(authData.user.user_metadata ?? {}),
          keep_username: profile.username,
          keep_username_key: String(profile.username).normalize("NFKC").toLowerCase(),
          recovered_from_legacy_trial: true,
        },
      });
      if (updateError) throw updateError;

      await audit(actor.id, "user.legacy_recovered", "profile", profile.id, {
        username: profile.username,
        authMode: "username_password",
        preservedProfileId: true,
      });
      return json(200, {
        ok: true,
        username: profile.username,
        temporaryPassword,
        message: "Profil récupéré sans changer son identifiant, sa photo ni ses données.",
      });
    }

    if (action === "users.grant") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN"]);
      const identity = String(body?.identity ?? body?.email ?? "").trim();
      const planCode = String(body?.planCode ?? "").trim().toUpperCase();
      const months = Number(body?.months ?? 0);
      const reason = String(body?.reason ?? "").trim();
      if (!identity) return json(400, { error: "identity_required" });
      if (!Number.isInteger(months) || months < 0 || months > 60) return json(400, { error: "invalid_duration" });
      if (!["FREE", "PREMIUM", "CREATOR_PRO", "VENUE_PRO"].includes(planCode)) return json(400, { error: "invalid_plan" });
      const user = await findAuthUserByIdentity(identity);
      if (!user) return json(404, { error: "user_not_found" });
      const { data: profile } = await admin.from("profiles").select("id,username").eq("id", user.id).maybeSingle();
      if (!profile) return json(409, { error: "profile_not_ready", message: "L’utilisateur doit ouvrir Loki une première fois avant l’attribution." });
      const { data, error } = await admin.rpc("service_grant_plan", {
        p_profile_id: user.id,
        p_plan_code: planCode,
        p_months: months,
        p_granted_by: actor.id,
        p_reason: reason || "Offert depuis le Super Admin Loki",
      });
      if (error) throw error;
      await audit(actor.id, "subscription.admin_granted", "profile", user.id, { identity, username: profile.username, planCode, months, reason });
      return json(200, { ok: true, data, username: profile.username });
    }

    if (action === "users.revoke_grant") {
      assertRole(actor, ["SUPER_ADMIN", "ADMIN"]);
      const identity = String(body?.identity ?? body?.email ?? "").trim();
      if (!identity) return json(400, { error: "identity_required" });
      const user = await findAuthUserByIdentity(identity);
      if (!user) return json(404, { error: "user_not_found" });
      const { data, error } = await admin.rpc("service_revoke_admin_grant", {
        p_profile_id: user.id,
        p_granted_by: actor.id,
      });
      if (error) throw error;
      await audit(actor.id, "subscription.admin_revoked", "profile", user.id, { identity, revoked: Number(data ?? 0) });
      return json(200, { ok: true, revoked: Number(data ?? 0) });
    }

    if (action === "admins.list") {
      assertRole(actor, ["SUPER_ADMIN"]);
      const { data: rows, error } = await admin
        .from("admin_users")
        .select("id,role,is_active,created_at")
        .order("created_at");
      if (error) throw error;
      const result = [];
      for (const row of rows ?? []) {
        const { data: authData } = await admin.auth.admin.getUserById(row.id);
        result.push({
          id: row.id,
          email: authData.user?.email ?? null,
          role: String(row.role),
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
        });
      }
      return json(200, { data: result });
    }

    if (action === "admins.create") {
      assertRole(actor, ["SUPER_ADMIN"]);
      const email = String(body?.email ?? "").trim().toLowerCase();
      const role = String(body?.role ?? "").trim().toUpperCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "invalid_email" });
      if (!ADMIN_TEAM_ROLES.includes(role as any)) return json(400, { error: "invalid_admin_role" });

      let user = await findAuthUserByEmail(email);
      let temporaryPassword = "";
      let created = false;
      if (!user) {
        temporaryPassword = generateTemporaryPassword();
        const { data: createData, error: createError } = await admin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { keep_admin_created: true },
        });
        if (createError || !createData.user) throw createError ?? new Error("admin_user_create_failed");
        user = createData.user;
        created = true;
      }

      const { data: existingAdmin } = await admin.from("admin_users").select("role").eq("id", user.id).maybeSingle();
      if (existingAdmin?.role === "SUPER_ADMIN") return json(409, { error: "super_admin_protected" });

      const { error: upsertError } = await admin.from("admin_users").upsert({ id: user.id, role, is_active: true }, { onConflict: "id" });
      if (upsertError) throw upsertError;
      await audit(actor.id, "admin_member.created", "admin_user", user.id, { email, role, created });
      return json(200, { ok: true, adminId: user.id, role, temporaryPassword: created ? temporaryPassword : null, existingUser: !created });
    }

    if (action === "admins.update") {
      assertRole(actor, ["SUPER_ADMIN"]);
      const adminId = String(body?.adminId ?? "").trim();
      const role = String(body?.role ?? "").trim().toUpperCase();
      const isActive = Boolean(body?.isActive);
      if (!adminId) return json(400, { error: "admin_id_required" });
      if (!["SUPER_ADMIN", ...ADMIN_TEAM_ROLES].includes(role as any)) return json(400, { error: "invalid_admin_role" });
      if (adminId === actor.id && (!isActive || role !== "SUPER_ADMIN")) return json(409, { error: "cannot_demote_self" });

      const { data: target, error: targetError } = await admin.from("admin_users").select("id,role,is_active").eq("id", adminId).maybeSingle();
      if (targetError || !target) return json(404, { error: "admin_not_found" });
      if (String(target.role) === "SUPER_ADMIN" && adminId !== actor.id) return json(409, { error: "super_admin_protected" });

      const { error: updateError } = await admin.from("admin_users").update({ role, is_active: isActive }).eq("id", adminId);
      if (updateError) throw updateError;
      await audit(actor.id, "admin_member.updated", "admin_user", adminId, { role, isActive });
      return json(200, { ok: true, adminId, role, isActive });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "admin_required" || message === "role_forbidden" ? 403 : 500;
    return json(status, { error: message });
  }
});
