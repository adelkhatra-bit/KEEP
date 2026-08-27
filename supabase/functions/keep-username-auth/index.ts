import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const publicAuth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });
const normalizeUsername = (value: unknown) => String(value ?? "").trim().replace(/^@+/, "").normalize("NFKC");
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validUsername = (value: string) => value.length >= 3 && value.length <= 30 && /^[\p{L}\p{N}._-]+$/u.test(value);
const validEmail = (value: string) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: string) => value.length >= 8 && value.length <= 128;
const syntheticEmail = (userId: string) => `${userId.toLowerCase()}@keep.local`;

function looksLikeDuplicateEmail(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return message.includes("already") || message.includes("registered") || message.includes("duplicate") || message.includes("exists");
}

async function sessionFor(email: string, password: string) {
  const { data, error } = await publicAuth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false as const, error: "invalid_credentials" };
  return {
    ok: true as const,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? null,
      user_id: data.session.user.id,
    },
  };
}

async function findAuthUserByEmail(email: string) {
  const target = normalizeEmail(email);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => normalizeEmail(user.email) === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function profileByUsername(username: string) {
  const { data, error } = await admin.from("profiles").select("id,username,is_public").ilike("username", username).limit(2);
  if (error) throw error;
  return data ?? [];
}

async function profileById(id: string) {
  const { data } = await admin.from("profiles").select("id,username").eq("id", id).maybeSingle();
  return data ?? null;
}

async function createProfile(userId: string, username: string) {
  const payload = {
    id: userId,
    username,
    display_name: username,
    bio: "",
    avatar_url: null,
    country_code: null,
    city: null,
    kind: "USER",
    language_code: "fr",
    is_public: true,
    location_opt_in: false,
    website: null,
    favorite_genres: [],
    favorite_artists: [],
  };
  const { error } = await admin.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function bearerUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === ANON_KEY || token.startsWith("sb_")) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function usernameFlow(req: Request, action: string, username: string, password: string) {
  if (!validUsername(username)) return json({ ok: false, error: "invalid_username" });
  if (!validPassword(password)) return json({ ok: false, error: "invalid_password" });

  const matches = await profileByUsername(username);
  if (matches.length > 1) return json({ ok: false, error: "username_conflict" });
  const existingProfile = matches[0] ?? null;

  if (action === "login") {
    if (!existingProfile) return json({ ok: false, error: "invalid_credentials" });
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfile.id);
    if (userError || !userData.user?.email || userData.user.is_anonymous) return json({ ok: false, error: "account_not_created" });
    const signed = await sessionFor(userData.user.email, password);
    if (!signed.ok) return json({ ok: false, error: signed.error });
    return json({ ok: true, username: existingProfile.username, ...signed.session });
  }

  if (action !== "signup") return json({ ok: false, error: "invalid_action" });

  let userId: string;
  let loginEmail: string;

  if (existingProfile) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfile.id);
    if (userError || !userData.user) return json({ ok: false, error: "profile_orphaned" });

    if (userData.user.is_anonymous) {
      const callerId = await bearerUserId(req);
      if (!callerId || callerId !== existingProfile.id) return json({ ok: false, error: "legacy_profile_requires_original_device" });
      userId = existingProfile.id;
      loginEmail = syntheticEmail(userId);
      const { error: upgradeError } = await admin.auth.admin.updateUserById(userId, {
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: { ...(userData.user.user_metadata ?? {}), keep_username: username, keep_username_only: true },
      });
      if (upgradeError) {
        if (looksLikeDuplicateEmail(upgradeError)) return json({ ok: false, error: "username_taken" });
        throw upgradeError;
      }
    } else {
      return json({ ok: false, error: "username_taken" });
    }
  } else {
    userId = crypto.randomUUID();
    loginEmail = syntheticEmail(userId);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      id: userId,
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { keep_username: username, keep_username_only: true },
    });
    if (createError || !created.user) {
      if (looksLikeDuplicateEmail(createError)) return json({ ok: false, error: "username_taken" });
      throw createError ?? new Error("create_user_failed");
    }
    try {
      await createProfile(userId, username);
    } catch (error) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw error;
    }
  }

  const signed = await sessionFor(loginEmail, password);
  if (!signed.ok) return json({ ok: false, error: signed.error });
  return json({ ok: true, username, ...signed.session, username_only: true });
}

