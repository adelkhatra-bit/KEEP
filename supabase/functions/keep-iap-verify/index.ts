import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignedDataVerifier, Environment } from "npm:@apple/app-store-server-library@1.6.0";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

const BUNDLE_ID = "com.adelkhatra.keep";
const PRODUCT_PLAN_MAP: Record<string, string> = {
  "com.adelkhatra.keep.premium.monthly": "PREMIUM",
  "com.adelkhatra.keep.creatorpro.monthly": "CREATOR_PRO",
  "com.adelkhatra.keep.venuepro.monthly": "VENUE_PRO",
};
const FREE_PRODUCT_IDS = new Set([
  "com.adelkhatra.keep.free.30",
  "com.adelkhatra.keep.free.100",
  "com.adelkhatra.keep.free.300",
]);

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

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

async function verifyAppleTransaction(jws: string) {
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

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

async function googleAccessToken(): Promise<string | null> {
  const raw = await integrationSecret("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  let credentials: GoogleServiceAccount;
  try {
    credentials = JSON.parse(raw) as GoogleServiceAccount;
  } catch {
    return null;
  }
  if (!credentials.client_email || !credentials.private_key) return null;
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
  const key = await importPKCS8(credentials.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return typeof payload?.access_token === "string" ? payload.access_token : null;
}

async function verifyGoogleSubscription(
  uid: string,
  purchaseToken: string,
  requestedProductId: string,
  packageName: string,
) {
  if (!purchaseToken || packageName !== BUNDLE_ID) return { ok: false as const, status: 403, error: "package_mismatch" };
  const accessToken = await googleAccessToken();
  if (!accessToken) return { ok: false as const, status: 503, error: "google_play_not_configured" };

  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    encodeURIComponent(BUNDLE_ID) +
    "/purchases/subscriptionsv2/tokens/" +
    encodeURIComponent(purchaseToken);
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false as const, status: response.status === 404 ? 400 : 502, error: "google_play_verify_failed", detail: detail.slice(0, 300) };
  }

  const payload = await response.json();
  const accountId = String(payload?.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? "").trim();
  if (!accountId || accountId.toLowerCase() !== uid.toLowerCase()) {
    return { ok: false as const, status: 403, error: "account_mismatch" };
  }

  const lineItems = Array.isArray(payload?.lineItems) ? payload.lineItems : [];
  const line = lineItems.find((item: any) => String(item?.productId ?? "") === requestedProductId) ?? lineItems[0];
  const productId = String(line?.productId ?? requestedProductId ?? "");
  const planCode = PRODUCT_PLAN_MAP[productId];
  if (!planCode) return { ok: false as const, status: 400, error: "unknown_product" };

  const subscriptionState = String(payload?.subscriptionState ?? "");
  const expiresAt = line?.expiryTime ? new Date(String(line.expiryTime)) : null;
  const expiresAtMs = expiresAt?.getTime() ?? 0;
  const entitledState = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ]).has(subscriptionState);
  const active = entitledState && expiresAtMs > Date.now();
  const status = active
    ? "ACTIVE"
    : subscriptionState === "SUBSCRIPTION_STATE_CANCELED"
      ? "CANCELLED"
      : "EXPIRED";

  return {
    ok: true as const,
    planCode,
    productId,
    purchaseToken,
    transactionId: String(payload?.latestSuccessfulOrderId ?? purchaseToken),
    originalTransactionId: purchaseToken,
    status,
    active,
    currentPeriodStart: payload?.startTime ? new Date(String(payload.startTime)).toISOString() : new Date().toISOString(),
    currentPeriodEnd: expiresAt && Number.isFinite(expiresAtMs) ? expiresAt.toISOString() : null,
    rawReceipt: payload,
  };
}

