import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEB_ROOT = (Deno.env.get("KEEP_PUBLIC_WEB_URL") ?? "https://adelkhatra-bit.github.io/KEEP/").replace(/\/+$/, "") + "/";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function cleanLabel(value: unknown) {
  return String(value ?? "Ordinateur Loki").trim().slice(0, 80) || "Ordinateur Loki";
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearer(req: Request) {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function decodeSessionId(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payload.length % 4) % 4);
    const parsed = JSON.parse(atob(normalized));
    return typeof parsed?.session_id === "string" ? parsed.session_id : null;
  } catch {
    return null;
  }
}

async function requireUser(req: Request) {
  const jwt = bearer(req);
  if (!jwt) return { error: json(401, { error: "auth_required" }) };
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user || data.user.is_anonymous) {
    return { error: json(401, { error: "auth_required" }) };
  }
  return { user: data.user, jwt };
}

async function pairingByProof(pairingId: string, token: string) {
  if (!pairingId || !token) return null;
  const tokenHash = await sha256(token);
  const { data } = await admin
    .from("web_pairings")
    .select("id,status,device_label,approved_user_id,action_link,expires_at,approved_at,claimed_at")
    .eq("id", pairingId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now() && !["CLAIMED","CANCELLED"].includes(data.status)) {
    await admin.from("web_pairings").update({ status: "EXPIRED" }).eq("id", data.id);
    return { ...data, status: "EXPIRED" };
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "create") {
      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const deviceLabel = cleanLabel(body?.deviceLabel);

      const { data, error } = await admin
        .from("web_pairings")
        .insert({
          token_hash: tokenHash,
          status: "WAITING",
          device_label: deviceLabel,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (error || !data?.id) throw error ?? new Error("pairing_create_failed");

      const qrUrl = `keep://pair?pairing_id=${encodeURIComponent(data.id)}&token=${encodeURIComponent(token)}`;
      return json(200, { ok: true, pairingId: data.id, token, qrUrl, expiresAt, deviceLabel });
    }

    if (action === "claim") {
      const pairing = await pairingByProof(String(body?.pairingId ?? ""), String(body?.token ?? ""));
      if (!pairing) return json(404, { error: "pairing_not_found" });
      if (pairing.status === "EXPIRED") return json(410, { error: "pairing_expired" });
      if (pairing.status === "CANCELLED") return json(410, { error: "pairing_cancelled" });
      if (pairing.status === "APPROVED" && pairing.action_link) {
        return json(200, { ok: true, status: "APPROVED", actionLink: pairing.action_link });
      }
      if (pairing.status === "CLAIMED") return json(200, { ok: true, status: "CLAIMED" });
      return json(200, { ok: true, status: "WAITING" });
    }

    if (action === "approve") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const pairing = await pairingByProof(String(body?.pairingId ?? ""), String(body?.token ?? ""));
      if (!pairing) return json(404, { error: "pairing_not_found" });
      if (pairing.status !== "WAITING") return json(409, { error: "pairing_not_waiting", status: pairing.status });
      if (!auth.user.email) return json(409, { error: "verified_email_required" });

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: auth.user.email,
        options: { redirectTo: WEB_ROOT },
      });
      const actionLink = linkData?.properties?.action_link;
      if (linkError || !actionLink) {
        console.error("[keep-web-pairing] generateLink failed", linkError?.message ?? "missing_action_link");
        return json(502, { error: "pairing_login_link_failed" });
      }

      const now = new Date().toISOString();
      const { error } = await admin.from("web_pairings").update({
        status: "APPROVED",
        approved_user_id: auth.user.id,
        action_link: actionLink,
        approved_at: now,
      }).eq("id", pairing.id).eq("status", "WAITING");
      if (error) throw error;
      return json(200, { ok: true, status: "APPROVED", deviceLabel: pairing.device_label });
    }

    if (action === "register") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const pairing = await pairingByProof(String(body?.pairingId ?? ""), String(body?.token ?? ""));
      if (!pairing) return json(404, { error: "pairing_not_found" });
      if (pairing.status !== "APPROVED" && pairing.status !== "CLAIMED") {
        return json(409, { error: "pairing_not_approved", status: pairing.status });
      }
      if (pairing.approved_user_id !== auth.user.id) return json(403, { error: "pairing_user_mismatch" });

      const authSessionId = decodeSessionId(auth.jwt);
      const now = new Date().toISOString();
      const { data: session, error: sessionError } = await admin
        .from("web_companion_sessions")
        .upsert({
          pairing_id: pairing.id,
          user_id: auth.user.id,
          auth_session_id: authSessionId,
          device_label: cleanLabel(pairing.device_label),
          last_seen_at: now,
          revoked_at: null,
        }, { onConflict: "pairing_id" })
        .select("id,device_label,created_at,last_seen_at,revoked_at")
        .single();
      if (sessionError || !session) throw sessionError ?? new Error("session_register_failed");

      await admin.from("web_pairings").update({
        status: "CLAIMED",
        action_link: null,
        claimed_at: now,
      }).eq("id", pairing.id);

      return json(200, { ok: true, session });
    }

    if (action === "status") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const id = String(body?.sessionId ?? "");
      const { data } = await admin
        .from("web_companion_sessions")
        .select("id,revoked_at")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!data) return json(404, { error: "session_not_found" });
      if (data.revoked_at) return json(200, { ok: true, revoked: true, revokedAt: data.revoked_at });
      await admin.from("web_companion_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
      return json(200, { ok: true, revoked: false });
    }

    if (action === "list") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const { data, error } = await admin
        .from("web_companion_sessions")
        .select("id,device_label,created_at,last_seen_at,revoked_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return json(200, { ok: true, sessions: data ?? [] });
    }

    if (action === "revoke") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const id = String(body?.sessionId ?? "");
      const { data, error } = await admin
        .from("web_companion_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return json(200, { ok: true, revoked: Boolean(data?.id) });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    console.error("[keep-web-pairing]", error instanceof Error ? error.message : String(error));
    return json(500, { error: "pairing_server_error" });
  }
});
