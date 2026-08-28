import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validEmail = (value: string) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/@keep\.local$/i.test(value);

async function currentUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return String(Deno.env.get(key) ?? "").trim();
}

async function digest(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_ROLE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function code6() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}•••@${domain}`;
}

async function sendBrevoCode(to: string, code: string, username: string) {
  const apiKey = await integrationSecret("BREVO_API_KEY");
  const senderEmail = await integrationSecret("BREVO_SENDER_EMAIL");
  const senderName = (await integrationSecret("BREVO_SENDER_NAME")) || "KEEP";
  if (!apiKey || !senderEmail) return { ok: false as const, error: "email_provider_unconfigured" };

  const subject = "Valide ton adresse e-mail KEEP";
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;background:#0b0711;color:#ffffff;padding:24px;border-radius:18px">
      <div style="font-size:13px;font-weight:800;color:#a78bfa;letter-spacing:1px">KEEP</div>
      <h2 style="margin:10px 0 8px">Valide ton adresse e-mail</h2>
      <p style="color:#d5cce3">${username ? `@${username}, ` : ""}saisis ce code dans KEEP. Il expire dans 10 minutes.</p>
      <div style="font-size:32px;font-weight:900;letter-spacing:8px;margin:24px 0;color:#ffffff">${code}</div>
      <p style="font-size:12px;color:#9e94ae">Si tu n’as pas demandé cette validation, ignore cet e-mail. KEEP ne te demandera jamais ton mot de passe par e-mail.</p>
    </div>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey, Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent,
      tags: ["keep", "account", "email-verification"],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { ok: false as const, error: "email_send_failed", detail: String(payload?.message || response.status) };
  return { ok: true as const, messageId: String(payload?.messageId || "") };
}

async function requestCode(user: any, body: any) {
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);

  const { data: previous } = await admin
    .from("account_email_verifications")
    .select("requested_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (previous?.requested_at) {
    const elapsed = Date.now() - new Date(previous.requested_at).getTime();
    if (elapsed < 60_000) return json({ ok: false, error: "rate_limited", retry_after_seconds: Math.ceil((60_000 - elapsed) / 1000) }, 429);
  }

  const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const code = code6();
  const codeHash = await digest(`${user.id}:${email}:${code}`);
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60_000);

  const { error: saveError } = await admin.from("account_email_verifications").upsert({
    profile_id: user.id,
    email,
    code_hash: codeHash,
    attempts: 0,
    requested_at: now.toISOString(),
    expires_at: expires.toISOString(),
    verified_at: null,
  }, { onConflict: "profile_id" });
  if (saveError) return json({ ok: false, error: "server_error" }, 500);

  const sent = await sendBrevoCode(email, code, String(profile?.username ?? ""));
  if (!sent.ok) {
    await admin.from("account_email_verifications").delete().eq("profile_id", user.id);
    return json({ ok: false, error: sent.error, detail: "detail" in sent ? sent.detail : null }, 503);
  }

  return json({ ok: true, email_hint: maskEmail(email), expires_in_seconds: 600 });
}

async function confirmCode(user: any, body: any) {
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return json({ ok: false, error: "invalid_code" }, 400);

  const { data: pending, error } = await admin
    .from("account_email_verifications")
    .select("email,code_hash,attempts,expires_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error || !pending) return json({ ok: false, error: "no_pending_verification" }, 400);
  if (normalizeEmail(pending.email) !== email) return json({ ok: false, error: "email_mismatch" }, 400);
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await admin.from("account_email_verifications").delete().eq("profile_id", user.id);
    return json({ ok: false, error: "code_expired" }, 400);
  }
  if (Number(pending.attempts ?? 0) >= 5) return json({ ok: false, error: "too_many_attempts" }, 429);

  const providedHash = await digest(`${user.id}:${email}:${code}`);
  if (providedHash !== pending.code_hash) {
    await admin.from("account_email_verifications").update({ attempts: Number(pending.attempts ?? 0) + 1 }).eq("profile_id", user.id);
    return json({ ok: false, error: "invalid_code", remaining_attempts: Math.max(0, 4 - Number(pending.attempts ?? 0)) }, 400);
  }

  const metadata = { ...(user.user_metadata ?? {}), keep_username_only: false, keep_recovery_email_verified: true };
  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (updateError || !updated.user) {
    const msg = String(updateError?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) return json({ ok: false, error: "email_taken" }, 409);
    return json({ ok: false, error: "email_update_failed" }, 500);
  }

  await admin.from("account_email_verifications").delete().eq("profile_id", user.id);
  await admin.from("account_recovery_events").insert({ profile_id: user.id, method: "BOOTSTRAP", success: true, context: { recovery_email_added: true } });
  return json({ ok: true, email: updated.user.email, email_verified: true });
}

async function status(user: any) {
  const email = String(user.email ?? "").trim();
  const isReal = Boolean(email) && !/@keep\.local$/i.test(email);
  const { data: pending } = await admin.from("account_email_verifications").select("email,expires_at").eq("profile_id", user.id).maybeSingle();
  return json({
    ok: true,
    email: isReal ? email : null,
    email_verified: isReal && Boolean(user.email_confirmed_at),
    pending_email_hint: pending?.email ? maskEmail(String(pending.email)) : null,
    pending_expires_at: pending?.expires_at ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const user = await currentUser(req);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "status");
    if (action === "request") return await requestCode(user, body);
    if (action === "confirm") return await confirmCode(user, body);
    if (action === "status") return await status(user);
    return json({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    console.error("[keep-account-email]", error);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
