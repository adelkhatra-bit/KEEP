import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

async function getWebhookToken() {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: "BREVO_WEBHOOK_TOKEN" });
  if (error) throw error;
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request) {
  const expected = await getWebhookToken();
  if (!expected) return false;
  const received = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!received) return false;
  const [a, b] = await Promise.all([digest(expected), digest(received)]);
  return a === b;
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeEvent(value: unknown) {
  const raw = text(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "hardbounce") return "hard_bounce";
  if (raw === "softbounce") return "soft_bounce";
  if (raw === "invalidemail") return "invalid_email";
  if (raw === "uniqueopened") return "unique_opened";
  return raw || "unknown";
}

function occurredAt(event: any) {
  const eventSeconds = Number(event?.ts_event);
  if (Number.isFinite(eventSeconds) && eventSeconds > 0) return new Date(eventSeconds * 1000).toISOString();
  const epoch = Number(event?.ts_epoch);
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch > 10_000_000_000 ? epoch : epoch * 1000).toISOString();
  const ts = Number(event?.ts);
  if (Number.isFinite(ts) && ts > 0) return new Date(ts * 1000).toISOString();
  return new Date().toISOString();
}

function tagsFor(event: any): string[] {
  if (Array.isArray(event?.tags)) return event.tags.map((value: unknown) => text(value, 120)).filter(Boolean).slice(0, 20);
  const tag = text(event?.tag, 1000);
  if (!tag) return [];
  try {
    const parsed = JSON.parse(tag);
    if (Array.isArray(parsed)) return parsed.map((value) => text(value, 120)).filter(Boolean).slice(0, 20);
  } catch {}
  return [tag.slice(0, 120)];
}

async function rowFor(event: any) {
  const email = text(event?.email, 320).toLowerCase();
  if (!email || !email.includes("@")) return null;
  const eventType = normalizeEvent(event?.event);
  const messageId = text(event?.["message-id"] ?? event?.messageId ?? event?.message_id, 500) || null;
  const when = occurredAt(event);
  const providerEventId = text(event?.id, 100);
  const eventFingerprint = await digest(`${messageId ?? ""}|${eventType}|${when}|${email}|${providerEventId}`);
  return {
    event_fingerprint: eventFingerprint,
    provider: "BREVO",
    message_id: messageId,
    recipient_email: email,
    event_type: eventType,
    subject: text(event?.subject, 500) || null,
    reason: text(event?.reason ?? event?.error, 1000) || null,
    tags: tagsFor(event),
    occurred_at: when,
    provider_payload: {
      webhook_id: providerEventId || null,
      template_id: event?.template_id ?? null,
      sending_ip: text(event?.sending_ip, 100) || null,
      contact_id: event?.contact_id ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!(await authorized(req))) return json(401, { error: "unauthorized" });
    const body = await req.json().catch(() => null);
    const events = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
    if (!events.length) return json(400, { error: "invalid_payload" });

    const rows = (await Promise.all(events.slice(0, 100).map(rowFor))).filter(Boolean) as any[];
    if (!rows.length) return json(200, { ok: true, accepted: 0, ignored: events.length });

    const { error } = await admin
      .from("email_delivery_events")
      .upsert(rows, { onConflict: "event_fingerprint", ignoreDuplicates: true });
    if (error) throw error;

    return json(200, { ok: true, accepted: rows.length, ignored: Math.max(0, events.length - rows.length) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("KEEP Brevo webhook failed", message);
    return json(500, { error: "webhook_processing_failed" });
  }
});
