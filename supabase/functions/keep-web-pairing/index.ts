import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { lokiEmailCtaShell } from "../_shared/lokiEmailShell.ts";
import { sendTransactionalEmail } from "../_shared/lokiEmailSend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEB_ROOT = "https://adelkhatra-bit.github.io/KEEP/";
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

type PairingRow = {
  id: string; status: string; device_label: string | null; approved_user_id: string | null;
  action_link: string | null; expires_at: string; approved_at: string | null; claimed_at: string | null;
};

async function pairingByProof(pairingId: string, token: string): Promise<PairingRow | null> {
  if (!pairingId || !token) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await admin
    .from("web_pairings")
    .select("id,status,device_label,approved_user_id,action_link,expires_at,approved_at,claimed_at")
    .eq("id", pairingId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now() && !["CLAIMED","CANCELLED"].includes(data.status)) {
    const { data: expired, error: expiryError } = await admin.from("web_pairings").update({ status: "EXPIRED", action_link: null })
      .eq("id", data.id).in("status", ["WAITING", "APPROVED"]).select("id").maybeSingle();
    if (expiryError) throw expiryError;
    if (!expired && data.status !== "EXPIRED") return pairingByProof(pairingId, token);
    return { ...data, status: "EXPIRED", action_link: null };
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "email-link") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      if (!auth.user.email || !auth.user.email_confirmed_at || /@keep\.local$/i.test(auth.user.email)) {
        return json(409, { error: "verified_email_required" });
      }
      // Le journal existant réserve un envoi par minute, même entre plusieurs instances Edge.
      const now = new Date();
      const eventFingerprint = `web-companion-link:${auth.user.id}:${Math.floor(now.getTime() / 60000)}`;
      const { error: reserveError } = await admin.from("email_delivery_events").insert({
        event_fingerprint: eventFingerprint,
        provider: "LOKI",
        recipient_email: auth.user.email,
        event_type: "requested",
        subject: "Loki Music sur ton ordinateur",
        tags: ["web-companion-link"],
        occurred_at: now.toISOString(),
      });
      if (reserveError?.code === "23505") return json(429, { error: "email_rate_limited" });
      if (reserveError) throw reserveError;
      const sent = await sendTransactionalEmail(
        auth.user.email,
        "Loki Music sur ton ordinateur",
        lokiEmailCtaShell(
          "Loki Music sur ton ordinateur",
          "Ouvre Loki Music sur ton ordinateur",
          "Ouvre ce lien sur ton ordinateur, scanne son QR avec ton téléphone connecté puis confirme « Autoriser cet ordinateur ? ».",
          "AFFICHER LE QR",
          WEB_ROOT,
          "Ce lien ne connecte pas ton compte. Seule ta confirmation sur le téléphone autorise l’ordinateur.",
        ),
        `Ouvre ${WEB_ROOT} sur ton ordinateur. Scanne le QR avec ton téléphone connecté à Loki Music puis confirme « Autoriser cet ordinateur ? ». Ce lien seul ne connecte pas ton compte.`,
        "web-companion-link",
        "keep-web-pairing",
      );
      await admin.from("email_delivery_events").update({
        event_type: sent.ok ? "sent" : "error",
        provider: sent.ok ? sent.provider.toUpperCase() : "LOKI",
      }).eq("event_fingerprint", eventFingerprint);
      if (!sent.ok) return json(503, { error: "email_delivery_unavailable" });
      return json(200, { ok: true });
    }

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

    if (action === "inspect" || action === "cancel") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const pairing = await pairingByProof(String(body?.pairingId ?? ""), String(body?.token ?? ""));
      if (!pairing) return json(404, { error: "pairing_not_found" });
      if (pairing.status !== "WAITING") return json(409, { error: "pairing_not_waiting" });
      if (action === "cancel") {
        const { error } = await admin.from("web_pairings").update({ status: "CANCELLED", action_link: null })
          .eq("id", pairing.id).eq("status", "WAITING");
        if (error) throw error;
      }
      return json(200, { ok: true, deviceLabel: cleanLabel(pairing.device_label) });
    }

    if (action === "approve") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      if (body?.confirmed !== true) return json(400, { error: "explicit_confirmation_required" });
      const pairing = await pairingByProof(String(body?.pairingId ?? ""), String(body?.token ?? ""));
      if (!pairing) return json(404, { error: "pairing_not_found" });
      if (pairing.status !== "WAITING") return json(409, { error: "pairing_not_waiting", status: pairing.status });
      if (!auth.user.email || !auth.user.email_confirmed_at || /@keep\.local$/i.test(auth.user.email)) {
        return json(409, { error: "verified_email_required" });
      }

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: auth.user.email,
        options: { redirectTo: WEB_ROOT },
      });
      const actionLink = linkData?.properties?.action_link;
      if (linkError || !actionLink) {
        console.error("[keep-web-pairing] pairing_login_link_failed");
        return json(502, { error: "pairing_login_link_failed" });
      }

      const now = new Date().toISOString();
      const { data: approved, error } = await admin.from("web_pairings").update({
        status: "APPROVED",
        approved_user_id: auth.user.id,
        action_link: actionLink,
        approved_at: now,
      }).eq("id", pairing.id).eq("status", "WAITING").gt("expires_at", now).select("id").maybeSingle();
      if (error) throw error;
      if (!approved) return json(409, { error: "pairing_not_waiting" });
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
      if (!authSessionId) return json(401, { error: "auth_session_required" });
      const now = new Date().toISOString();
      const { data: existing, error: existingError } = await admin.from("web_companion_sessions")
        .select("id,device_label,created_at,last_seen_at,revoked_at,auth_session_id")
        .eq("pairing_id", pairing.id).eq("user_id", auth.user.id).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.revoked_at) return json(403, { error: "session_revoked" });
        if (existing.auth_session_id !== authSessionId) return json(403, { error: "pairing_session_mismatch" });
        const { error: claimError } = await admin.from("web_pairings").update({
          status: "CLAIMED", action_link: null, claimed_at: now,
        }).eq("id", pairing.id).eq("status", "APPROVED");
        if (claimError) throw claimError;
        return json(200, { ok: true, session: {
          id: existing.id, device_label: existing.device_label, created_at: existing.created_at,
          last_seen_at: existing.last_seen_at, revoked_at: existing.revoked_at,
        } });
      }
      if (pairing.status !== "APPROVED") return json(409, { error: "pairing_already_claimed" });
      const { data: session, error: sessionError } = await admin
        .from("web_companion_sessions")
        .insert({
          pairing_id: pairing.id,
          user_id: auth.user.id,
          auth_session_id: authSessionId,
          device_label: cleanLabel(pairing.device_label),
          last_seen_at: now,
        })
        .select("id,device_label,created_at,last_seen_at,revoked_at")
        .single();
      if (sessionError || !session) throw sessionError ?? new Error("session_register_failed");

      const { error: claimError } = await admin.from("web_pairings").update({
        status: "CLAIMED",
        action_link: null,
        claimed_at: now,
      }).eq("id", pairing.id).eq("status", "APPROVED");
      if (claimError) throw claimError;

      return json(200, { ok: true, session });
    }

    if (action === "status") {
      const auth = await requireUser(req);
      if ("error" in auth) return auth.error;
      const id = String(body?.sessionId ?? "");
      const { data, error } = await admin
        .from("web_companion_sessions")
        .select("id,revoked_at")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(200, { ok: true, revoked: true });
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
        .is("revoked_at", null)
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
        .select("id,pairing_id")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const { error: cancelError } = await admin.from("web_pairings").update({ status: "CANCELLED", action_link: null })
          .eq("id", data.pairing_id).eq("approved_user_id", auth.user.id);
        if (cancelError) throw cancelError;
      }
      return json(200, { ok: true, revoked: Boolean(data?.id) });
    }

    return json(400, { error: "unknown_action" });
  } catch {
    console.error("[keep-web-pairing] pairing_server_error");
    return json(500, { error: "pairing_server_error" });
  }
});
