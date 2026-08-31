import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CONFIG: Record<string, { term: string; country: string }> = {
  FUNK: { term: "funk", country: "US" },
  DISCO: { term: "disco", country: "US" },
  AFRO: { term: "afrobeats", country: "GB" },
  RAP_FR: { term: "rap français", country: "FR" },
  RAP_US: { term: "hip hop rap", country: "US" },
  ELECTRO: { term: "electronic dance", country: "US" },
  POP: { term: "pop", country: "US" },
  RNB: { term: "r&b soul", country: "US" },
  ROCK: { term: "rock", country: "US" },
  LATINO: { term: "latin reggaeton", country: "US" },
  RAI: { term: "rai algerien", country: "FR" },
  SOUL: { term: "soul", country: "US" },
  REGGAE: { term: "reggae", country: "US" },
  JAZZ: { term: "jazz", country: "US" },
  CLASSIQUE: { term: "classical", country: "FR" },
  CHANSON_FR: { term: "chanson française", country: "FR" },
};

function out(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

function artwork(url: string) {
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}

function year(date: unknown) {
  const match = String(date ?? "").match(/^(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

async function seed(theme: string) {
  const config = CONFIG[theme];
  if (!config) throw new Error("THEME_NOT_SEEDABLE");

  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(config.term)}&entity=song&limit=40&country=${config.country}`;
  const response = await fetch(searchUrl, { headers: { "user-agent": "KEEP/1.0 Battle Seed" } });
  if (!response.ok) throw new Error(`ITUNES_${response.status}`);
  const body = await response.json();
  const rows = (Array.isArray(body?.results) ? body.results : []).filter((item: any) =>
    String(item?.previewUrl ?? "").startsWith("https://")
  );

  let linked = 0;
  let inserted = 0;
  let updated = 0;

  for (const item of rows.slice(0, 24)) {
    const appleId = String(item.trackId ?? "");
    const title = String(item.trackName ?? "").trim();
    const artist = String(item.artistName ?? "").trim();
    if (!appleId || !title || !artist) continue;

    const { data: existing } = await admin
      .from("tracks")
      .select("id")
      .filter("provider_ids->>appleMusic", "eq", appleId)
      .maybeSingle();
    let trackId = existing?.id as string | undefined;

    const patch: any = {
      title,
      artist,
      album: String(item.collectionName ?? "") || null,
      duration_sec: item.trackTimeMillis ? Math.round(Number(item.trackTimeMillis) / 1000) : null,
      artwork_url: item.artworkUrl100 ? artwork(String(item.artworkUrl100)) : null,
      genres: item.primaryGenreName ? [String(item.primaryGenreName)] : [],
      provider_ids: { appleMusic: appleId, appleStorefront: config.country },
      source: "itunes_public_battle",
      source_url: String(item.trackViewUrl ?? "") || null,
      preview_url: String(item.previewUrl),
      external_urls: { appleMusic: String(item.trackViewUrl ?? "") },
      available_on: ["Apple Music"],
      release_year: year(item.releaseDate),
    };

    if (trackId) {
      const { error } = await admin.from("tracks").update(patch).eq("id", trackId);
      if (error) continue;
      updated += 1;
    } else {
      const { data: created, error } = await admin.from("tracks").insert(patch).select("id").single();
      if (error) {
        const { data: identity } = await admin
          .from("tracks")
          .select("id")
          .ilike("title", title)
          .ilike("artist", artist)
          .limit(1)
          .maybeSingle();
        trackId = identity?.id as string | undefined;
        if (!trackId) continue;
      } else {
        trackId = created.id;
        inserted += 1;
      }
    }

    const { error: linkError } = await admin
      .from("keep_battle_track_themes")
      .upsert(
        { track_id: trackId, theme_code: theme, source: "itunes_genre_seed", confidence: 0.96 },
        { onConflict: "track_id,theme_code" },
      );
    if (!linkError) linked += 1;
  }

  return { theme, inserted, updated, linked };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let theme = "";
    if (req.method === "GET") theme = new URL(req.url).searchParams.get("theme")?.toUpperCase() ?? "";
    else if (req.method === "POST") theme = String((await req.json().catch(() => ({})))?.theme ?? "").toUpperCase();
    else return out(405, { error: "method_not_allowed" });
    return out(200, { ok: true, ...(await seed(theme)) });
  } catch (error) {
    return out(400, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