async function verifyGoogleOneTimeProduct(
  uid: string,
  purchaseToken: string,
  requestedProductId: string,
  packageName: string,
) {
  if (!purchaseToken || packageName !== BUNDLE_ID) return { ok: false as const, status: 403, error: "package_mismatch" };
  if (!FREE_PRODUCT_IDS.has(requestedProductId)) return { ok: false as const, status: 400, error: "unknown_product" };
  const accessToken = await googleAccessToken();
  if (!accessToken) return { ok: false as const, status: 503, error: "google_play_not_configured" };

  const url =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    encodeURIComponent(BUNDLE_ID) +
    "/purchases/productsv2/tokens/" +
    encodeURIComponent(purchaseToken);
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false as const, status: response.status === 404 ? 400 : 502, error: "google_play_product_verify_failed", detail: detail.slice(0, 300) };
  }

  const payload = await response.json();
  const accountId = String(payload?.obfuscatedExternalAccountId ?? "").trim();
  if (!accountId || accountId.toLowerCase() !== uid.toLowerCase()) {
    return { ok: false as const, status: 403, error: "account_mismatch" };
  }
  const state = String(payload?.purchaseStateContext?.purchaseState ?? "");
  if (state !== "PURCHASED") {
    return { ok: false as const, status: 409, error: state === "PENDING" ? "purchase_pending" : "purchase_not_active" };
  }
  const items = Array.isArray(payload?.productLineItem) ? payload.productLineItem : [];
  const line = items.find((item: any) => String(item?.productId ?? "") === requestedProductId);
  if (!line) return { ok: false as const, status: 400, error: "product_mismatch" };
  const quantity = Math.max(1, Number(line?.productOfferDetails?.quantity ?? 1) || 1);

  return {
    ok: true as const,
    productId: requestedProductId,
    transactionId: purchaseToken,
    quantity,
    rawReceipt: payload,
  };
}

async function creditFreeRecharge(
  uid: string,
  platform: "ios" | "android",
  productId: string,
  transactionId: string,
  rawReceipt: unknown,
) {
  const { data, error } = await admin.rpc("service_credit_iap_free_purchase", {
    p_profile_id: uid,
    p_platform: platform,
    p_product_id: productId,
    p_transaction_id: transactionId,
    p_raw_receipt: rawReceipt ?? {},
  });
  if (error) throw error;
  return data as any;
}

