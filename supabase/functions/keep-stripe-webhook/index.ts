import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (15/09/2026) : "on va utiliser le stripe de insidedombe" -- second
// rail de paiement (abonnements) a cote de Paddle, compte Stripe "Loki"
// d'Inside Dombe. Meme garde-fou que keep-paddle-webhook/keep-iap-verify :
// aucune ecriture sans verification cryptographique prealable de la
// signature Stripe. Fetch brut (pas de SDK Stripe) pour rester coherent avec
// le reste du projet (Mailjet/Brevo/AudD/ACRCloud sont tous en fetch direct).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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

// Format Stripe : "t=<epoch_secondes>,v1=<hmac_sha256_hex>[,v1=<hex_precedent>]",
// calcule sur "<t>.<corps_brut_exact>" (voir https://docs.stripe.com/webhooks#verify-manually).
// Une signature valide pour N'IMPORTE LEQUEL des v1 presents suffit (rotation de secret).
async function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const v1List = parts.filter((p) => p[0] === "v1").map((p) => p[1]).filter(Boolean) as string[];
  if (!t || v1List.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = bytesToHex(signature);
  return v1List.some((v1) => timingSafeEqual(expected, v1));
}

async function fetchStripeSubscription(subscriptionId: string, secretKey: string): Promise<any | null> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function subscriptionFields(subscription: any) {
  return {
    stripePriceId: String(subscription?.items?.data?.[0]?.price?.id ?? "").trim(),
    status: String(subscription?.status ?? "").trim(),
    currentPeriodStart: subscription?.current_period_start ? new Date(Number(subscription.current_period_start) * 1000).toISOString() : null,
    currentPeriodEnd: subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
  };
}

async function upsertFromSubscription(profileId: string, subscription: any) {
  const fields = subscriptionFields(subscription);
  if (!fields.stripePriceId) return json(200, { ok: true, skipped: "missing_price_id" });
  const { error } = await admin.rpc("service_stripe_upsert_subscription", {
    p_profile_id: profileId,
    p_stripe_subscription_id: String(subscription.id),
    p_stripe_price_id: fields.stripePriceId,
    p_status: fields.status,
    p_current_period_start: fields.currentPeriodStart,
    p_current_period_end: fields.currentPeriodEnd,
    p_cancel_at_period_end: fields.cancelAtPeriodEnd,
  });
  if (error) {
    console.error("[keep-stripe-webhook] service_stripe_upsert_subscription failed", error);
    return json(500, { ok: false, error: error.message });
  }
  return json(200, { ok: true });
}

async function handleCheckoutCompleted(session: any, secretKey: string) {
  if (session?.mode !== "subscription") return json(200, { ok: true, ignored: "not_a_subscription_session" });
  const profileId = String(session?.client_reference_id ?? "").trim();
  const subscriptionId = String(session?.subscription ?? "").trim();
  if (!profileId || !subscriptionId) return json(200, { ok: true, skipped: "missing_fields" });

  const subscription = await fetchStripeSubscription(subscriptionId, secretKey);
  if (!subscription) return json(200, { ok: true, skipped: "subscription_fetch_failed" });
  return upsertFromSubscription(profileId, subscription);
}

async function handleSubscriptionEvent(subscription: any) {
  const subscriptionId = String(subscription?.id ?? "").trim();
  if (!subscriptionId) return json(200, { ok: true, skipped: "missing_subscription_id" });

  // Un customer.subscription.created/updated ne porte pas le profileId --
  // seul checkout.session.completed l'a. On retrouve le profil deja lie
  // (cree par ce premier evenement) pour les mises a jour suivantes
  // (renouvellement, changement de statut, annulation).
  const { data: existing, error } = await admin.rpc("service_stripe_find_subscription", { p_stripe_subscription_id: subscriptionId });
  if (error) {
    console.error("[keep-stripe-webhook] service_stripe_find_subscription failed", error);
    return json(500, { ok: false, error: error.message });
  }
  const profileId = existing?.[0]?.profile_id ?? null;
  if (!profileId) return json(200, { ok: true, skipped: "subscription_not_found_yet" });
  return upsertFromSubscription(profileId, subscription);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const rawBody = await req.text();
  const secret = await integrationSecret("STRIPE_WEBHOOK_SECRET");
  const validSignature = await verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret);
  if (!validSignature) {
    console.error("[keep-stripe-webhook] invalid or missing signature");
    return json(401, { ok: false, error: "invalid_signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const eventType = String(payload?.type ?? "");
  const secretKey = await integrationSecret("STRIPE_SECRET_KEY");
  try {
    if (eventType === "checkout.session.completed") return await handleCheckoutCompleted(payload?.data?.object ?? {}, secretKey);
    if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
      return await handleSubscriptionEvent(payload?.data?.object ?? {});
    }
    return json(200, { ok: true, ignored: eventType });
  } catch (error) {
    console.error("[keep-stripe-webhook]", error);
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
