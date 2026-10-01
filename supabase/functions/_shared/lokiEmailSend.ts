import { createClient } from "npm:@supabase/supabase-js@2";

// Source unique d'envoi transactionnel Loki Music (audit Adel, 22/09/2026,
// Bloc 4 B2 : "aligner keep-account-email sur sendTransactionalEmail (retry
// + fallback)"). Avant ce fichier, cette logique (Mailjet en priorite,
// repli Brevo automatique, 3 essais avec backoff sur 429/5xx uniquement)
// n'existait que dans keep-auth-email/index.ts -- keep-account-email
// envoyait son code de verification en un seul essai Brevo, sans filet.
// Reprise ici a l'identique (comportement inchange pour keep-auth-email)
// pour que toute fonction d'e-mail transactionnel partage desormais le
// meme chemin fiable.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

export async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export type EmailProvider = "resend" | "mailjet" | "brevo";
export type EmailSendResult = { ok: true; provider: EmailProvider } | { ok: false; error: string; detail?: string };

async function senderIdentity() {
  const senderEmail =
    (await integrationSecret("EMAIL_SENDER_ADDRESS"))
    || (await integrationSecret("BREVO_SENDER_EMAIL"));
  const senderName = (await integrationSecret("BREVO_SENDER_NAME")) || "Loki Music";
  return { senderEmail, senderName };
}

export async function sendResend(to: string, subject: string, html: string, text: string, logTag: string): Promise<EmailSendResult> {
  const apiKey = await integrationSecret("RESEND_API_KEY");
  const { senderEmail, senderName } = await senderIdentity();
  if (!apiKey || !senderEmail) return { ok: false, error: "email_delivery_unavailable" };

  const payloadBody = JSON.stringify({
    from: `${senderName} <${senderEmail}>`,
    to: [to],
    subject,
    html,
    text,
  });

  let lastStatus = 0;
  let lastPayload: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(300 * attempt);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: payloadBody,
      });
    } catch (networkError) {
      lastStatus = 0;
      lastPayload = { message: networkError instanceof Error ? networkError.message : String(networkError) };
      continue;
    }
    if (response.ok) return { ok: true, provider: "resend" };
    lastStatus = response.status;
    lastPayload = await response.json().catch(() => null);
    if (response.status !== 429 && response.status < 500) break;
  }
  console.error(`[${logTag}] Resend send failed`, lastStatus, lastPayload);
  return { ok: false, error: "email_delivery_unavailable", detail: `resend:${String(lastPayload?.message || lastPayload?.name || lastStatus)}` };
}

// Adel (08/09/2026, keep-auth-email) : "trouve une autre solution ... une
// autre plate-forme d'e-mail ... gratuite ... 6000 e-mails gratuit" --
// Mailjet (200/jour, sans carte bancaire), pour ne plus dependre de Brevo
// pendant les tests. Meme identite expediteur (BREVO_SENDER_EMAIL/NAME,
// reutilisee volontairement -- c'est "Loki Music", pas "Brevo" ou
// "Mailjet", qui doit apparaitre pour l'utilisateur, quel que soit le
// tuyau technique derriere).
export async function sendMailjet(to: string, subject: string, html: string, text: string, logTag: string): Promise<EmailSendResult> {
  const apiKey = await integrationSecret("MAILJET_API_KEY");
  const secretKey = await integrationSecret("MAILJET_SECRET_KEY");
  const { senderEmail, senderName } = await senderIdentity();
  if (!apiKey || !secretKey || !senderEmail) return { ok: false, error: "email_delivery_unavailable" };

  const payloadBody = JSON.stringify({
    Messages: [{
      From: { Email: senderEmail, Name: senderName },
      To: [{ Email: to }],
      Subject: subject,
      HTMLPart: html,
      TextPart: text,
    }],
  });

  let lastStatus = 0;
  let lastPayload: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(300 * attempt);
    let response: Response;
    try {
      response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}` },
        body: payloadBody,
      });
    } catch (networkError) {
      lastStatus = 0;
      lastPayload = { message: networkError instanceof Error ? networkError.message : String(networkError) };
      continue;
    }
    if (response.ok) return { ok: true, provider: "mailjet" };
    lastStatus = response.status;
    lastPayload = await response.json().catch(() => null);
    if (response.status !== 429 && response.status < 500) break;
  }
  console.error(`[${logTag}] Mailjet send failed`, lastStatus, lastPayload);
  return { ok: false, error: "email_delivery_unavailable", detail: String(lastPayload?.ErrorMessage || lastStatus) };
}

// Audit multi-agent 07/09/2026 (keep-auth-email) : un seul essai, aucun
// retry -- un pic de demandes ou un 429 Brevo momentane faisait echouer
// l'envoi (503 dur, aucun filet) alors qu'un deuxieme essai quelques
// centaines de ms plus tard aurait souvent suffi. On ne retente que sur
// une panne reseau/serveur transitoire (429/5xx) -- jamais sur un rejet
// definitif (ex: adresse invalide, cle rejetee).
export async function sendBrevo(to: string, subject: string, html: string, text: string, tag: string, logTag: string): Promise<EmailSendResult> {
  const apiKey = await integrationSecret("BREVO_API_KEY");
  const { senderEmail, senderName } = await senderIdentity();
  if (!apiKey || !senderEmail) return { ok: false, error: "email_delivery_unavailable" };

  const payloadBody = JSON.stringify({
    sender: { email: senderEmail, name: senderName },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
    tags: ["keep", logTag, tag],
  });

  let lastStatus = 0;
  let lastPayload: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(300 * attempt);
    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey, Accept: "application/json" },
        body: payloadBody,
      });
    } catch (networkError) {
      lastStatus = 0;
      lastPayload = { message: networkError instanceof Error ? networkError.message : String(networkError) };
      continue;
    }
    if (response.ok) return { ok: true, provider: "brevo" };
    lastStatus = response.status;
    lastPayload = await response.json().catch(() => null);
    if (response.status !== 429 && response.status < 500) break;
  }
  console.error(`[${logTag}] Brevo send failed`, lastStatus, lastPayload);
  return { ok: false, error: "email_delivery_unavailable", detail: String(lastPayload?.message || lastStatus) };
}

// Point d'entree unique : Mailjet en priorite s'il est configure, Brevo en
// repli automatique sinon -- aucun code appelant n'a besoin de savoir
// lequel des deux est actif. `logTag` identifie la fonction appelante dans
// les logs (ex. "keep-auth-email", "keep-account-email").
export async function sendTransactionalEmail(to: string, subject: string, html: string, text: string, tag: string, logTag: string): Promise<EmailSendResult> {
  const resendKey = await integrationSecret("RESEND_API_KEY");
  const senderAddress = (await integrationSecret("EMAIL_SENDER_ADDRESS")) || (await integrationSecret("BREVO_SENDER_EMAIL"));
  if (resendKey && senderAddress) {
    const resend = await sendResend(to, subject, html, text, logTag);
    if (resend.ok) return resend;
    console.warn(`[${logTag}] Resend unavailable, falling back to Mailjet/Brevo`);
  }

  const mjKey = await integrationSecret("MAILJET_API_KEY");
  const mjSecret = await integrationSecret("MAILJET_SECRET_KEY");
  if (mjKey && mjSecret) {
    const mailjet = await sendMailjet(to, subject, html, text, logTag);
    if (mailjet.ok) return mailjet;
    console.warn(`[${logTag}] Mailjet unavailable, falling back to Brevo`);
  }
  return sendBrevo(to, subject, html, text, tag, logTag);
}
