import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const directDb = DB_URL ? postgres(DB_URL, {
  prepare: false,
  max: 1,
  idle_timeout: 10,
  connect_timeout: 2,
}) : null;
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
const validUsername = (value: string) => value.length >= 1 && value.length <= 30 && /^[\p{L}\p{N}._-]+$/u.test(value);
const validEmail = (value: string) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: string) => value.length >= 6 && value.length <= 128;
const syntheticEmail = (userId: string) => `${userId.toLowerCase()}@keep.local`;
// Un pseudo Loki valide peut contenir `_` et `.` (cf. validUsername). Or `_`
// et `%` sont des jokers LIKE : passer le pseudo brut à `.ilike()` traite
// donc "adel_4a" comme "adel<n'importe quel caractère>4a", ce qui peut
// remonter PLUSIEURS profils (-> faux `username_conflict`) ou le mauvais
// compte. On échappe ces métacaractères pour obtenir une correspondance
// exacte insensible à la casse. `\` reste le caractère d'échappement LIKE
// par défaut de Postgres.
const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

function looksLikeDuplicateEmail(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return message.includes("already") || message.includes("registered") || message.includes("duplicate") || message.includes("exists");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withDeadline<T>(operation: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function transientAuthFailure(error: unknown) {
  const status = Number((error as any)?.status ?? (error as any)?.context?.status ?? 0);
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return status >= 500
    || message.includes("context deadline exceeded")
    || message.includes("context canceled")
    || message.includes("upstream request timeout")
    || message.includes("failed to connect")
    || message.includes("unexpected_failure")
    || message.includes("request_timeout")
    || message.includes("service unavailable")
    || message.includes("internal server error");
}

async function sessionFor(email: string, password: string) {
  let lastError: unknown = null;
  // Incident 02/10/2026 : deux timeouts Auth 504 peuvent se succéder avant
  // qu'une troisième tentative identique passe. Le retry reste limité aux
  // erreurs transitoires 5xx/timeout et ne masque jamais un mauvais mot de passe.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let data: any = null;
    let error: any = null;
    try {
      const result: any = await withDeadline(
        publicAuth.auth.signInWithPassword({ email, password }),
        3000,
        "auth_signin_timeout",
      );
      data = result?.data ?? null;
      error = result?.error ?? null;
    } catch (signinError) {
      error = signinError;
    }
    if (!error && data.session) {
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
    lastError = error;
    if (!error || !transientAuthFailure(error) || attempt === 2) break;
    await wait(450 * (2 ** attempt));
  }
  if (lastError && transientAuthFailure(lastError)) {
    return { ok: false as const, error: "auth_temporarily_unavailable" };
  }
  return { ok: false as const, error: "invalid_credentials" };
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

async function findAuthUserByUsername(username: string) {
  const target = normalizeUsername(username).toLocaleLowerCase('fr-FR');
  // Fallback de panne uniquement. Le chemin normal reste l'index SQL/PostgREST.
  // Tant que le parc legacy est petit, Supabase Auth permet de continuer à
  // connecter les utilisateurs même si le schema-cache REST est indisponible.
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => {
      const value = normalizeUsername(user.user_metadata?.keep_username)
        .toLocaleLowerCase('fr-FR');
      return value === target;
    });
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

function transientProfileLookupFailure(error: unknown) {
  const code = String((error as any)?.code ?? '').toUpperCase();
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return transientAuthFailure(error)
    || code === 'PGRST002'
    || message.includes('schema cache')
    || message.includes('could not query the database');
}

async function profileByUsername(username: string) {
  // Login critique : contourne PostgREST/schema-cache. La requête SQL directe
  // utilise l'index unique lower(username) et reste O(log n) même à grande échelle.
  if (directDb) {
    try {
      const rows = await withDeadline(directDb`
        select
          p.id::text as id,
          p.username,
          p.is_public,
          u.email,
          u.is_anonymous
        from public.profiles p
        join auth.users u on u.id = p.id
        where lower(p.username) = lower(${username})
        limit 2
      `, 1500, "direct_profile_lookup_timeout");
      return rows.map((row: any) => ({
        id: String(row.id),
        username: String(row.username ?? ""),
        is_public: row.is_public !== false,
        email: normalizeEmail(row.email),
        is_anonymous: Boolean(row.is_anonymous),
      }));
    } catch (error) {
      console.error("[keep-username-auth] direct profile lookup failed", error);
    }
  }

  // Fallback PostgREST borné. Un schema-cache bloqué ne doit jamais garder
  // l'écran de connexion ouvert indéfiniment.
  let restError: unknown = null;
  try {
    const result: any = await withDeadline(
      admin.from("profiles").select("id,username,is_public").ilike("username", escapeLikePattern(username)).limit(2),
      1800,
      "postgrest_profile_lookup_timeout",
    );
    if (!result?.error) return result?.data ?? [];
    restError = result.error;
  } catch (error) {
    restError = error;
  }

  // Incident 02/10/2026 : PostgREST peut perdre son schema-cache alors que
  // Supabase Auth reste accessible. Le fallback Auth est temporaire et borné ;
  // le chemin normal reste l'index unique lower(username), O(log n).
  if (transientProfileLookupFailure(restError)) {
    const authUser = await withDeadline(findAuthUserByUsername(username), 2500, "auth_username_lookup_timeout").catch(() => null);
    if (authUser) {
      const keepUsername = normalizeUsername(authUser.user_metadata?.keep_username) || username;
      return [{ id: authUser.id, username: keepUsername, is_public: true }];
    }
  }

  throw restError;
}

async function profileById(id: string) {
  if (directDb) {
    try {
      const rows = await withDeadline(directDb`
        select id::text as id, username
        from public.profiles
        where id = ${id}::uuid
        limit 1
      `, 1500, "direct_profile_id_lookup_timeout");
      const row: any = rows[0];
      return row ? { id: String(row.id), username: String(row.username ?? "") } : null;
    } catch (error) {
      console.error("[keep-username-auth] direct profile id lookup failed", error);
    }
  }
  const { data } = await admin.from("profiles").select("id,username").eq("id", id).maybeSingle();
  return data ?? null;
}

async function updateProfileUsername(userId: string, username: string) {
  if (directDb) {
    await directDb`
      update public.profiles
      set username = ${username}, display_name = ${username}, updated_at = now()
      where id = ${userId}::uuid
    `;
    return;
  }
  const { error } = await admin.from("profiles").update({ username, display_name: username, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}

async function createProfile(userId: string, username: string) {
  if (directDb) {
    await directDb`
      insert into public.profiles (
        id, username, display_name, bio, avatar_url, country_code, city,
        kind, language_code, is_public, location_opt_in, website,
        favorite_genres, favorite_artists
      ) values (
        ${userId}::uuid, ${username}, ${username}, '', null, null, null,
        'USER', 'fr', true, false, null, '{}'::text[], '{}'::text[]
      )
      on conflict (id) do update
      set username = excluded.username,
          display_name = excluded.display_name,
          updated_at = now()
    `;
    return;
  }

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

    // Avec le chemin SQL direct, l'identité Auth est déjà jointe au profil :
    // aucun appel admin.getUserById() supplémentaire n'est nécessaire.
    let loginEmail = normalizeEmail((existingProfile as any).email);
    let isAnonymous = Boolean((existingProfile as any).is_anonymous);

    if (!loginEmail) {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(existingProfile.id);
      if (userError || !userData.user?.email || userData.user.is_anonymous) return json({ ok: false, error: "account_not_created" });
      loginEmail = normalizeEmail(userData.user.email);
      isAnonymous = Boolean(userData.user.is_anonymous);
    }

    if (!loginEmail || isAnonymous) return json({ ok: false, error: "account_not_created" });
    const signed = await sessionFor(loginEmail, password);
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
        await updateProfileUsername(existingEmailUser.id, username);
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

    if (action === "health") {
      if (!directDb) return json({ ok: false, direct_db: false, error: "database_url_unavailable" }, 503);
      const rows = await withDeadline(directDb`select 1 as ok`, 1200, "direct_db_health_timeout");
      return json({ ok: Number((rows[0] as any)?.ok ?? 0) === 1, direct_db: true });
    }

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