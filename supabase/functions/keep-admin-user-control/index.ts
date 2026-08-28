import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Seules les informations que l'application utilisateur sait réellement
// demander et enregistrer sont acceptées ici. L'e-mail reste facultatif dans
// KEEP : le Super Admin ne peut donc pas créer une obligation silencieuse que
// l'app mobile ignorerait.
const ALLOWED = new Set([
  "BIRTH_DATE", "GENDER", "AVATAR", "CITY", "COUNTRY", "BIO", "SOCIAL_LINK", "WEBSITE",
]);

type Actor = { id: string; role: string };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });

async function requireAdmin(req: Request): Promise<Actor> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user) throw new Error("unauthorized");
  const { data: row, error: roleError } = await admin.from("admin_users").select("id,role,is_active").eq("id", auth.user.id).eq("is_active", true).maybeSingle();
  if (roleError || !row) throw new Error("admin_required");
  return { id: auth.user.id, role: String(row.role) };
}

function canRead(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SUPPORT" || role === "MODERATOR";
}
function canRequireProfileInfo(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SUPPORT";
}
function canBlockAccount(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}
function canModerateDiscovery(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "MODERATOR";
}
function canDestruct(role: string) {
  return role === "SUPER_ADMIN";
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `K!${body}7`;
}

async function audit(actorId: string, action: string, targetId: string, after: unknown) {
  await admin.from("audit_logs").insert({
    actor_admin_id: actorId,
    action,
    target_type: "profile",
    target_id: targetId,
    before: null,
    after,
  });
}

async function cleanupAvatarFolder(profileId: string) {
  const bucket = admin.storage.from("avatars");
  const { data: files } = await bucket.list(profileId, { limit: 100 });
  const paths = (files ?? []).filter((file) => file?.name).map((file) => `${profileId}/${file.name}`);
  if (paths.length) await bucket.remove(paths);
}

