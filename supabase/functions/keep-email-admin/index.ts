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

const DELIVERY_EVENTS = ["sent", "delivered", "hardBounce", "softBounce", "blocked", "spam", "invalid", "deferred"];
const FAILED_TYPES = new Set(["hard_bounce", "soft_bounce", "blocked", "spam", "invalid", "invalid_email", "error"]);

type AdminActor = { id: string; role: string };

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
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
  if (roleError || !role) throw new Error("admin_required");
  if (!["SUPER_ADMIN", "ADMIN", "TECH"].includes(String(role.role))) throw new Error("role_forbidden");
  return { id: userData.user.id, role: String(role.role) };
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  if (typeof data === "string" && data.trim()) return data.trim();
  const legacy = Deno.env.get(key);
  return typeof legacy === "string" && legacy.trim() ? legacy.trim() : null;
}

function tokenHint(value: string) {
  return value.length > 8 ? `${value.slice(0, 3)}••••••${value.slice(-4)}` : "••••••••";
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureWebhookToken(actorId: string) {
  const existing = await getSecret("BREVO_WEBHOOK_TOKEN");
  if (existing && existing.length >= 32) return existing;
  const token = randomToken();
  const { error } = await admin.rpc("service_set_integration_secret", {
    p_key: "BREVO_WEBHOOK_TOKEN",
    p_category: "email",
    p_value: token,
    p_hint: tokenHint(token),
    p_updated_by: actorId,
  });
  if (error) throw error;
  return token;
}

async function audit(actorId: string, action: string, after: unknown) {
  await admin.from("audit_logs").insert({
    actor_admin_id: actorId,
    action,
    target_type: "integration",
    target_id: "BREVO",
    before: null,
    after,
  });
}

async function brevoRequest(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = String(payload?.message || payload?.code || payload?.raw || `Brevo HTTP ${response.status}`);
    throw new Error(`brevo_${response.status}:${message.slice(0, 300)}`);
  }
  return payload;
}

async function ensureBrevoWebhook(actor: AdminActor) {
  const apiKey = await getSecret("BREVO_API_KEY");
  if (!apiKey) return json(409, { error: "brevo_not_configured", message: "Renseigne d’abord BREVO_API_KEY dans Clés & intégrations." });

  const webhookToken = await ensureWebhookToken(actor.id);
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/keep-brevo-webhook`;
  let list: any;
  try {
    list = await brevoRequest(apiKey, "/webhooks", { method: "GET" });
  } catch (error) {
    // Adel (12/09/2026, audit) : Brevo refuse GET /webhooks pour cette cle
    // ("Webhook record does not exist", teste avec et sans parametres de
    // requete -- pas un souci de parametres) -- probable restriction de
    // permission sur la cle API (certaines cles Brevo n'ont pas acces a la
    // gestion des webhooks). Erreur claire et actionnable plutot qu'une 500
    // technique : le suivi de delivrabilite reste facultatif, l'envoi reel
    // des e-mails (teste et confirme fonctionnel) n'en depend pas.
    const message = error instanceof Error ? error.message : String(error);
    return json(409, {
      error: "brevo_webhooks_unavailable",
      message: "Brevo refuse l'accès à la gestion des webhooks avec cette clé API (permission insuffisante sur le compte Brevo ?). L'envoi réel des e-mails n'est pas affecté -- seul le tableau de délivrabilité reste indisponible.",
      detail: message.slice(0, 300),
    });
  }
  const webhooks = Array.isArray(list?.webhooks) ? list.webhooks : [];
  const existing = webhooks.find((item: any) => String(item?.url || "") === url)
    ?? webhooks.find((item: any) => String(item?.description || "") === "KEEP transactional delivery");

  const definition = {
    url,
    description: "KEEP transactional delivery",
    events: DELIVERY_EVENTS,
    auth: { type: "bearer", token: webhookToken },
    batched: false,
  };

  let webhookId: number | null = null;
  let mode: "created" | "updated";
  let updateFailed = false;
  if (existing?.id) {
    try {
      await brevoRequest(apiKey, `/webhooks/${encodeURIComponent(String(existing.id))}`, {
        method: "PUT",
        body: JSON.stringify(definition),
      });
      webhookId = Number(existing.id);
      mode = "updated";
    } catch (error) {
      // Adel (11/09/2026, audit) : Brevo listait un webhook (meme url/description)
      // dont l'ID ne repondait plus a PUT ("Webhook record does not exist") --
      // reste probablement d'un webhook supprime cote Brevo pendant que la
      // restriction IP bloquait nos appels. On ne bloque plus "reparer" sur ce
      // cas : on repasse en creation au lieu de remonter une 500 seche.
      const message = error instanceof Error ? error.message : String(error);
      if (!/does not exist/i.test(message)) {
        return json(409, { error: "brevo_webhook_update_failed", message: "Impossible de mettre à jour le webhook Brevo existant.", detail: message.slice(0, 300) });
      }
      updateFailed = true;
    }
  }
  if (!existing?.id || updateFailed) {
    try {
      const created = await brevoRequest(apiKey, "/webhooks", {
        method: "POST",
        body: JSON.stringify({ ...definition, type: "transactional" }),
      });
      webhookId = Number(created?.id) || null;
      mode = "created";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json(409, { error: "brevo_webhook_create_failed", message: "Impossible de créer le webhook Brevo.", detail: message.slice(0, 300) });
    }
  }

  await audit(actor.id, "brevo.webhook.ensured", { webhookId, mode, url, events: DELIVERY_EVENTS });
  return json(200, { ok: true, webhookId, mode, events: DELIVERY_EVENTS, secretExposed: false });
}

function summarize(rows: any[], since: number) {
  const filtered = rows.filter((row) => new Date(row.occurred_at).getTime() >= since);
  let sent = 0;
  let delivered = 0;
  let failed = 0;
  let deferred = 0;
  for (const row of filtered) {
    const type = String(row.event_type || "");
    if (type === "sent") sent += 1;
    if (type === "delivered") delivered += 1;
    if (type === "deferred") deferred += 1;
    if (FAILED_TYPES.has(type)) failed += 1;
  }
  return { total: filtered.length, sent, delivered, failed, deferred };
}

async function diagnostics() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("email_delivery_events")
    .select("event_type,occurred_at,message_id,recipient_email,subject,reason,tags")
    .gte("occurred_at", since7d)
    .order("occurred_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const rows = data ?? [];
  const now = Date.now();
  return json(200, {
    ok: true,
    last24h: summarize(rows, now - 24 * 60 * 60 * 1000),
    last7d: summarize(rows, now - 7 * 24 * 60 * 60 * 1000),
    recent: rows.slice(0, 40).map((row: any) => ({
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      messageId: row.message_id,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      reason: row.reason,
      tags: row.tags,
    })),
    webhookTokenConfigured: Boolean(await getSecret("BREVO_WEBHOOK_TOKEN")),
    brevoConfigured: Boolean(await getSecret("BREVO_API_KEY")),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const actor = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "diagnostics");
    if (action === "diagnostics") return await diagnostics();
    if (action === "ensure_webhook") return await ensureBrevoWebhook(actor);
    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "unauthorized") return json(401, { error: message });
    if (message === "admin_required" || message === "role_forbidden") return json(403, { error: message });
    return json(500, { error: "email_admin_failed", message: message.slice(0, 500) });
  }
});
