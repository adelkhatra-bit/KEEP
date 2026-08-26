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
  BREVO_SENDER_EMAIL: { category: "email", label: "E-mail expéditeur KEEP" },
  BREVO_SENDER_NAME: { category: "email", label: "Nom expéditeur KEEP" },
  SPOTIFY_CLIENT_ID: { category: "music", label: "Spotify Client ID" },
  SPOTIFY_CLIENT_SECRET: { category: "music", label: "Spotify Client Secret", secret: true },
  DEEZER_APP_ID: { category: "music", label: "Deezer App ID" },
  DEEZER_APP_SECRET: { category: "music", label: "Deezer App Secret", secret: true },
  APPLE_MUSICKIT_TEAM_ID: { category: "music", label: "Apple MusicKit Team ID" },
  APPLE_MUSICKIT_KEY_ID: { category: "music", label: "Apple MusicKit Key ID" },
  APPLE_MUSICKIT_PRIVATE_KEY: { category: "music", label: "Apple MusicKit Private Key", secret: true },
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

async function requireAdmin(req: Request) {
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

  // Compatibilité non destructive : les premières APIs KEEP ont été stockées
  // dans les Secrets des Edge Functions avant l'arrivée du Vault. Elles restent
  // utilisables côté serveur et ne sont jamais renvoyées au navigateur.
  return existingEdgeSecret(key);
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
      const { data, error } = await admin
        .from("plans")
        .select("id,code,name,trial_days,plan_prices(id,currency_code,period,amount,is_active)")
        .order("code");
      if (error) throw error;
      return json(200, { data: data ?? [] });
    }

    if (action === "plans.update") {
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
      const key = String(body?.key ?? "");
      const value = String(body?.value ?? "").trim();
      const meta = CATALOG[key];
      if (!meta) return json(400, { error: "integration_key_not_allowed" });
      if (!value) return json(400, { error: "value_required" });
      const valueHint = hint(value);
      const { error } = await admin.rpc("service_set_integration_secret", {
        p_key: key,
        p_category: meta.category,
        p_value: value,
        p_hint: valueHint,
        p_updated_by: actor.id,
      });
      if (error) throw error;
      await audit(actor.id, "integration_secret.updated", "integration_secret", key, { key, category: meta.category, hint: valueHint });
      return json(200, { ok: true, key, configured: true, hint: valueHint });
    }

    if (action === "integrations.delete") {
      const key = String(body?.key ?? "");
      if (!CATALOG[key]) return json(400, { error: "integration_key_not_allowed" });
      const { error } = await admin.rpc("service_delete_integration_secret", { p_key: key });
      if (error) throw error;
      await audit(actor.id, "integration_secret.deleted", "integration_secret", key, { key, configured: Boolean(existingEdgeSecret(key)) });
      return json(200, { ok: true, configured: Boolean(existingEdgeSecret(key)), legacyEdgeSecretStillActive: Boolean(existingEdgeSecret(key)) });
    }

    if (action === "integrations.test_email") {
      const email = String(body?.email ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "invalid_email" });
      const apiKey = await getSecret("BREVO_API_KEY");
      const senderEmail = await getSecret("BREVO_SENDER_EMAIL");
      const senderName = (await getSecret("BREVO_SENDER_NAME")) ?? "KEEP";
      if (!apiKey || !senderEmail) return json(409, { error: "brevo_not_configured", message: "Renseigne BREVO_API_KEY et BREVO_SENDER_EMAIL." });

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": apiKey, accept: "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email }],
          subject: "KEEP — test e-mail réussi",
          htmlContent: `<div style="background:#07070d;padding:32px;font-family:Arial,sans-serif;color:#fff"><div style="max-width:560px;margin:auto;background:#151021;border:1px solid #382a55;border-radius:24px;padding:32px"><div style="font-size:28px;font-weight:900;letter-spacing:8px">KEEP</div><h2 style="margin-top:28px">Ton e-mail KEEP est bien connecté.</h2><p style="color:#c8bfd8;line-height:1.6">Tes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.</p></div></div>`,
          textContent: "KEEP — ton e-mail est bien connecté. Tes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.",
        }),
      });
      const details = await response.text();
      if (!response.ok) return json(response.status, { error: "brevo_send_failed", details: details.slice(0, 500) });
      await audit(actor.id, "integration_email.tested", "brevo", email, { ok: true });
      return json(200, { ok: true, provider: "brevo" });
    }

    if (action === "users.invite") {
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
        return json(409, { error: "not_legacy_anonymous", message: "Ce profil possède déjà un vrai compte KEEP." });
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
      const identity = String(body?.identity ?? body?.email ?? "").trim();
      const planCode = String(body?.planCode ?? "").trim().toUpperCase();
      const months = Number(body?.months ?? 0);
      const reason = String(body?.reason ?? "").trim();
      if (!identity) return json(400, { error: "identity_required" });
      if (!Number.isInteger(months) || months < 1 || months > 60) return json(400, { error: "invalid_duration" });
      if (!['FREE','PREMIUM','CREATOR_PRO','VENUE_PRO'].includes(planCode)) return json(400, { error: "invalid_plan" });
      const user = await findAuthUserByIdentity(identity);
      if (!user) return json(404, { error: "user_not_found" });
      const { data: profile } = await admin.from("profiles").select("id,username").eq("id", user.id).maybeSingle();
      if (!profile) return json(409, { error: "profile_not_ready", message: "L’utilisateur doit ouvrir KEEP une première fois avant l’attribution." });
      const { data, error } = await admin.rpc("service_grant_plan", {
        p_profile_id: user.id,
        p_plan_code: planCode,
        p_months: months,
        p_granted_by: actor.id,
        p_reason: reason || "Offert depuis le Super Admin KEEP",
      });
      if (error) throw error;
      await audit(actor.id, "subscription.admin_granted", "profile", user.id, { identity, username: profile.username, planCode, months, reason });
      return json(200, { ok: true, data, username: profile.username });
    }

    if (action === "users.revoke_grant") {
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

    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "admin_required" ? 403 : 500;
    return json(status, { error: message });
  }
});