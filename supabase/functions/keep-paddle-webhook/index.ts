import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (08/09/2026) : "je vis a Dubai, j'ai pas de societe" -- Paddle choisi
// comme merchant of record (Paddle est le vendeur legal partout dans le
// monde, gere la TVA a notre place, accepte un particulier sans societe
// enregistree). Ce webhook est le seul endroit qui fait vraiment confiance a
// un evenement Paddle : verification HMAC obligatoire avant toute ecriture,
// exactement comme keep-iap-verify verifie cryptographiquement Apple avant
// d'activer un abonnement.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Format Paddle : "ts=<epoch_secondes>;h1=<hmac_sha256_hex>", calcule sur
// "<ts>:<corps_brut_exact>" (voir https://developer.paddle.com/webhooks/signature-verification).
async function verifyPaddleSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(";").map((part) => part.split("=") as [string, string]));
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  return timingSafeEqual(bytesToHex(signature), h1);
}

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.canceled",
  "subscription.paused",
  "subscription.resumed",
]);

async function handleSubscriptionEvent(data: any) {
  const profileId = String(data?.custom_data?.profileId ?? "").trim();
  const paddleSubscriptionId = String(data?.id ?? "").trim();
  const paddlePriceId = String(data?.items?.[0]?.price?.id ?? "").trim();
  if (!profileId || !paddleSubscriptionId || !paddlePriceId) {
    console.error("[keep-paddle-webhook] subscription event missing profileId/subscriptionId/priceId", data?.id);
    return json(200, { ok: true, skipped: "missing_fields" }); // 200 : ne jamais faire retenter Paddle indefiniment sur un evenement qu'on ne pourra jamais completer.
  }
  const { error } = await admin.rpc("service_paddle_upsert_subscription", {
    p_profile_id: profileId,
    p_paddle_subscription_id: paddleSubscriptionId,
    p_paddle_price_id: paddlePriceId,
    p_status: String(data?.status ?? "").trim(),
    p_current_period_start: data?.current_billing_period?.starts_at ?? null,
    p_current_period_end: data?.current_billing_period?.ends_at ?? null,
    p_cancel_at_period_end: Boolean(data?.scheduled_change?.action === "cancel"),
  });
  if (error) {
    console.error("[keep-paddle-webhook] service_paddle_upsert_subscription failed", error);
    return json(500, { ok: false, error: error.message });
  }
  return json(200, { ok: true });
}

async function handleTransactionCompleted(data: any) {
  // Best-effort : enrichit la transaction (montant/taxe/frais) si un
  // abonnement Paddle correspondant existe deja cote Loki -- une transaction
  // ne suffit jamais a elle seule a activer un plan (la source de verite
  // reste les evenements subscription.*).
  const profileId = String(data?.custom_data?.profileId ?? "").trim();
  const paddleSubscriptionId = String(data?.subscription_id ?? "").trim();
  const paddlePriceId = String(data?.items?.[0]?.price?.id ?? "").trim();
  if (!profileId || !paddleSubscriptionId || !paddlePriceId) return json(200, { ok: true, skipped: "missing_fields" });

  const { data: existing } = await admin
    .from("subscriptions")
    .select("status,current_period_start,current_period_end,cancel_at_period_end")
    .eq("channel", "WEB")
    .eq("store_original_transaction_id", paddleSubscriptionId)
    .maybeSingle();
  if (!existing) return json(200, { ok: true, skipped: "subscription_not_found_yet" });

  const totals = data?.details?.totals ?? {};
  const { error } = await admin.rpc("service_paddle_upsert_subscription", {
    p_profile_id: profileId,
    p_paddle_subscription_id: paddleSubscriptionId,
    p_paddle_price_id: paddlePriceId,
    p_status: existing.status,
    p_current_period_start: existing.current_period_start,
    p_current_period_end: existing.current_period_end,
    p_cancel_at_period_end: existing.cancel_at_period_end,
    p_paddle_transaction_id: String(data?.id ?? "").trim() || null,
    p_transaction_amount: totals?.total ? Number(totals.total) / 100 : null,
    p_transaction_tax: totals?.tax ? Number(totals.tax) / 100 : null,
    p_transaction_fee: totals?.fee ? Number(totals.fee) / 100 : null,
    p_raw_event: data,
  });
  if (error) console.error("[keep-paddle-webhook] transaction enrichment failed", error);
  return json(200, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const rawBody = await req.text();
  const secret = await integrationSecret("PADDLE_WEBHOOK_SECRET");
  const validSignature = await verifyPaddleSignature(rawBody, req.headers.get("paddle-signature"), secret);
  if (!validSignature) {
    console.error("[keep-paddle-webhook] invalid or missing signature");
    return json(401, { ok: false, error: "invalid_signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const eventType = String(payload?.event_type ?? "");
  try {
    if (SUBSCRIPTION_EVENTS.has(eventType)) return await handleSubscriptionEvent(payload?.data ?? {});
    if (eventType === "transaction.completed") return await handleTransactionCompleted(payload?.data ?? {});
    return json(200, { ok: true, ignored: eventType });
  } catch (error) {
    console.error("[keep-paddle-webhook]", error);
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