async function getUserSnapshot(profileId: string) {
  const [{ data: profile, error: profileError }, { data: privateInfo }, { data: socials }, { data: requirements }, authResult, keepResult, playlistResult, downloadResult, musicUsageResult] = await Promise.all([
    admin.from("profiles").select("id,username,display_name,bio,avatar_url,city,country_code,kind,website,is_public,discovery_hidden,created_at,updated_at").eq("id", profileId).maybeSingle(),
    admin.from("profile_private_info").select("birth_date,gender").eq("profile_id", profileId).maybeSingle(),
    admin.from("social_links").select("platform,url,visibility").eq("profile_id", profileId),
    admin.from("user_profile_requirements").select("requirements,updated_at").eq("profile_id", profileId).maybeSingle(),
    admin.auth.admin.getUserById(profileId),
    admin.from("keep_decisions").select("id,decision,visibility,context,source_user_id", { count: "exact" }).eq("profile_id", profileId),
    admin.from("playlists").select("id", { count: "exact", head: true }).eq("owner_id", profileId),
    admin.from("download_credit_usage").select("consumed_count").eq("profile_id", profileId).maybeSingle(),
    admin.from("music_usage_counters").select("recognized_count,last_recognized_at").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (profileError || !profile) throw new Error("profile_not_found");
  const authUser = authResult.data.user ?? null;
  const decisions = keepResult.data ?? [];
  const realEmail = authUser?.email && !authUser.email.endsWith("@keep.local") ? authUser.email : null;
  const socialKeeps = decisions.filter((row: any) => row.decision === "KEPT" && (row.context?.creditPolicy === "SOCIAL_ZERO_CREDIT" || row.source_user_id)).length;
  const ownKeeps = decisions.filter((row: any) => row.decision === "KEPT" && row.context?.creditPolicy !== "SOCIAL_ZERO_CREDIT" && !row.source_user_id).length;
  return {
    profile,
    privateInfo: privateInfo ?? null,
    socialLinks: socials ?? [],
    requirements: Array.isArray(requirements?.requirements) ? requirements.requirements : [],
    requirementsUpdatedAt: requirements?.updated_at ?? null,
    auth: {
      email: realEmail,
      emailVerified: Boolean(realEmail && authUser?.email_confirmed_at),
      emailConfirmedAt: realEmail ? authUser?.email_confirmed_at ?? null : null,
      isAnonymous: Boolean(authUser?.is_anonymous),
      bannedUntil: authUser?.banned_until ?? null,
    },
    usage: {
      kept: decisions.filter((row: any) => row.decision === "KEPT").length,
      ownKeeps,
      socialKeeps,
      passed: decisions.filter((row: any) => row.decision === "PASSED").length,
      publicKeeps: decisions.filter((row: any) => row.decision === "KEPT" && row.visibility === "PUBLIC").length,
      playlists: playlistResult.count ?? 0,
      downloadsConsumed: downloadResult.data?.consumed_count ?? 0,
      recognizedCount: musicUsageResult.data?.recognized_count ?? 0,
      lastRecognizedAt: musicUsageResult.data?.last_recognized_at ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const actor = await requireAdmin(req);
    if (!canRead(actor.role)) return json(403, { error: "role_forbidden" });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const profileId = String(body?.profileId ?? "").trim();
    if (!profileId) return json(400, { error: "profile_id_required" });

    if (action === "get") {
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "set_requirements") {
      if (!canRequireProfileInfo(actor.role)) return json(403, { error: "role_forbidden" });
      const input = Array.isArray(body?.requirements) ? body.requirements : [];
      const requirements = Array.from(new Set(input.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean)));
      if (requirements.some((item) => !ALLOWED.has(item))) return json(400, { error: "invalid_requirement" });
      const { data: profile } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
      if (!profile) return json(404, { error: "profile_not_found" });
      const { error } = await admin.from("user_profile_requirements").upsert({
        profile_id: profileId,
        requirements,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" });
      if (error) throw error;
      await audit(actor.id, "user.requirements.updated", profileId, { requirements });
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "set_blocked") {
      if (!canBlockAccount(actor.role)) return json(403, { error: "role_forbidden" });
      const blocked = Boolean(body?.blocked);
      const { data: current, error: currentError } = await admin.auth.admin.getUserById(profileId);
      if (currentError || !current.user) return json(404, { error: "profile_not_found" });
      const { error } = await admin.auth.admin.updateUserById(profileId, { ban_duration: blocked ? "876000h" : "none" });
      if (error) throw error;
      await audit(actor.id, blocked ? "user.blocked" : "user.unblocked", profileId, { blocked });
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "set_discovery_hidden") {
      if (!canModerateDiscovery(actor.role)) return json(403, { error: "role_forbidden" });
      const hidden = Boolean(body?.hidden);
      const { data: profile, error } = await admin.from("profiles").update({ discovery_hidden: hidden }).eq("id", profileId).select("id").maybeSingle();
      if (error) throw error;
      if (!profile) return json(404, { error: "profile_not_found" });
      await audit(actor.id, hidden ? "user.discovery.hidden" : "user.discovery.visible", profileId, { discoveryHidden: hidden });
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "reset_password") {
      if (!canDestruct(actor.role)) return json(403, { error: "role_forbidden" });
      if (profileId === actor.id) return json(409, { error: "cannot_reset_self_here" });
      const { data: existing, error: existingError } = await admin.auth.admin.getUserById(profileId);
      if (existingError || !existing.user) return json(404, { error: "profile_not_found" });
      const temporaryPassword = generateTemporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(profileId, { password: temporaryPassword });
      if (error) throw error;
      await audit(actor.id, "user.password.reset", profileId, { temporary: true, emailSent: false });
      return json(200, { ok: true, temporaryPassword, data: await getUserSnapshot(profileId) });
    }

    if (action === "delete") {
      if (!canDestruct(actor.role)) return json(403, { error: "role_forbidden" });
      if (profileId === actor.id) return json(409, { error: "cannot_delete_self" });
      const { data: existing } = await admin.from("profiles").select("username").eq("id", profileId).maybeSingle();
      if (!existing) return json(404, { error: "profile_not_found" });

      await audit(actor.id, "user.deleted", profileId, { username: existing.username });
      await cleanupAvatarFolder(profileId).catch(() => {});

      const { error } = await admin.auth.admin.deleteUser(profileId, false);
      if (error) throw error;

      const { data: remainingProfile, error: verifyError } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
      if (verifyError) throw verifyError;
      if (remainingProfile) {
        const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", profileId);
        if (profileDeleteError) throw profileDeleteError;
      }

      const { data: stillThere } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
      if (stillThere) throw new Error("delete_incomplete");
      return json(200, { ok: true, deleted: true, profileId });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "admin_required" || message === "role_forbidden" ? 403 : message === "profile_not_found" ? 404 : message === "delete_incomplete" ? 409 : 500;
    return json(status, { error: message });
  }
});
