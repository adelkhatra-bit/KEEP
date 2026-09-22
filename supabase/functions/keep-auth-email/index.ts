import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, lokiEmailCtaShell } from "../_shared/lokiEmailShell.ts";
import { sendTransactionalEmail } from "../_shared/lokiEmailSend.ts";

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

  const sent = await sendTransactionalEmail(
    email,
    "Confirme ton compte Loki Music",
    lokiEmailCtaShell(
      "Confirme ton compte Loki Music",
      "Confirme ton adresse e-mail",
      `<strong style="color:#ffffff">@${escapeHtml(username)}</strong>, plus qu’une étape pour activer ton compte Loki Music et pouvoir récupérer ton mot de passe si besoin.`,
      "Confirmer mon compte",
      data.properties.action_link,
      "Tu n’es pas à l’origine de cette inscription ? Ignore simplement cet e-mail.",
    ),
    `@${username}, confirme ton compte Loki Music en ouvrant ce lien : ${data.properties.action_link}`,
    "signup-confirmation",
    "keep-auth-email",
  );
  if (sent.ok) return json({ ok: true, userId: data.user?.id, requiresEmailConfirmation: true });

  // Adel (03/09/2026) : "il ne faut pas bloquer les utilisateurs" quand un
  // systeme externe (ici Brevo) n'est pas disponible -- l'inscription doit se
  // terminer quand meme, l'utilisateur doit pouvoir entrer dans l'app tout de
  // suite. On confirme le compte nous-memes (on sait que l'e-mail est valide,
  // seul l'ENVOI a echoue) et on ouvre une vraie session immediatement, au
  // lieu de laisser l'utilisateur bloque sur "verifie ta boite mail" pour un
  // lien qui ne partira jamais. On marque juste `keep_email_verification_pending`
  // pour pouvoir relancer proprement l'envoi plus tard (cote Super Admin) une
  // fois Brevo reconfigure -- corriger le systeme est un chantier separe, qui
  // ne doit jamais retarder l'utilisateur.
  const { error: confirmError } = await admin.auth.admin.updateUserById(data.user!.id, {
    email_confirm: true,
    user_metadata: { keep_username: username, keep_username_only: false, pending_follow_username: pendingFollow, keep_email_verification_pending: true },
  });
  if (confirmError) {
    await admin.auth.admin.deleteUser(data.user!.id).catch(() => {});
    console.error("[keep-auth-email] fallback auto-confirm failed", confirmError);
    return json({ ok: false, error: "server_error" }, 500);
  }

  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    console.error("[keep-auth-email] fallback session mint failed", signInError);
    return json({ ok: true, userId: data.user?.id, requiresEmailConfirmation: true, emailVerificationPending: true });
  }

  return json({
    ok: true,
    userId: data.user?.id,
    requiresEmailConfirmation: false,
    emailVerificationPending: true,
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  });
}

async function handleRecovery(body: any) {
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${KEEP_PUBLIC_URL}?keep_auth=recovery` },
  });

  // Ne jamais reveler si l’e-mail existe ou non (anti-enumeration) : un echec
  // "utilisateur introuvable" repond ok:true exactement comme un succes.
  if (error || !data?.properties?.action_link) {
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("no user") || msg.includes("unable to")) return json({ ok: true });
    console.error("[keep-auth-email] generateLink recovery failed", error);
    return json({ ok: false, error: "server_error" }, 500);
  }

  const htmlContent = lokiEmailCtaShell(
    "Réinitialise ton mot de passe Loki Music",
    "Réinitialise ton mot de passe",
    "Tu as demandé à changer ton mot de passe Loki Music. Ouvre ce lien pour en choisir un nouveau.",
    "Choisir un nouveau mot de passe",
    data.properties.action_link,
    "Tu n’es pas à l’origine de cette demande ? Ignore simplement cet e-mail, ton mot de passe reste inchangé.",
  );
  const textContent = `Réinitialise ton mot de passe Loki Music en ouvrant ce lien : ${data.properties.action_link}`;

  const sent = await sendTransactionalEmail(
    email,
    "Réinitialise ton mot de passe Loki Music",
    htmlContent,
    textContent,
    "password-recovery",
    "keep-auth-email",
  );

  // Adel (12/09/2026) : "il ne faut pas bloquer les utilisateurs" sur la
  // recuperation de mot de passe -- si Brevo/Mailjet est en panne, on queued
  // l’email et on retourne ok:true immediatement. Un Super Admin peut rejouer
  // manuellement via email_queue_retry_failed() quand la panne est resolue.
  if (!sent.ok) {
    const { error: queueError } = await admin.from("email_queue").insert({
      recipient_email: email,
      subject: "Réinitialise ton mot de passe Loki Music",
      html_content: htmlContent,
      text_content: textContent,
      email_type: "recovery",
      user_id: data.user?.id || null,
      status: "pending",
      metadata: { action_link: data.properties.action_link },
    });
    if (queueError) console.error("[keep-auth-email] email_queue insert failed", queueError);
    else console.log("[keep-auth-email] recovery email queued, will retry later");
  }

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
