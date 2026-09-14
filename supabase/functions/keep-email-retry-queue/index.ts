import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function sendBrevo(to: string, subject: string, html: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = await integrationSecret("BREVO_API_KEY");
  const senderEmail = await integrationSecret("BREVO_SENDER_EMAIL");
  const senderName = (await integrationSecret("BREVO_SENDER_NAME")) || "Loki";
  if (!apiKey || !senderEmail) return { ok: false, error: "email_delivery_unavailable" };

  const payloadBody = JSON.stringify({
    sender: { email: senderEmail, name: senderName },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
    tags: ["keep", "auth", "queue-retry"],
  });

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(300 * attempt);
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey, Accept: "application/json" },
        body: payloadBody,
      });
      if (response.ok) return { ok: true };
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) break;
    } catch (e) {
      lastStatus = 0;
      continue;
    }
  }
  return { ok: false, error: `brevo_${lastStatus}` };
}

async function sendMailjet(to: string, subject: string, html: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = await integrationSecret("MAILJET_API_KEY");
  const secretKey = await integrationSecret("MAILJET_SECRET_KEY");
  const senderEmail = await integrationSecret("BREVO_SENDER_EMAIL");
  const senderName = (await integrationSecret("BREVO_SENDER_NAME")) || "Loki";
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(300 * attempt);
    try {
      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}` },
        body: payloadBody,
      });
      if (response.ok) return { ok: true };
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) break;
    } catch (e) {
      lastStatus = 0;
      continue;
    }
  }
  return { ok: false, error: `mailjet_${lastStatus}` };
}

async function sendTransactionalEmail(to: string, subject: string, html: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const mjKey = await integrationSecret("MAILJET_API_KEY");
  const mjSecret = await integrationSecret("MAILJET_SECRET_KEY");
  if (mjKey && mjSecret) return sendMailjet(to, subject, html, text);
  return sendBrevo(to, subject, html, text);
}

// Adel (12/09/2026) : Rejouer les emails en queue (pending ou retry)
// Appelable via:
// 1. Webhook Supabase toutes les heures
// 2. Cron job externe (GitHub Actions, etc)
// 3. Manuellement via super admin
async function processEmailQueue() {
  console.log("[keep-email-retry-queue] Starting email queue retry");

  const { data: pending, error: fetchError } = await admin
    .from("email_queue")
    .select("*")
    .eq("status", "pending")
    .lt("retry_count", 5) // max_retries = 5
    .order("created_at", { ascending: true })
    .limit(50);

  if (fetchError) {
    console.error("[keep-email-retry-queue] fetch failed", fetchError);
    return { processed: 0, failed: 0, error: String(fetchError) };
  }

  let processed = 0;
  let failed = 0;

  for (const email of pending || []) {
    const sent = await sendTransactionalEmail(
      email.recipient_email,
      email.subject,
      email.html_content,
      email.text_content,
    );

    if (sent.ok) {
      await admin
        .from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), retry_count: email.retry_count + 1 })
        .eq("id", email.id)
        .catch((err) => console.error(`[keep-email-retry-queue] update failed for ${email.id}`, err));
      processed++;
    } else {
      await admin
        .from("email_queue")
        .update({ status: "pending", retry_count: email.retry_count + 1, error_message: sent.error })
        .eq("id", email.id)
        .catch((err) => console.error(`[keep-email-retry-queue] update failed for ${email.id}`, err));
      failed++;
    }

    // Avoid flooding
    if (processed + failed >= 10) break;
  }

  console.log("[keep-email-retry-queue] Processed:", processed, "Failed:", failed);
  return { processed, failed };
}

Deno.serve(async (req) => {
  if (req.method === "GET" || req.method === "POST") {
    try {
      const result = await processEmailQueue();
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      console.error("[keep-email-retry-queue]", error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }
  return new Response("Method not allowed", { status: 405 });
});
