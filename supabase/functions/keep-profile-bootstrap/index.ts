import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const db = DB_URL ? postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 10 }) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function authenticatedUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) return data.user;
    if (attempt < 2) await wait(250 * (attempt + 1));
  }
  return null;
}

async function readProfile(userId: string) {
  if (!db) throw new Error("database_url_unavailable");
  const rows = await db`
    select
      p.*,
      coalesce((
        select json_agg(json_build_object(
          'platform', s.platform,
          'url', s.url,
          'visibility', s.visibility,
          'label', s.label
        ) order by s.created_at asc)
        from public.social_links s
        where s.profile_id = p.id
      ), '[]'::json) as social_links,
      (
        select pi.birth_date
        from public.profile_private_info pi
        where pi.profile_id = p.id
        limit 1
      ) as birth_date,
      (
        select pi.gender::text
        from public.profile_private_info pi
        where pi.profile_id = p.id
        limit 1
      ) as gender,
      (
        select count(*)::int
        from public.follows f
        where f.followee_id = p.id
      ) as follower_count,
      (
        select count(*)::int
        from public.follows f
        where f.follower_id = p.id
      ) as following_count
    from public.profiles p
    where p.id = ${userId}::uuid
    limit 1
  `;
  return rows[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const user = await authenticatedUser(req);
    if (!user) return json({ ok: false, error: "authentication_required" }, 401);
    if (!db) return json({ ok: false, error: "database_url_unavailable" }, 503);

    let row: any = await readProfile(user.id);

    if (!row) {
      const username = String(user.user_metadata?.keep_username ?? "").trim().replace(/^@+/, "").normalize("NFKC");
      if (!username) return json({ ok: false, error: "missing_keep_username" }, 409);

      await db`
        insert into public.profiles (
          id, username, display_name, bio, avatar_url, country_code, city,
          kind, language_code, is_public, location_opt_in, website,
          favorite_genres, favorite_artists, preferred_language_tag,
          music_country_codes
        ) values (
          ${user.id}::uuid, ${username}, ${username}, '', null, null, null,
          'USER', 'fr', true, false, null, '{}'::text[], '{}'::text[], null,
          '{}'::text[]
        )
        on conflict (id) do nothing
      `;

      row = await readProfile(user.id);
    }

    if (!row) return json({ ok: false, error: "profile_unavailable" }, 503);

    const {
      social_links,
      birth_date,
      gender,
      follower_count,
      following_count,
      ...profile
    } = row;

    return json({
      ok: true,
      profile,
      social_links: Array.isArray(social_links) ? social_links : [],
      private_info: {
        birth_date: birth_date ?? null,
        gender: gender ?? null,
      },
      follower_count: Number(follower_count ?? 0),
      following_count: Number(following_count ?? 0),
    });
  } catch (error) {
    console.error("[keep-profile-bootstrap]", error);
    return json({ ok: false, error: "profile_bootstrap_unavailable" }, 503);
  }
});
