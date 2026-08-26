import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors });
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] ?? c));
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  return typeof data === "string" && data.length ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { error: "unauthorized" });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "unauthorized" });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const recipientEmail = String(body?.recipientEmail ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) return json(400, { error: "invalid_email" });

    const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
      admin.from("profile_share_emails").select("id", { count: "exact", head: true }).eq("sender_profile_id", userId).gte("created_at", sinceHour),
      admin.from("profile_share_emails").select("id", { count: "exact", head: true }).eq("sender_profile_id", userId).gte("created_at", sinceDay),
    ]);
    if ((hourCount ?? 0) >= 10 || (dayCount ?? 0) >= 30) return json(429, { error: "share_email_rate_limit" });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("username,display_name")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile) return json(409, { error: "profile_not_ready" });

    const apiKey = await getSecret("BREVO_API_KEY");
    const senderEmail = await getSecret("BREVO_SENDER_EMAIL");
    const senderName = (await getSecret("BREVO_SENDER_NAME")) ?? "KEEP";
    if (!apiKey || !senderEmail) {
      return json(409, {
        error: "direct_email_not_configured",
        message: "Le partage e-mail direct sera disponible dès que Brevo est renseigné dans Super Admin > Intégrations. Le partage natif reste disponible gratuitement.",
      });
    }

    const username = String(profile.username ?? "KEEP");
    const displayName = String(profile.display_name ?? username);
    const landing = `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=${encodeURIComponent(username)}`;

    const html = `<!doctype html><html><body style="margin:0;background:#07070d;font-family:Arial,Helvetica,sans-serif;color:#fff"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 14px;background:#07070d"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#151021;border:1px solid #382a55;border-radius:24px"><tr><td style="padding:34px 32px;text-align:center"><div style="font-size:30px;font-weight:900;letter-spacing:9px">KEEP</div><h1 style="font-size:24px;margin:28px 0 8px">${esc(displayName)} partage son univers musical avec toi.</h1><p style="color:#c9bfd9;line-height:1.6;margin:0">Découvre son KEEP DNA, ses morceaux gardés et les réseaux qu’il a choisi de partager.</p><a href="${landing}" style="display:inline-block;margin-top:26px;padding:15px 24px;border-radius:999px;background:#7f5cff;color:#fff;text-decoration:none;font-weight:900">VOIR LE PROFIL @${esc(username)}</a><div style="margin-top:30px;border-top:1px solid #2c223e;padding-top:24px"><strong>Tes goûts te ressemblent.</strong><p style="color:#b9afc8;margin:8px 0 0">Partage ton KEEP DNA, fais grandir ta communauté.</p></div></td></tr></table></td></tr></table></body></html>`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": apiKey, accept: "application/json" },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: recipientEmail }],
        subject: `${displayName} partage son KEEP avec toi`,
        htmlContent: html,
        textContent: `${displayName} partage son univers musical avec toi. Voir le profil @${username}: ${landing}\n\nTes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.`,
      }),
    });

    const details = await response.text();
    if (!response.ok) return json(response.status, { error: "email_send_failed", details: details.slice(0, 400) });

    await admin.from("profile_share_emails").insert({
      sender_profile_id: userId,
      recipient_email: recipientEmail,
      provider: "brevo",
      status: "sent",
    });

    return json(200, { ok: true, provider: "brevo", profile: username });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