async function emailFlow(req: Request, action: string, username: string, email: string, password: string) {
  if (!validEmail(email)) return json({ ok: false, error: "invalid_email" });
  if (!validPassword(password)) return json({ ok: false, error: "invalid_password" });

  if (action === "login") {
    const signed = await sessionFor(email, password);
    if (!signed.ok) return json({ ok: false, error: signed.error });
    const profile = await profileById(signed.session.user_id);
    return json({ ok: true, username: profile?.username ?? null, ...signed.session });
  }

  if (action !== "signup") return json({ ok: false, error: "invalid_action" });
  if (!validUsername(username)) return json({ ok: false, error: "invalid_username" });

  const matches = await profileByUsername(username);
  if (matches.length > 1) return json({ ok: false, error: "username_conflict" });
  const existingProfileForUsername = matches[0] ?? null;
  const existingEmailUser = await findAuthUserByEmail(email);

  if (existingEmailUser) {
    let proof = await sessionFor(email, password);
    if (!proof.ok || proof.session.user_id !== existingEmailUser.id) {
      const callerId = await bearerUserId(req);
      if (!callerId || callerId !== existingEmailUser.id) return json({ ok: false, error: "email_taken" });
      const { error: passwordError } = await admin.auth.admin.updateUserById(existingEmailUser.id, { password });
      if (passwordError) throw passwordError;
      proof = await sessionFor(email, password);
      if (!proof.ok || proof.session.user_id !== existingEmailUser.id) return json({ ok: false, error: "invalid_credentials" });
    }

    if (existingProfileForUsername && existingProfileForUsername.id !== existingEmailUser.id) return json({ ok: false, error: "username_taken" });
    const existingOwnProfile = await profileById(existingEmailUser.id);
    if (existingOwnProfile) {
      if (existingOwnProfile.username !== username) {
        const { error: updateProfileError } = await admin.from("profiles").update({ username, updated_at: new Date().toISOString() }).eq("id", existingEmailUser.id);
        if (updateProfileError) throw updateProfileError;
      }
    } else {
      await createProfile(existingEmailUser.id, username);
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(existingEmailUser.id, {
      user_metadata: { ...(existingEmailUser.user_metadata ?? {}), keep_username: username, keep_username_only: false },
    });
    if (metadataError) throw metadataError;
    return json({ ok: true, username, ...proof.session, reused_existing_identity: true });
  }

  let userId: string;
  if (existingProfileForUsername) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfileForUsername.id);
    if (userError || !userData.user) return json({ ok: false, error: "profile_orphaned" });

    if (userData.user.is_anonymous) {
      const callerId = await bearerUserId(req);
      if (!callerId || callerId !== existingProfileForUsername.id) return json({ ok: false, error: "legacy_profile_requires_original_device" });
      const { error: upgradeError } = await admin.auth.admin.updateUserById(existingProfileForUsername.id, {
        email,
        password,
        email_confirm: true,
        user_metadata: { ...(userData.user.user_metadata ?? {}), keep_username: username },
      });
      if (upgradeError) {
        if (looksLikeDuplicateEmail(upgradeError)) return json({ ok: false, error: "email_taken" });
        throw upgradeError;
      }
      userId = existingProfileForUsername.id;
    } else if (userData.user.email?.endsWith("@keep.local")) {
      const proof = await sessionFor(userData.user.email, password);
      if (!proof.ok) return json({ ok: false, error: "username_taken" });
      const { error: upgradeError } = await admin.auth.admin.updateUserById(existingProfileForUsername.id, {
        email,
        email_confirm: true,
        user_metadata: { ...(userData.user.user_metadata ?? {}), keep_username: username, keep_username_only: false },
      });
      if (upgradeError) {
        if (looksLikeDuplicateEmail(upgradeError)) return json({ ok: false, error: "email_taken" });
        throw upgradeError;
      }
      userId = existingProfileForUsername.id;
    } else {
      return json({ ok: false, error: "username_taken" });
    }
  } else {
    userId = crypto.randomUUID();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
      user_metadata: { keep_username: username },
    });
    if (createError || !created.user) {
      if (looksLikeDuplicateEmail(createError)) return json({ ok: false, error: "email_taken" });
      throw createError ?? new Error("create_user_failed");
    }
    try {
      await createProfile(userId, username);
    } catch (error) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw error;
    }
  }

  const signed = await sessionFor(email, password);
  if (!signed.ok) return json({ ok: false, error: signed.error });
  return json({ ok: true, username, ...signed.session });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const username = normalizeUsername(body?.username);
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? "");

    if (!email || body?.username_only === "1" || body?.legacy_username === "1") {
      return await usernameFlow(req, action, username, password);
    }
    return await emailFlow(req, action, username, email, password);
  } catch (error) {
    console.error("[keep-username-auth]", error);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
