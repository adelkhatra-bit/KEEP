import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignedDataVerifier, Environment } from "npm:@apple/app-store-server-library@1.6.0";

/**
 * Adel (15/09/2026) : "fait l'integration pour Apple Store" -- App Store
 * Server Notifications V2 : Apple appelle cette URL en temps reel a chaque
 * renouvellement/annulation/remboursement d'un abonnement IAP, pour qu'on
 * n'ait plus a attendre que le client rouvre l'app pour resynchroniser le
 * statut. Meme garde-fou que keep-paddle-webhook/keep-stripe-webhook :
 * aucune ecriture sans verification cryptographique prealable -- ici, la
 * signature JWS d'Apple contre son certificat racine officiel (meme
 * verifier que keep-iap-verify, duplique volontairement : chaque edge
 * function Deno est deployee separement, voir le meme choix documente pour
 * shellHtml avant l'extraction de _shared/lokiEmailShell.ts).
 */
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

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

// Une notification de production et une notification sandbox (App Store
// Connect "Demander une notification de test") ne sont jamais signees pour
// le meme environnement -- on tente les deux, comme keep-iap-verify.
async function verifyNotification(signedPayload: string) {
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const verifier = new SignedDataVerifier([rootCertBytes()], true, environment, BUNDLE_ID);
      const notification = await verifier.verifyAndDecodeNotification(signedPayload);
      return { verifier, notification };
    } catch {
      continue;
    }
  }
  return null;
}

async function findProfileIdByOriginalTransaction(originalTransactionId: string): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("profile_id")
    .eq("channel", "APPLE_IAP")
    .eq("store_original_transaction_id", originalTransactionId)
    .maybeSingle();
  return data?.profile_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const body = await req.json().catch(() => null);
  const signedPayload = String(body?.signedPayload ?? "").trim();
  if (!signedPayload) return json(400, { ok: false, error: "missing_signed_payload" });

  const verified = await verifyNotification(signedPayload);
  if (!verified) {
    console.error("[keep-apple-notifications] invalid or unverifiable signedPayload");
    return json(401, { ok: false, error: "invalid_signature" });
  }
  const { verifier, notification } = verified;

  try {
    if (notification.data?.bundleId && notification.data.bundleId !== BUNDLE_ID) {
      return json(200, { ok: true, ignored: "bundle_mismatch" });
    }

    const signedTransactionInfo = notification.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      // Notification de test ("Request a Test Notification") ou type sans
      // transaction associee -- rien a synchroniser, mais on confirme la
      // reception a Apple (200) pour eviter des reessais inutiles.
      return json(200, { ok: true, ignored: "no_transaction_info", notificationType: notification.notificationType });
    }

    const transaction = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    const originalTransactionId = String(transaction.originalTransactionId ?? "").trim();
    const transactionId = String(transaction.transactionId ?? "").trim();
    if (!originalTransactionId) return json(200, { ok: true, skipped: "missing_original_transaction_id" });

    const planCode = PRODUCT_PLAN_MAP[String(transaction.productId ?? "")];
    if (!planCode) return json(200, { ok: true, skipped: "unknown_product", productId: transaction.productId });

    const appAccountToken = transaction.appAccountToken ? String(transaction.appAccountToken).trim() : "";
    const profileId = appAccountToken || (await findProfileIdByOriginalTransaction(originalTransactionId));
    if (!profileId) return json(200, { ok: true, skipped: "subscription_not_found_yet" });

    const { data: plan, error: planError } = await admin.from("plans").select("id").eq("code", planCode).maybeSingle();
    if (planError || !plan) return json(500, { ok: false, error: "plan_not_found" });
    const { data: price, error: priceError } = await admin
      .from("plan_prices")
      .select("id,amount,currency_code")
      .eq("plan_id", plan.id)
      .eq("period", "MONTHLY")
      .eq("is_active", true)
      .maybeSingle();
    if (priceError || !price) return json(500, { ok: false, error: "plan_price_not_found" });

    const revoked = Boolean(transaction.revocationDate);
    const expiresAtMs = Number(transaction.expiresDate ?? 0);
    const expired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
    const active = !revoked && !expired;
    const currentPeriodEnd = Number.isFinite(expiresAtMs) && expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null;
    const currentPeriodStart = transaction.purchaseDate ? new Date(Number(transaction.purchaseDate)).toISOString() : new Date().toISOString();

    const subRow = {
      profile_id: profileId,
      plan_id: plan.id,
      plan_price_id: price.id,
      channel: "APPLE_IAP",
      status: revoked ? "CANCELLED" : expired ? "EXPIRED" : "ACTIVE",
      store_original_transaction_id: originalTransactionId,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
      source: "app_store_iap",
    };

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("channel", "APPLE_IAP")
      .eq("store_original_transaction_id", originalTransactionId)
      .maybeSingle();

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
          profile_id: profileId,
          subscription_id: subscriptionId,
          channel: "APPLE_IAP",
          status: "SUCCEEDED",
          amount: price.amount,
          currency_code: price.currency_code,
          store_transaction_id: transactionId,
          raw_receipt: { notificationType: notification.notificationType, subtype: notification.subtype, transaction },
        });
      }
    }

    return json(200, { ok: true, active, notificationType: notification.notificationType });
  } catch (error) {
    console.error("[keep-apple-notifications]", error);
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
