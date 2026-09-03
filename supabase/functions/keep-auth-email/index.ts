import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (03/09/2026) : l'e-mail de confirmation d'inscription ("teyous007@hotmail.com",
// pourtant parfaitement valide, refuse par erreur) et l'e-mail de reinitialisation de
// mot de passe dependaient tous les deux du releve SMTP CONFIGURE DANS LE DASHBOARD
// SUPABASE (Project Settings > Auth > SMTP) -- une cle Brevo stockee LA-BAS, separee
// et desynchronisee de celle stockee dans integration_secrets (utilisee partout
// ailleurs dans Loki). Quand l'une des deux cles Brevo est regeneree sans mettre a
// jour l'autre, Supabase Auth renvoie "535 5.7.8 Authentication failed" -- et TOUTE
// inscription/reinitialisation tombe en panne d'un coup, pour TOUS les utilisateurs,
// jusqu'a ce qu'un humain aille corriger ce champ dans le Dashboard.
//
// Solution permanente ("plus jamais que ca arrive") : ne plus jamais laisser
// Supabase Auth envoyer lui-meme ces e-mails. On genere le lien nous-memes avec
// l'API admin (qui n'envoie AUCUN e-mail), puis on l'envoie via l'API HTTP Brevo
// (BREVO_API_KEY, integration_secrets) -- exactement le meme chemin, deja prouve
// fiable en production, que keep-account-email pour la verification d'e-mail d'un
// compte existant. Il n'y a plus qu'UN SEUL endroit ou la cle Brevo vit.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const KEEP_PUBLIC_URL = "https://adelkhatra-bit.github.io/KEEP/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validEmail = (value: string) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/@keep\.local$/i.test(value);

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}

function shellHtml(title: string, heading: string, intro: string, buttonLabel: string, link: string, footer: string) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09070d;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#09070d;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#14101b;border:1px solid #2b2235;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:30px 26px 12px;text-align:center;">
              <div style="display:inline-block;background:#e5f266;color:#15110b;border-radius:999px;padding:8px 15px;font-size:12px;font-weight:900;letter-spacing:1.7px;">Loki</div>
              <h1 style="margin:22px 0 8px;font-size:27px;line-height:32px;font-weight:900;color:#ffffff;">${escapeHtml(heading)}</h1>
              <p style="margin:0 auto;max-width:410px;font-size:15px;line-height:22px;color:#cfc7d8;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 24px 26px;">
              <a href="${link}" style="display:inline-block;background:#e5f266;color:#15110b;font-weight:900;font-size:15px;text-decoration:none;border-radius:999px;padding:15px 34px;">${escapeHtml(buttonLabel)}</a>
              <p style="margin:18px 0 0;font-size:11px;line-height:16px;color:#72697e;word-break:break-all;">${escapeHtml(link)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 26px 30px;">
              <div style="height:1px;background:#2b2235;margin-bottom:20px;"></div>
              <p style="margin:0;font-size:12px;line-height:18px;color:#90869d;text-align:center;">${footer}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#72697e;text-align:center;">Loki · Ton univers musical, gardé au même endroit.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendBrevo(to: string, subject: string, html: string, text: string, tag: string): Promise<{ ok: true } | { ok: false; error: string; detail?: string }> {
  const apiKey = await integrationSecret("BREVO_API_KEY");
  const senderEmail = await integrationSecret("BREVO_SENDER_EMAIL");
  const senderName = (await integrationSecret("BREVO_SENDER_NAME")) || "Loki";
  if (!apiKey || !senderEmail) return { ok: false, error: "email_delivery_unavailable" };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      tags: ["keep", "auth", tag],
    }),
  });
  if (response.ok) return { ok: true };
  const payload = await response.json().catch(() => null);
  console.error("[keep-auth-email] Brevo send failed", response.status, payload);
  return { ok: false, error: "email_delivery_unavailable", detail: String(payload?.message || response.status) };
}

async function handleSignup(body: any) {
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");
  const username = String(body?.username ?? "").trim();
  const pendingFollow = body?.pendingFollowUsername ? String(body.pendingFollowUsername).trim() : null;
  if (!validEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);
  if (password.length < 6) return json({ ok: false, error: "invalid_password" }, 400);
  if (!username) return json({ ok: false, error: "invalid_username" }, 400);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      redirectTo: KEEP_PUBLIC_URL,
      data: { keep_username: username, keep_username_only: false, pending_follow_username: pendingFollow },
    },
  });

  if (error || !data?.properties?.action_link) {
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) return json({ ok: false, error: "email_taken" }, 409);
    if (msg.includes("password")) return json({ ok: false, error: "invalid_password" }, 400);
    console.error("[keep-auth-email] generateLink signup failed", error);
    return json({ ok: false, error: "server_error" }, 500);
  }

  const sent = await sendBrevo(
    email,
    "Confirme ton compte Loki",
    shellHtml(
      "Confirme ton compte Loki",
      "Confirme ton adresse e-mail",
      `<strong style="color:#ffffff">@${escapeHtml(username)}</strong>, plus qu’une étape pour activer ton compte Loki et pouvoir récupérer ton mot de passe si besoin.`,
      "Confirmer mon compte",
      data.properties.action_link,
      "Tu n’es pas à l’origine de cette inscription ? Ignore simplement cet e-mail.",
    ),
    `@${username}, confirme ton compte Loki en ouvrant ce lien : ${data.properties.action_link}`,
    "signup-confirmation",
  );
  if (!sent.ok) {
    await admin.auth.admin.deleteUser(data.user!.id).catch(() => {});
    return json({ ok: false, error: sent.error }, 503);
  }

  return json({ ok: true, userId: data.user?.id, requiresEmailConfirmation: true });
}

async function handleRecovery(body: any) {
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${KEEP_PUBLIC_URL}?keep_auth=recovery` },
  });

  // Ne jamais reveler si l'e-mail existe ou non (anti-enumeration) : un echec
  // "utilisateur introuvable" repond ok:true exactement comme un succes.
  if (error || !data?.properties?.action_link) {
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("no user") || msg.includes("unable to")) return json({ ok: true });
    console.error("[keep-auth-email] generateLink recovery failed", error);
    return json({ ok: false, error: "server_error" }, 500);
  }

  const sent = await sendBrevo(
    email,
    "Réinitialise ton mot de passe Loki",
    shellHtml(
      "Réinitialise ton mot de passe Loki",
      "Réinitialise ton mot de passe",
      "Tu as demandé à changer ton mot de passe Loki. Ouvre ce lien pour en choisir un nouveau.",
      "Choisir un nouveau mot de passe",
      data.properties.action_link,
      "Tu n’es pas à l’origine de cette demande ? Ignore simplement cet e-mail, ton mot de passe reste inchangé.",
    ),
    `Réinitialise ton mot de passe Loki en ouvrant ce lien : ${data.properties.action_link}`,
    "password-recovery",
  );
  if (!sent.ok) return json({ ok: false, error: sent.error }, 503);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    if (action === "signup") return await handleSignup(body);
    if (action === "recovery") return await handleRecovery(body);
    return json({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    console.error("[keep-auth-email]", error);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
