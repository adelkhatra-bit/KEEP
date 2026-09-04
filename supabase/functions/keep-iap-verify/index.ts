import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignedDataVerifier, Environment } from "npm:@apple/app-store-server-library@1.6.0";

/**
 * Adel (04/09/2026) : "il faut qu'on branche le paiement" -- vérifie côté
 * serveur une transaction StoreKit 2 signée par Apple (jwsRepresentation)
 * avant d'activer un abonnement. Ne fait JAMAIS confiance à ce que le
 * client prétend avoir acheté : la signature est vérifiée cryptographiquement
 * contre le certificat racine Apple ci-dessous.
 *
 * Ce certificat est le vrai "Apple Root CA - G3" officiel, téléchargé
 * directement depuis https://www.apple.com/certificateauthority/ et vérifié
 * (sujet + validité 2014-2039) avant d'être copié ici -- pas improvisé.
 */
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

// Adel (04/09/2026) : identifiants de produit -- doivent correspondre EXACTEMENT
// à ceux créés dans App Store Connect (voir iapService.ts côté client, source
// commune documentée là-bas).
const BUNDLE_ID = "com.adelkhatra.keep";
const PRODUCT_PLAN_MAP: Record<string, string> = {
  "com.adelkhatra.keep.premium.monthly": "PREMIUM",
  "com.adelkhatra.keep.creatorpro.monthly": "CREATOR_PRO",
  "com.adelkhatra.keep.venuepro.monthly": "VENUE_PRO",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });

function rootCertBytes(): Uint8Array {
  const bin = atob(APPLE_ROOT_CA_G3_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function verifyTransaction(jws: string) {
  // Une transaction TestFlight/sandbox et une transaction App Store réelle
  // ne sont jamais signées pour le même environnement -- on tente les deux
  // plutôt que de supposer laquelle a produit cette transaction.
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const verifier = new SignedDataVerifier([rootCertBytes()], true, environment, BUNDLE_ID);
      return await verifier.verifyAndDecodeTransaction(jws);
    } catch {
      continue;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { error: "unauthorized" });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "unauthorized" });
    const uid = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const jws = String(body?.jws ?? "").trim();
    if (!jws) return json(400, { error: "missing_jws" });

    const payload = await verifyTransaction(jws);
    if (!payload) return json(400, { error: "invalid_transaction" });

    // Adel : "interdiction de récupérer des données d'une autre app" -- ce
    // garde-fou empêche aussi qu'une transaction d'un AUTRE bundle Apple
    // (une future app séparée sur le même compte, par exemple) active un
    // abonnement KEEP par erreur.
    if (payload.bundleId && payload.bundleId !== BUNDLE_ID) return json(403, { error: "bundle_mismatch" });
    if (payload.appAccountToken && payload.appAccountToken !== uid) return json(403, { error: "account_mismatch" });

    const planCode = PRODUCT_PLAN_MAP[String(payload.productId ?? "")];
    if (!planCode) return json(400, { error: "unknown_product" });

    const { data: plan, error: planError } = await admin.from("plans").select("id").eq("code", planCode).maybeSingle();
    if (planError || !plan) return json(500, { error: "plan_not_found" });

    const { data: price, error: priceError } = await admin
      .from("plan_prices")
      .select("id,amount,currency_code")
      .eq("plan_id", plan.id)
      .eq("period", "MONTHLY")
      .eq("is_active", true)
      .maybeSingle();
    if (priceError || !price) return json(500, { error: "plan_price_not_found" });

    const originalTransactionId = String(payload.originalTransactionId ?? payload.transactionId ?? "");
    const transactionId = String(payload.transactionId ?? "");
    const revoked = Boolean(payload.revocationDate);
    const currentPeriodEnd = payload.expiresDate ? new Date(Number(payload.expiresDate)).toISOString() : null;
    const currentPeriodStart = payload.purchaseDate ? new Date(Number(payload.purchaseDate)).toISOString() : new Date().toISOString();

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("profile_id", uid)
      .eq("store_original_transaction_id", originalTransactionId)
      .maybeSingle();

    const subRow = {
      profile_id: uid,
      plan_id: plan.id,
      plan_price_id: price.id,
      channel: "APPLE_IAP",
      status: revoked ? "CANCELLED" : "ACTIVE",
      store_original_transaction_id: originalTransactionId,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
      source: "app_store_iap",
    };

    let subscriptionId: string;
    if (existingSub) {
      const { error: updateError } = await admin.from("subscriptions").update(subRow).eq("id", existingSub.id);
      if (updateError) throw updateError;
      subscriptionId = existingSub.id;
    } else {
      const { data: inserted, error: insertError } = await admin.from("subscriptions").insert(subRow).select("id").single();
      if (insertError) throw insertError;
      subscriptionId = inserted.id;
    }

    if (transactionId) {
      const { data: existingTxn } = await admin.from("transactions").select("id").eq("store_transaction_id", transactionId).maybeSingle();
      if (!existingTxn) {
        await admin.from("transactions").insert({
          profile_id: uid,
          subscription_id: subscriptionId,
          channel: "APPLE_IAP",
          status: "SUCCEEDED",
          amount: price.amount,
          currency_code: price.currency_code,
          store_transaction_id: transactionId,
          raw_receipt: payload,
        });
      }
    }

    return json(200, { ok: true, planCode, currentPeriodEnd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message });
  }
});
