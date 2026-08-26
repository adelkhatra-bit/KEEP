import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().replace(/^@+/, "").normalize("NFKC");
}

function validUsername(value: string) {
  return value.length >= 3 && value.length <= 30 && /^[\p{L}\p{N}._-]+$/u.test(value);
}

function validPassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}

function syntheticEmail(userId: string) {
  return `${userId}@keep.local`;
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

async function profileByUsername(username: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,username,is_public")
    .ilike("username", username)
    .limit(2);
  if (error) throw error;
  return data ?? [];
}

async function bearerUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === ANON_KEY) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");

    if (!validUsername(username)) return json({ ok: false, error: "invalid_username" });
    if (!validPassword(password)) return json({ ok: false, error: "invalid_password" });

    const matches = await profileByUsername(username);
    if (matches.length > 1) return json({ ok: false, error: "username_conflict" });
    const existingProfile = matches[0] ?? null;

    if (action === "login") {
      if (!existingProfile) return json({ ok: false, error: "invalid_credentials" });
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfile.id);
      if (userError || !userData.user?.email || userData.user.is_anonymous) {
        return json({ ok: false, error: "account_not_created" });
      }
      const signed = await sessionFor(userData.user.email, password);
      if (!signed.ok) return json({ ok: false, error: signed.error });
      return json({ ok: true, username: existingProfile.username, ...signed.session });
    }

    if (action !== "signup") return json({ ok: false, error: "invalid_action" });

    let userId: string;
    let email: string;

    if (existingProfile) {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfile.id);
      if (userError || !userData.user) return json({ ok: false, error: "profile_orphaned" });
      if (!userData.user.is_anonymous && userData.user.email) {
        return json({ ok: false, error: "username_taken" });
      }

      // Un ancien profil anonyme ne peut être converti que depuis la session
      // anonyme qui l'a réellement créé. Le pseudo seul n'est jamais une preuve
      // de propriété et ne permet donc pas de voler un profil public existant.
      const callerId = await bearerUserId(req);
      if (!callerId || callerId !== existingProfile.id) {
        return json({ ok: false, error: "legacy_profile_requires_original_device" });
      }

      userId = existingProfile.id;
      email = syntheticEmail(userId);
      const { error: upgradeError } = await admin.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { ...(userData.user.user_metadata ?? {}), keep_username: username },
      });
      if (upgradeError) throw upgradeError;
    } else {
      userId = crypto.randomUUID();
      email = syntheticEmail(userId);
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        id: userId,
        email,
        password,
        email_confirm: true,
        user_metadata: { keep_username: username },
      });
      if (createError || !created.user) throw createError ?? new Error("create_user_failed");

      const { error: profileError } = await admin.from("profiles").insert({
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
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        throw profileError;
      }
    }

    const signed = await sessionFor(email, password);
    if (!signed.ok) return json({ ok: false, error: signed.error });
    return json({ ok: true, username, ...signed.session });
  } catch (error) {
    console.error("[keep-username-auth]", error);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
