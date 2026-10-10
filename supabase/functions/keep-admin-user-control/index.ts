import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const directDb = DB_URL ? postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 10 }) : null;
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

  // Incident 02/10/2026 : PostgREST peut tomber en PGRST002 alors que
  // PostgreSQL + Supabase Auth restent sains. Le Super Admin ne doit pas
  // perdre l'accès aux dossiers utilisateurs pendant cette panne.
  if (directDb) {
    try {
      const rows = await directDb`
        select id::text as id, role::text as role, is_active
        from public.admin_users
        where id = ${auth.user.id}::uuid
          and is_active = true
        limit 1
      `;
      const row: any = rows[0];
      if (!row) throw new Error("admin_required");
      return { id: auth.user.id, role: String(row.role) };
    } catch (directError) {
      if (String((directError as any)?.message ?? directError) === "admin_required") throw directError;
      console.error("[keep-admin-user-control] direct admin lookup failed", directError);
    }
  }

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
function canGrantCredits(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
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
  if (directDb) {
    try {
      const [
        profileRows,
        privateRows,
        socialRows,
        requirementRows,
        decisionRows,
        playlistRows,
        downloadRows,
        usageRows,
        authResult,
      ] = await Promise.all([
        directDb`
          select id::text as id, username, display_name, bio, avatar_url, city,
                 country_code, kind::text as kind, website, is_public,
                 discovery_hidden, created_at, updated_at, follower_count_override
          from public.profiles
          where id = ${profileId}::uuid
          limit 1
        `,
        directDb`
          select birth_date, gender::text as gender
          from public.profile_private_info
          where profile_id = ${profileId}::uuid
          limit 1
        `,
        directDb`
          select platform::text as platform, url, visibility::text as visibility
          from public.social_links
          where profile_id = ${profileId}::uuid
          order by created_at asc
        `,
        directDb`
          select requirements, updated_at
          from public.user_profile_requirements
          where profile_id = ${profileId}::uuid
          limit 1
        `,
        directDb`
          select id, decision::text as decision, visibility::text as visibility,
                 context, source_user_id::text as source_user_id, source_type::text as source_type
          from public.keep_decisions
          where profile_id = ${profileId}::uuid
        `,
        directDb`
          select count(*)::int as count
          from public.playlists
          where owner_id = ${profileId}::uuid
        `,
        directDb`
          select consumed_count
          from public.download_credit_usage
          where profile_id = ${profileId}::uuid
          limit 1
        `,
        directDb`
          select recognized_count, last_recognized_at
          from public.music_usage_counters
          where profile_id = ${profileId}::uuid
          limit 1
        `,
        admin.auth.admin.getUserById(profileId),
      ]);

      const profile: any = profileRows[0];
      if (!profile) throw new Error("profile_not_found");
      const privateInfo: any = privateRows[0] ?? null;
      const requirements: any = requirementRows[0] ?? null;
      const authUser = (authResult as any)?.data?.user ?? null;
      const decisions: any[] = Array.from(decisionRows as any);
      const realEmail = authUser?.email && !authUser.email.endsWith("@keep.local") ? authUser.email : null;
      const isSocialKeep = (row: any) => row?.decision === "KEPT" && (
        row?.context?.creditPolicy === "SOCIAL_ZERO_CREDIT"
        || Boolean(row?.source_user_id)
        || row?.source_type === "profile"
        || Boolean(typeof row?.context?.sourceProfileId === "string" && row.context.sourceProfileId.trim())
      );
      const socialKeeps = decisions.filter(isSocialKeep).length;
      const ownKeeps = decisions.filter((row: any) => row.decision === "KEPT" && !isSocialKeep(row)).length;

      return {
        profile,
        privateInfo,
        socialLinks: Array.from(socialRows as any),
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
          playlists: Number((playlistRows as any)[0]?.count ?? 0),
          downloadsConsumed: Number((downloadRows as any)[0]?.consumed_count ?? 0),
          recognizedCount: Number((usageRows as any)[0]?.recognized_count ?? 0),
          lastRecognizedAt: (usageRows as any)[0]?.last_recognized_at ?? null,
        },
      };
    } catch (directError) {
      if (String((directError as any)?.message ?? directError) === "profile_not_found") throw directError;
      console.error("[keep-admin-user-control] direct snapshot failed", directError);
    }
  }

  const [{ data: profile, error: profileError }, { data: privateInfo }, { data: socials }, { data: requirements }, authResult, keepResult, playlistResult, downloadResult, musicUsageResult] = await Promise.all([
    admin.from("profiles").select("id,username,display_name,bio,avatar_url,city,country_code,kind,website,is_public,discovery_hidden,created_at,updated_at,follower_count_override").eq("id", profileId).maybeSingle(),
    admin.from("profile_private_info").select("birth_date,gender").eq("profile_id", profileId).maybeSingle(),
    admin.from("social_links").select("platform,url,visibility").eq("profile_id", profileId),
    admin.from("user_profile_requirements").select("requirements,updated_at").eq("profile_id", profileId).maybeSingle(),
    admin.auth.admin.getUserById(profileId),
    admin.from("keep_decisions").select("id,decision,visibility,context,source_user_id,source_type", { count: "exact" }).eq("profile_id", profileId),
    admin.from("playlists").select("id", { count: "exact", head: true }).eq("owner_id", profileId),
    admin.from("download_credit_usage").select("consumed_count").eq("profile_id", profileId).maybeSingle(),
    admin.from("music_usage_counters").select("recognized_count,last_recognized_at").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (profileError || !profile) throw new Error("profile_not_found");
  const authUser = authResult.data.user ?? null;
  const decisions = keepResult.data ?? [];
  const realEmail = authUser?.email && !authUser.email.endsWith("@keep.local") ? authUser.email : null;
  const isSocialKeep = (row: any) => row?.decision === "KEPT" && (
    row?.context?.creditPolicy === "SOCIAL_ZERO_CREDIT"
    || Boolean(row?.source_user_id)
    || row?.source_type === "profile"
    || Boolean(typeof row?.context?.sourceProfileId === "string" && row.context.sourceProfileId.trim())
  );
  const socialKeeps = decisions.filter(isSocialKeep).length;
  const ownKeeps = decisions.filter((row: any) => row.decision === "KEPT" && !isSocialKeep(row)).length;
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

    if (action === "set_email") {
      // Adel (01/09/2026) : pour les comptes créés avant que l'e-mail devienne
      // obligatoire (frère, amis...), permet d'attribuer une adresse a
      // posteriori depuis Super Admin plutôt que de dépendre de l'utilisateur
      // lui-même. Même sensibilité que reset_password (change l'identifiant
      // de connexion) -- réservé SUPER_ADMIN.
      if (!canDestruct(actor.role)) return json(403, { error: "role_forbidden" });
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith("@keep.local")) {
        return json(400, { error: "invalid_email" });
      }
      const { data: existing, error: existingError } = await admin.auth.admin.getUserById(profileId);
      if (existingError || !existing.user) return json(404, { error: "profile_not_found" });
      const { error } = await admin.auth.admin.updateUserById(profileId, { email, email_confirm: true });
      if (error) {
        const message = String((error as any)?.message ?? "").toLowerCase();
        if (message.includes("already") || message.includes("registered") || message.includes("duplicate") || message.includes("exists")) {
          return json(409, { error: "email_taken" });
        }
        throw error;
      }
      await audit(actor.id, "user.email.set", profileId, { email });
      return json(200, { ok: true, email, data: await getUserSnapshot(profileId) });
    }

    if (action === "grant_credits") {
      // Adel (04/09/2026) : "je puisse rajouter du Free pour recréditer et ça
      // enverra une notification ... par exemple offrir un bonus pour un bug."
      // Ledger dédié (admin_credit_grants), jamais un UPDATE direct d'un
      // compteur -- garde un historique audité de chaque geste manuel, et
      // s'additionne proprement à la formule Free déjà unifiée partout
      // ailleurs (keep_theoretical_free_credit_remaining_for_profile).
      if (!canGrantCredits(actor.role)) return json(403, { error: "role_forbidden" });
      const amount = Math.trunc(Number(body?.amount));
      if (!Number.isFinite(amount) || amount === 0) return json(400, { error: "invalid_amount" });
      const reason = String(body?.reason ?? "").trim().slice(0, 300);
      const { data: profile, error: profileError } = await admin.from("profiles").select("id,username").eq("id", profileId).maybeSingle();
      if (profileError || !profile) return json(404, { error: "profile_not_found" });
      const { error: grantError } = await admin.from("admin_credit_grants").insert({ profile_id: profileId, amount, reason, granted_by: actor.id });
      if (grantError) throw grantError;
      const title = amount > 0 ? `🎁 Loki Music t'offre ${amount} Free` : `Ajustement de ton solde Free`;
      const notifBody = reason || (amount > 0 ? "Un petit geste de Loki Music -- profites-en !" : "Ton solde Free a été ajusté par Loki Music.");
      await admin.from("notifications").insert({ profile_id: profileId, type: "ADMIN_CREDIT_GRANT", title, body: notifBody, data: { amount, reason } });
      await audit(actor.id, "user.credits.granted", profileId, { amount, reason });
      const { data: creditRemaining } = await admin.rpc("keep_theoretical_free_credit_remaining_for_profile", { p_uid: profileId });
      return json(200, { ok: true, creditRemaining: Number(creditRemaining ?? 0), data: await getUserSnapshot(profileId) });
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
