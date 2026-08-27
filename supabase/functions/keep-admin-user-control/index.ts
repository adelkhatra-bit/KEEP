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

const ALLOWED = new Set([
  "EMAIL_VERIFIED", "BIRTH_DATE", "GENDER", "AVATAR", "CITY", "COUNTRY", "BIO", "SOCIAL_LINK", "WEBSITE",
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

function canManage(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SUPPORT";
}
function canDestruct(role: string) {
  return role === "SUPER_ADMIN";
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
  const [{ data: profile, error: profileError }, { data: privateInfo }, { data: socials }, { data: requirements }, authResult, keepResult, playlistResult, downloadResult] = await Promise.all([
    admin.from("profiles").select("id,username,display_name,bio,avatar_url,city,country_code,kind,website,is_public,created_at,updated_at").eq("id", profileId).maybeSingle(),
    admin.from("profile_private_info").select("birth_date,gender").eq("profile_id", profileId).maybeSingle(),
    admin.from("social_links").select("platform,url,visibility").eq("profile_id", profileId),
    admin.from("user_profile_requirements").select("requirements,updated_at").eq("profile_id", profileId).maybeSingle(),
    admin.auth.admin.getUserById(profileId),
    admin.from("keep_decisions").select("id,decision,visibility", { count: "exact" }).eq("profile_id", profileId),
    admin.from("playlists").select("id", { count: "exact", head: true }).eq("owner_id", profileId),
    admin.from("download_credit_usage").select("consumed_count").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (profileError || !profile) throw new Error("profile_not_found");
  const authUser = authResult.data.user ?? null;
  const decisions = keepResult.data ?? [];
  const realEmail = authUser?.email && !authUser.email.endsWith("@keep.local") ? authUser.email : null;
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
      passed: decisions.filter((row: any) => row.decision === "PASSED").length,
      publicKeeps: decisions.filter((row: any) => row.decision === "KEPT" && row.visibility === "PUBLIC").length,
      playlists: playlistResult.count ?? 0,
      downloadsConsumed: downloadResult.data?.consumed_count ?? 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const actor = await requireAdmin(req);
    if (!canManage(actor.role)) return json(403, { error: "role_forbidden" });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const profileId = String(body?.profileId ?? "").trim();
    if (!profileId) return json(400, { error: "profile_id_required" });

    if (action === "get") {
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "set_requirements") {
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
      const blocked = Boolean(body?.blocked);
      if (actor.role === "SUPPORT") return json(403, { error: "role_forbidden" });
      const { data: current, error: currentError } = await admin.auth.admin.getUserById(profileId);
      if (currentError || !current.user) return json(404, { error: "profile_not_found" });
      const { error } = await admin.auth.admin.updateUserById(profileId, { ban_duration: blocked ? "876000h" : "none" });
      if (error) throw error;
      await audit(actor.id, blocked ? "user.blocked" : "user.unblocked", profileId, { blocked });
      return json(200, { ok: true, data: await getUserSnapshot(profileId) });
    }

    if (action === "delete") {
      if (!canDestruct(actor.role)) return json(403, { error: "role_forbidden" });
      if (profileId === actor.id) return json(409, { error: "cannot_delete_self" });
      const { data: existing } = await admin.from("profiles").select("username").eq("id", profileId).maybeSingle();
      if (!existing) return json(404, { error: "profile_not_found" });

      await audit(actor.id, "user.deleted", profileId, { username: existing.username });
      await cleanupAvatarFolder(profileId).catch(() => {});

      const { error } = await admin.auth.admin.deleteUser(profileId);
      if (error) throw error;

      const { data: remainingProfile, error: verifyError } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
      if (verifyError) throw verifyError;
      if (remainingProfile) throw new Error("delete_incomplete");

      return json(200, { ok: true, deleted: true, profileId });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "admin_required" || message === "role_forbidden" ? 403 : message === "profile_not_found" ? 404 : message === "delete_incomplete" ? 409 : 500;
    return json(status, { error: message });
  }
});