import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTransactionalEmail } from "../_shared/lokiEmailSend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request) {
  const supplied = req.headers.get("x-keep-worker-key") || "";
  if (!supplied) return false;
  const { data, error } = await admin
    .from("keep_internal_worker_secrets")
    .select("secret_hash")
    .eq("name", "email-retry-worker")
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return (await sha256(supplied)) === String(data.secret_hash);
}

async function processEmailQueue() {
  // A Brevo IP allowlist rejection is configuration, not a transient outage.
  // Supabase Edge Functions use rotating egress addresses, so retrying the same
  // blocked credential every five minutes only floods logs and can never heal
  // by itself. Pause delivery until the integration secret is changed.
  const [{ data: emailSecrets }, { data: runtime }] = await Promise.all([
    admin.from("integration_secrets")
      .select("key,updated_at")
      .in("key", ["RESEND_API_KEY","EMAIL_SENDER_ADDRESS","MAILJET_API_KEY","MAILJET_SECRET_KEY","BREVO_API_KEY"]),
    admin.from("integration_runtime_status").select("status,last_error,updated_at").eq("key", "BREVO_EMAIL_DELIVERY").maybeSingle(),
  ]);
  const secretMap = new Map((emailSecrets || []).map((row: any) => [String(row.key), row]));
  const brevoSecret = secretMap.get("BREVO_API_KEY") as any;
  const resendReady = secretMap.has("RESEND_API_KEY") && secretMap.has("EMAIL_SENDER_ADDRESS");
  const mailjetReady = secretMap.has("MAILJET_API_KEY") && secretMap.has("MAILJET_SECRET_KEY");
  const secretUpdatedAt = brevoSecret?.updated_at ? Date.parse(String(brevoSecret.updated_at)) : 0;
  const runtimeUpdatedAt = runtime?.updated_at ? Date.parse(String(runtime.updated_at)) : 0;
  if (
    !resendReady
    && !mailjetReady
    && runtime?.status === "ERROR"
    && /brevo_ip_allowlist_blocked/i.test(String(runtime?.last_error || ""))
    && runtimeUpdatedAt >= secretUpdatedAt
  ) {
    const { count } = await admin.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "pending");
    return { processed: 0, failed: 0, blocked: Number(count || 0), exhausted: 0, providerPaused: true };
  }

  const { data: pending, error: fetchError } = await admin
    .from("email_queue")
    .select("id,recipient_email,subject,html_content,text_content,email_type,retry_count,max_retries")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25);

  if (fetchError) throw fetchError;

  let processed = 0;
  let failed = 0;
  let blocked = 0;
  let exhausted = 0;

  for (const email of pending || []) {
    const retryCount = Number(email.retry_count || 0);
    const maxRetries = Math.max(1, Number(email.max_retries || 5));
    if (retryCount >= maxRetries) {
      await admin.from("email_queue").update({
        status: "failed",
        error_message: email.error_message || "max_retries_exhausted",
      }).eq("id", email.id);
      exhausted += 1;
      continue;
    }

    const sent = await sendTransactionalEmail(
      String(email.recipient_email || ""),
      String(email.subject || "Loki Music"),
      String(email.html_content || ""),
      String(email.text_content || ""),
      String(email.email_type || "transactional"),
      "keep-email-retry-queue",
    );

    if (sent.ok) {
      await admin.from("email_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        retry_count: retryCount + 1,
        error_message: null,
      }).eq("id", email.id);
      await admin.from("integration_runtime_status").upsert({
        key: "BREVO_EMAIL_DELIVERY",
        status: "ACTIVE",
        last_checked_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
      processed += 1;
    } else {
      const detail = sent.detail ? `${sent.error}:${sent.detail}` : sent.error;
      const providerConfigBlocked = /unrecognised IP address|unauthorized|key not found|sender.*not.*verified/i.test(detail);
      if (providerConfigBlocked) {
        await admin.from("email_queue").update({
          status: "pending",
          retry_count: retryCount,
          error_message: detail,
        }).eq("id", email.id);
        await admin.from("integration_runtime_status").upsert({
          key: "BREVO_EMAIL_DELIVERY",
          status: "ERROR",
          last_checked_at: new Date().toISOString(),
          last_error: /unrecognised IP address/i.test(detail)
            ? "brevo_ip_allowlist_blocked: authorize Supabase egress or disable Brevo IP allowlist"
            : `brevo_provider_blocked: ${detail.slice(0, 300)}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        blocked += 1;
      } else {
        const nextRetry = retryCount + 1;
        await admin.from("email_queue").update({
          status: nextRetry >= maxRetries ? "failed" : "pending",
          retry_count: nextRetry,
          error_message: detail,
        }).eq("id", email.id);
        failed += 1;
      }
    }

    if (processed + failed + blocked + exhausted >= 10) break;
  }

  return { processed, failed, blocked, exhausted };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "content-type": "application/json" } });
  }
  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  try {
    const result = await processEmailQueue();
    return new Response(JSON.stringify({ ok: true, ...result, at: new Date().toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