async function persistSubscription(input: {
  uid: string;
  planCode: string;
  channel: "APPLE_IAP" | "GOOGLE_PLAY_BILLING";
  status: string;
  originalTransactionId: string;
  transactionId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  rawReceipt: unknown;
  source: string;
}) {
  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("code", input.planCode).maybeSingle();
  if (planError || !plan) throw new Error("plan_not_found");

  const { data: price, error: priceError } = await admin
    .from("plan_prices")
    .select("id,amount,currency_code")
    .eq("plan_id", plan.id)
    .eq("period", "MONTHLY")
    .eq("is_active", true)
    .maybeSingle();
  if (priceError || !price) throw new Error("plan_price_not_found");

  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("profile_id", input.uid)
    .eq("channel", input.channel)
    .eq("store_original_transaction_id", input.originalTransactionId)
    .maybeSingle();

  const subRow = {
    profile_id: input.uid,
    plan_id: plan.id,
    plan_price_id: price.id,
    channel: input.channel,
    status: input.status,
    store_original_transaction_id: input.originalTransactionId,
    current_period_start: input.currentPeriodStart,
    current_period_end: input.currentPeriodEnd,
    updated_at: new Date().toISOString(),
    source: input.source,
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

  if (input.transactionId) {
    const { data: existingTxn } = await admin
      .from("transactions")
      .select("id")
      .eq("channel", input.channel)
      .eq("store_transaction_id", input.transactionId)
      .maybeSingle();
    if (!existingTxn) {
      await admin.from("transactions").insert({
        profile_id: input.uid,
        subscription_id: subscriptionId,
        channel: input.channel,
        status: "SUCCEEDED",
        amount: price.amount,
        currency_code: price.currency_code,
        store_transaction_id: input.transactionId,
        raw_receipt: input.rawReceipt,
      });
    }
  }

  return { planCode: input.planCode, currentPeriodEnd: input.currentPeriodEnd };
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
    const platform = String(body?.platform ?? (body?.purchaseToken ? "android" : "ios")).toLowerCase();

    if (platform === "android") {
      const purchaseToken = String(body?.purchaseToken ?? "").trim();
      const productId = String(body?.productId ?? "").trim();
      const packageName = String(body?.packageName ?? BUNDLE_ID).trim();
      if (!purchaseToken || !productId) return json(400, { error: "missing_google_purchase" });

      if (FREE_PRODUCT_IDS.has(productId)) {
        const verifiedPack = await verifyGoogleOneTimeProduct(uid, purchaseToken, productId, packageName);
        if (!verifiedPack.ok) return json(verifiedPack.status, { error: verifiedPack.error, detail: verifiedPack.detail });
        if (verifiedPack.quantity !== 1) return json(400, { error: "unsupported_quantity" });
        const credited = await creditFreeRecharge(uid, "android", productId, verifiedPack.transactionId, verifiedPack.rawReceipt);
        return json(200, { ok: true, kind: "FREE_RECHARGE", ...credited });
      }

      const verified = await verifyGoogleSubscription(uid, purchaseToken, productId, packageName);
      if (!verified.ok) return json(verified.status, { error: verified.error, detail: verified.detail });

      const persisted = await persistSubscription({
        uid,
        planCode: verified.planCode,
        channel: "GOOGLE_PLAY_BILLING",
        status: verified.status,
        originalTransactionId: verified.originalTransactionId,
        transactionId: verified.transactionId,
        currentPeriodStart: verified.currentPeriodStart,
        currentPeriodEnd: verified.currentPeriodEnd,
        rawReceipt: verified.rawReceipt,
        source: "google_play_billing",
      });
      if (!verified.active) return json(409, { ok: false, error: "subscription_inactive" });
      return json(200, { ok: true, kind: "SUBSCRIPTION", planCode: persisted.planCode, currentPeriodEnd: persisted.currentPeriodEnd });
    }

    const jws = String(body?.jws ?? "").trim();
    if (!jws) return json(400, { error: "missing_jws" });

    const payload = await verifyAppleTransaction(jws);
    if (!payload) return json(400, { error: "invalid_transaction" });
    if (payload.bundleId !== BUNDLE_ID) return json(403, { error: "bundle_mismatch" });
    if (!payload.appAccountToken || String(payload.appAccountToken).toLowerCase() !== uid.toLowerCase()) {
      return json(403, { error: "account_mismatch" });
    }

    const productId = String(payload.productId ?? "");
    const transactionId = String(payload.transactionId ?? "");
    const revoked = Boolean(payload.revocationDate);

    if (FREE_PRODUCT_IDS.has(productId)) {
      if (!transactionId) return json(400, { error: "missing_transaction_id" });
      if (revoked) return json(409, { ok: false, error: "purchase_revoked" });
      const credited = await creditFreeRecharge(uid, "ios", productId, transactionId, payload);
      return json(200, { ok: true, kind: "FREE_RECHARGE", ...credited });
    }

    const planCode = PRODUCT_PLAN_MAP[productId];
    if (!planCode) return json(400, { error: "unknown_product" });

    const originalTransactionId = String(payload.originalTransactionId ?? payload.transactionId ?? "");
    const expiresAtMs = Number(payload.expiresDate ?? 0);
    const expired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
    const active = !revoked && !expired;
    const currentPeriodEnd = Number.isFinite(expiresAtMs) && expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null;
    const currentPeriodStart = payload.purchaseDate ? new Date(Number(payload.purchaseDate)).toISOString() : new Date().toISOString();

    const persisted = await persistSubscription({
      uid,
      planCode,
      channel: "APPLE_IAP",
      status: revoked ? "CANCELLED" : expired ? "EXPIRED" : "ACTIVE",
      originalTransactionId,
      transactionId,
      currentPeriodStart,
      currentPeriodEnd,
      rawReceipt: payload,
      source: "app_store_iap",
    });

    if (!active) return json(409, { ok: false, error: revoked ? "subscription_revoked" : "subscription_expired" });
    return json(200, { ok: true, kind: "SUBSCRIPTION", planCode: persisted.planCode, currentPeriodEnd: persisted.currentPeriodEnd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message });
  }
});
