import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PendingNotification = {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  push_attempt_count: number | null;
};
type PushTokenRow = { id: string; token: string };
type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: "ok" | "error"; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const TOKEN_RE = /^(?:Exponent|Expo)PushToken\[.+\]$/;
const MAX_ATTEMPTS = 3;

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function errorMessage(value: unknown) {
  return String(value instanceof Error ? value.message : value ?? "UNKNOWN").slice(0, 500);
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function authorized(req: Request) {
  const supplied = req.headers.get("x-keep-worker-key") || "";
  if (!supplied) return false;
  const { data, error } = await db.from("keep_internal_worker_secrets").select("secret_hash").eq("name", "push-worker").maybeSingle();
  if (error || !data?.secret_hash) return false;
  return (await sha256(supplied)) === String(data.secret_hash);
}
async function saveAttempt(notification: PendingNotification, token: PushTokenRow | null, values: Record<string, unknown>) {
  const now = new Date().toISOString();
  if (!token) {
    const { error } = await db.from("push_delivery_attempts").insert({
      notification_id: notification.id,
      profile_id: notification.profile_id,
      push_token_id: null,
      token_suffix: null,
      ...values,
    });
    if (error && error.code !== "23505") throw error;
    return;
  }
  const patch = { profile_id: notification.profile_id, token_suffix: token.token.slice(-12), last_attempt_at: now, updated_at: now, ...values };
  const { data: existing, error: updateError } = await db.from("push_delivery_attempts")
    .update(patch).eq("notification_id", notification.id).eq("push_token_id", token.id).select("id");
  if (updateError) throw updateError;
  if ((existing || []).length) return;
  const { error } = await db.from("push_delivery_attempts").insert({
    notification_id: notification.id,
    profile_id: notification.profile_id,
    push_token_id: token.id,
    token_suffix: token.token.slice(-12),
    ...values,
  });
  if (error && error.code !== "23505") throw error;
}

async function processPending() {
  const { data, error } = await db.rpc("keep_push_claim_batch", { p_limit: 50 });
  if (error) throw error;
  const pending = (Array.isArray(data) ? data : []) as PendingNotification[];
  let sent = 0, noDevice = 0, errors = 0;

  for (const notification of pending) {
    const attemptNumber = Number(notification.push_attempt_count || 0) + 1;
    const now = new Date().toISOString();
    try {
      const { data: rawTokens, error: tokenError } = await db.from("push_tokens").select("id,token").eq("profile_id", notification.profile_id);
      if (tokenError) throw tokenError;
      const all = (rawTokens || []) as PushTokenRow[];
      const valid = all.filter((row) => TOKEN_RE.test(row.token));
      const invalid = all.filter((row) => !TOKEN_RE.test(row.token));
      if (invalid.length) await db.from("push_tokens").delete().in("id", invalid.map((x) => x.id));

      if (!valid.length) {
        await saveAttempt(notification, null, {
          status: "NO_DEVICE", attempt_count: attemptNumber, last_attempt_at: now,
          last_error_code: "NO_DEVICE", last_error_message: "Aucun token Expo valide enregistré pour ce profil.", updated_at: now,
        });
        await db.from("notifications").update({ pushed_at: now, push_delivery_status: "NO_DEVICE", push_attempt_count: attemptNumber, push_last_error: "Aucun appareil push enregistré." }).eq("id", notification.id);
        noDevice += 1;
        continue;
      }

      const messages = valid.map(({ token: to }) => ({ to, title: notification.title, body: notification.body || "", data: notification.data || {}, sound: "default", priority: "high" }));
      const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(messages) });
      if (!response.ok) throw new Error(`EXPO_PUSH_HTTP_${response.status}`);
      const payload = await response.json() as { data?: ExpoTicket[] };
      const tickets = payload.data || [];
      if (tickets.length !== valid.length) throw new Error("EXPO_PUSH_TICKET_COUNT_MISMATCH");

      let accepted = 0;
      let firstError: string | null = null;
      for (let i = 0; i < valid.length; i += 1) {
        const token = valid[i];
        const ticket = tickets[i];
        if (ticket.status === "ok" && ticket.id) {
          accepted += 1;
          await saveAttempt(notification, token, {
            status: "SENT", expo_ticket_id: ticket.id, attempt_count: attemptNumber, last_attempt_at: now,
            receipt_checked_at: null, delivered_at: null, last_error_code: null, last_error_message: null, updated_at: now,
          });
        } else {
          const code = ticket.details?.error || "EXPO_TICKET_ERROR";
          const message = ticket.message || code;
          firstError ||= message;
          await saveAttempt(notification, token, {
            status: "FAILED", attempt_count: attemptNumber, last_attempt_at: now, receipt_checked_at: now,
            last_error_code: code, last_error_message: message.slice(0, 500), updated_at: now,
          });
          if (code === "DeviceNotRegistered") await db.from("push_tokens").delete().eq("id", token.id);
        }
      }
      await db.from("notifications").update({
        pushed_at: now,
        push_delivery_status: accepted ? "SENT" : "FAILED",
        push_attempt_count: attemptNumber,
        push_last_error: firstError,
      }).eq("id", notification.id);
      if (accepted) sent += 1; else errors += 1;
    } catch (error) {
      errors += 1;
      const terminal = attemptNumber >= MAX_ATTEMPTS;
      await db.from("notifications").update({
        pushed_at: terminal ? now : null,
        push_delivery_status: terminal ? "FAILED" : "CREATED",
        push_attempt_count: attemptNumber,
        push_last_error: errorMessage(error),
      }).eq("id", notification.id);
    }
  }
  return { processed: pending.length, sent, noDevice, errors };
}

