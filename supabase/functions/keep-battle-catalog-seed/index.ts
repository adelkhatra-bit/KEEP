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

// Adel (02/09/2026) : "plus d'artistes ... des vieux titres et recents ...
// aller chercher plus profond" -- chaque theme n'interrogeait iTunes qu'avec
// UN SEUL terme de recherche (limit 40, 24 gardes) : catalogue plat et peu
// varie. Chaque theme utilise maintenant PLUSIEURS requetes (styles/decennies/
// artistes differents) fusionnees et dedupliquees, avec une limite iTunes plus
// haute par requete. Ajout aussi de RUSSE/TURC/KPOP/ARABE/BRESIL/INDE
// ("tous les pays qui pourraient etre interessants ... large culture
// musicale") et des deux themes ANNEES_80/ANNEES_90 qui existaient deja dans
// la table keep_battle_themes mais n'avaient jamais eu de config de seed.
const CONFIG: Record<string, Array<{ term: string; country: string }>> = {
  FUNK: [{ term: "funk", country: "US" }, { term: "funk classics", country: "US" }],
  DISCO: [{ term: "disco", country: "US" }, { term: "disco classics 70s", country: "US" }],
  AFRO: [{ term: "afrobeats", country: "GB" }, { term: "afropop", country: "GB" }, { term: "afrobeat classics", country: "US" }],
  RAP_FR: [{ term: "rap français", country: "FR" }, { term: "rap français old school", country: "FR" }, { term: "rap français 2024", country: "FR" }],
  RAP_US: [{ term: "hip hop rap", country: "US" }, { term: "old school hip hop", country: "US" }, { term: "rap 2024", country: "US" }],
  ELECTRO: [{ term: "electronic dance", country: "US" }, { term: "house music", country: "US" }, { term: "techno", country: "DE" }],
  POP: [{ term: "pop", country: "US" }, { term: "pop hits 2024", country: "US" }, { term: "pop classics", country: "US" }],
  RNB: [{ term: "r&b soul", country: "US" }, { term: "r&b 2024", country: "US" }],
  ROCK: [{ term: "rock", country: "US" }, { term: "rock classics", country: "US" }, { term: "rock 2024", country: "US" }],
  LATINO: [{ term: "latin reggaeton", country: "US" }, { term: "musica latina", country: "MX" }],
  RAI: [{ term: "rai algerien", country: "FR" }, { term: "rai marocain", country: "FR" }],
  SOUL: [{ term: "soul", country: "US" }, { term: "motown soul classics", country: "US" }],
  REGGAE: [{ term: "reggae", country: "US" }, { term: "reggae roots", country: "US" }],
  JAZZ: [{ term: "jazz", country: "US" }, { term: "jazz vocal classics", country: "US" }],
  CLASSIQUE: [{ term: "classical", country: "FR" }, { term: "classical piano", country: "FR" }],
  CHANSON_FR: [{ term: "chanson française", country: "FR" }, { term: "variété française", country: "FR" }],
  ANNEES_80: [{ term: "80s hits", country: "US" }, { term: "pop 1985", country: "FR" }],
  ANNEES_90: [{ term: "90s hits", country: "US" }, { term: "pop 1995", country: "FR" }],
  RUSSE: [{ term: "russian pop", country: "RU" }, { term: "russian rap", country: "RU" }],
  TURC: [{ term: "turkish pop", country: "TR" }, { term: "turkish arabesk", country: "TR" }],
  KPOP: [{ term: "k-pop", country: "KR" }, { term: "korean pop", country: "KR" }],
  ARABE: [{ term: "arabic pop", country: "SA" }, { term: "khaleeji", country: "AE" }],
  BRESIL: [{ term: "musica brasileira", country: "BR" }, { term: "sertanejo", country: "BR" }],
  INDE: [{ term: "bollywood", country: "IN" }, { term: "hindi pop", country: "IN" }],
};

// Adel (04/09/2026) : "je suis pas sûre que ce soit de la funk" puis "il met
// du reggae, il mélange tout" -- BUG RÉEL confirmé sur les DEUX thèmes :
// chaque résultat iTunes pour un terme simple ("funk", "reggae") était tagué
// à 96% de confiance SANS jamais vérifier item.primaryGenreName -- le mot
// apparaît dans plein de titres qui n'ont rien à voir (funk brésilien, EDM,
// hip-hop, rock, musique pour enfants... pour FUNK ; genres totalement
// étrangers pour REGGAE). Seuls ces deux thèmes ont un filtre pour
// l'instant (les deux seuls signalés, chacun confirmé à ~37-39% de
// contamination) -- un audit large sur les 22 autres thèmes a montré des
// répartitions bien plus ambiguës (ex. DISCO/ROCK perdraient injustement
// leurs plus gros lots "Alternative"/"Pop" sans preuve réelle de mauvais
// classement) : mieux vaut ne rien y toucher tant qu'un problème concret
// n'y est pas signalé, que risquer de vider un catalogue sain sur une
// simple supposition.
const GENRE_ALLOW: Record<string, RegExp> = {
  FUNK: /funk|r&b|soul/i,
  REGGAE: /reggae|dancehall|ska|dub/i,
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

async function fetchQuery(query: { term: string; country: string }) {
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query.term)}&entity=song&limit=100&country=${query.country}`;
  const response = await fetch(searchUrl, { headers: { "user-agent": "KEEP/1.0 Battle Seed" } });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  return Array.isArray(body?.results) ? body.results : [];
}

async function seed(theme: string) {
  const queries = CONFIG[theme];
  if (!queries) throw new Error("THEME_NOT_SEEDABLE");

  const byAppleId = new Map<string, any>();
  for (const query of queries) {
    const results = await fetchQuery(query);
    for (const item of results) {
      const appleId = String(item?.trackId ?? "");
      if (!appleId || !String(item?.previewUrl ?? "").startsWith("https://")) continue;
      if (!byAppleId.has(appleId)) byAppleId.set(appleId, item);
    }
  }

  let linked = 0;
  let inserted = 0;
  let updated = 0;

  // Adel (04/09/2026) : "il faut aller chercher du son au maximum" -- chaque
  // thème dédupliquait déjà plusieurs requêtes iTunes (jusqu'à limit=100
  // chacune) mais ne gardait que les 80 premiers résultats fusionnés,
  // laissant une bonne partie du volume réellement récupéré de côté.
  // Garde maintenant jusqu'à 200 pistes par ré-alimentation.
  for (const item of Array.from(byAppleId.values()).slice(0, 200)) {
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
      provider_ids: { appleMusic: appleId, appleStorefront: queries[0].country },
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

    const genreAllow = GENRE_ALLOW[theme];
    const genreOk = !genreAllow || genreAllow.test(String(item.primaryGenreName ?? ""));
    if (!genreOk) continue;

    const { error: linkError } = await admin
      .from("keep_battle_track_themes")
      .upsert(
        { track_id: trackId, theme_code: theme, source: "itunes_genre_seed", confidence: 0.96 },
        { onConflict: "track_id,theme_code" },
      );
    if (!linkError) linked += 1;
  }

  return { theme, found: byAppleId.size, inserted, updated, linked };
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
