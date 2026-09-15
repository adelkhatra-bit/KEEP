import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (15/09/2026) : "on va utiliser le stripe de insidedombe" -- ouvre une
// session Stripe Checkout (abonnement) pour l'utilisateur authentifie.
// Meme philosophie que Paddle (paddleService.ts) : jamais de fausse
// activation cote client, la session est creee ici avec la cle secrete, et
// c'est keep-stripe-webhook (evenement Stripe verifie) qui active reellement
// le plan. Contrairement a Paddle (checkout 100% cote client via Paddle.js),
// Stripe Checkout exige une session creee cote serveur avant redirection.

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

// URL canonique KEEP (voir CLAUDE.md) -- jamais de localhost/preview en dur.
const CANONICAL_WEB_URL = "https://adelkhatra-bit.github.io/KEEP/";

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
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
    const planCode = String(body?.planCode ?? "").trim().toUpperCase();
    const period = String(body?.period ?? "").trim().toUpperCase();
    if (!["PREMIUM", "CREATOR_PRO", "VENUE_PRO"].includes(planCode)) return json(400, { error: "invalid_plan" });
    if (!["MONTHLY", "YEARLY"].includes(period)) return json(400, { error: "invalid_period" });

    const { data: priceRow, error: priceError } = await admin
      .from("plan_prices")
      .select("stripe_price_id, plans!inner(code)")
      .eq("plans.code", planCode)
      .eq("period", period)
      .eq("is_active", true)
      .maybeSingle();
    if (priceError) throw priceError;
    const stripePriceId = String((priceRow as any)?.stripe_price_id ?? "").trim();
    if (!stripePriceId) return json(409, { error: "stripe_price_not_configured", message: "Aucun tarif Stripe n'est encore relié à cette formule." });

    const secretKey = await integrationSecret("STRIPE_SECRET_KEY");
    if (!secretKey) return json(409, { error: "stripe_not_configured" });

    const { data: profile } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (!profile) return json(409, { error: "profile_not_ready" });

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${secretKey}`,
      },
      body: formBody({
        mode: "subscription",
        "line_items[0][price]": stripePriceId,
        "line_items[0][quantity]": "1",
        client_reference_id: uid,
        "customer_email": authData.user.email ?? "",
        success_url: `${CANONICAL_WEB_URL}?stripe_checkout=success`,
        cancel_url: `${CANONICAL_WEB_URL}?stripe_checkout=cancel`,
      }),
    });
    const session = await response.json().catch(() => null);
    if (!response.ok || !session?.url) {
      console.error("[keep-stripe-checkout] session creation failed", session?.error ?? session);
      return json(502, { error: "stripe_session_failed", message: session?.error?.message ?? undefined });
    }

    return json(200, { ok: true, url: session.url });
  } catch (error) {
    console.error("[keep-stripe-checkout]", error);
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