async function processReceipts() {
  const { data, error } = await db.from("push_delivery_attempts")
    .select("id,notification_id,push_token_id,expo_ticket_id").eq("status", "SENT").not("expo_ticket_id", "is", null)
    .order("last_attempt_at", { ascending: true }).limit(300);
  if (error) throw error;
  const attempts = (data || []).filter((x: any) => x.expo_ticket_id);
  if (!attempts.length) return { checked: 0, delivered: 0, failed: 0 };

  const response = await fetch(EXPO_RECEIPTS_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ids: attempts.map((x: any) => x.expo_ticket_id) }) });
  if (!response.ok) throw new Error(`EXPO_RECEIPTS_HTTP_${response.status}`);
  const payload = await response.json() as { data?: Record<string, ExpoReceipt> };
  const receipts = payload.data || {};
  const affected = new Set<string>();
  const now = new Date().toISOString();
  let checked = 0, delivered = 0, failed = 0;

  for (const attempt of attempts as any[]) {
    const receipt = receipts[attempt.expo_ticket_id];
    if (!receipt) continue;
    checked += 1;
    affected.add(attempt.notification_id);
    if (receipt.status === "ok") {
      delivered += 1;
      await db.from("push_delivery_attempts").update({ status: "DELIVERED", receipt_checked_at: now, delivered_at: now, last_error_code: null, last_error_message: null, updated_at: now }).eq("id", attempt.id);
    } else {
      failed += 1;
      const code = receipt.details?.error || "EXPO_RECEIPT_ERROR";
      const message = receipt.message || code;
      await db.from("push_delivery_attempts").update({ status: "FAILED", receipt_checked_at: now, last_error_code: code, last_error_message: message.slice(0, 500), updated_at: now }).eq("id", attempt.id);
      if (code === "DeviceNotRegistered" && attempt.push_token_id) await db.from("push_tokens").delete().eq("id", attempt.push_token_id);
    }
  }

  if (affected.size) {
    const ids = [...affected];
    const { data: statuses } = await db.from("push_delivery_attempts").select("notification_id,status").in("notification_id", ids);
    const grouped = new Map<string, string[]>();
    for (const row of statuses || []) grouped.set(row.notification_id, [...(grouped.get(row.notification_id) || []), row.status]);
    for (const [notificationId, rows] of grouped) {
      let status = "FAILED";
      if (rows.includes("DELIVERED")) status = "DELIVERED";
      else if (rows.includes("SENT")) status = "SENT";
      else if (rows.includes("NO_DEVICE")) status = "NO_DEVICE";
      await db.from("notifications").update({ push_delivery_status: status, ...(status === "DELIVERED" ? { push_delivered_at: now } : {}) }).eq("id", notificationId);
    }
  }
  return { checked, delivered, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!supabaseUrl || !serviceRole) return json({ error: "SERVER_CONFIG" }, 503);
  if (!(await authorized(req))) return json({ error: "UNAUTHORIZED" }, 401);
  try {
    const pending = await processPending();
    const receipts = await processReceipts();
    return json({ ok: true, pending, receipts, at: new Date().toISOString() });
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 500);
  }
});
