import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-worker-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request) {
  const supplied = req.headers.get("x-keep-worker-key") || "";
  if (!supplied) return false;
  const { data, error } = await admin
    .from("keep_internal_worker_secrets")
    .select("secret_hash")
    .eq("name", "battle-catalog-seed")
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return (await sha256(supplied)) === String(data.secret_hash);
}

type SearchQuery = {
  term: string;
  country: string;
  limit?: number;
  artistExact?: boolean;
};

const CONFIG: Record<string, SearchQuery[]> = {
  FUNK: [
    { term: "funk", country: "US", limit: 200 },
    { term: "funk classics", country: "US", limit: 200 },
    { term: "funk 70s", country: "US", limit: 200 },
    { term: "funk 80s", country: "US", limit: 200 },
  ],
  DISCO: [
    { term: "disco", country: "US", limit: 200 },
    { term: "disco classics 70s", country: "US", limit: 200 },
    { term: "disco 80s", country: "US", limit: 200 },
  ],
  AFRO: [
    { term: "afrobeats", country: "GB", limit: 200 },
    { term: "afropop", country: "GB", limit: 200 },
    { term: "afrobeat classics", country: "US", limit: 200 },
    { term: "amapiano", country: "ZA", limit: 200 },
  ],
  RAP_FR: [
    { term: "rap français", country: "FR", limit: 200 },
    { term: "rap français old school", country: "FR", limit: 200 },
    { term: "rap français 90", country: "FR", limit: 200 },
    { term: "rap français 2000", country: "FR", limit: 200 },
    { term: "rap français 2010", country: "FR", limit: 200 },
    { term: "rap français 2020", country: "FR", limit: 200 },
  ],
  RAP_US: [
    { term: "hip hop rap", country: "US", limit: 200 },
    { term: "old school hip hop", country: "US", limit: 200 },
    { term: "rap 90s", country: "US", limit: 200 },
    { term: "rap 2000s", country: "US", limit: 200 },
    { term: "rap 2020s", country: "US", limit: 200 },
  ],
  ELECTRO: [
    { term: "electronic dance", country: "US", limit: 200 },
    { term: "house music", country: "US", limit: 200 },
    { term: "techno", country: "DE", limit: 200 },
    { term: "electro classics", country: "FR", limit: 200 },
  ],
  POP: [
    { term: "pop", country: "US", limit: 200 },
    { term: "pop hits", country: "US", limit: 200 },
    { term: "pop classics", country: "US", limit: 200 },
    { term: "pop 80s", country: "US", limit: 200 },
    { term: "pop 90s", country: "US", limit: 200 },
    { term: "pop 2000s", country: "US", limit: 200 },
  ],
  RNB: [
    { term: "r&b soul", country: "US", limit: 200 },
    { term: "r&b classics", country: "US", limit: 200 },
    { term: "r&b 90s", country: "US", limit: 200 },
    { term: "r&b 2000s", country: "US", limit: 200 },
  ],
  ROCK: [
    { term: "rock", country: "US", limit: 200 },
    { term: "rock classics", country: "US", limit: 200 },
    { term: "rock 70s", country: "US", limit: 200 },
    { term: "rock 80s", country: "US", limit: 200 },
    { term: "rock 90s", country: "US", limit: 200 },
    { term: "rock 2000s", country: "US", limit: 200 },
  ],
  LATINO: [
    { term: "latin reggaeton", country: "MX", limit: 200 },
    { term: "musica latina", country: "MX", limit: 200 },
    { term: "salsa latina", country: "MX", limit: 200 },
    { term: "bachata", country: "MX", limit: 200 },
  ],
  RAI: [
    { term: "rai algerien", country: "FR", limit: 200 },
    { term: "rai marocain", country: "FR", limit: 200 },
    { term: "rai classics", country: "FR", limit: 200 },
    { term: "rai moderne", country: "FR", limit: 200 },
  ],
  SOUL: [
    { term: "soul", country: "US", limit: 200 },
    { term: "motown soul classics", country: "US", limit: 200 },
    { term: "soul 70s", country: "US", limit: 200 },
    { term: "neo soul", country: "US", limit: 200 },
  ],
  REGGAE: [
    { term: "reggae", country: "US", limit: 200 },
    { term: "reggae roots", country: "US", limit: 200 },
    { term: "reggae classics", country: "US", limit: 200 },
    { term: "dancehall", country: "JM", limit: 200 },
  ],
  JAZZ: [
    { term: "jazz", country: "US", limit: 200 },
    { term: "jazz vocal classics", country: "US", limit: 200 },
    { term: "jazz standards", country: "US", limit: 200 },
    { term: "jazz fusion", country: "US", limit: 200 },
  ],
  CLASSIQUE: [
    { term: "classical", country: "FR", limit: 200 },
    { term: "classical piano", country: "FR", limit: 200 },
    { term: "classical symphony", country: "FR", limit: 200 },
    { term: "classical opera", country: "FR", limit: 200 },
  ],
  CHANSON_FR: [],
  ANNEES_80: [
    { term: "80s hits", country: "FR", limit: 200 },
    { term: "pop 1980", country: "FR", limit: 200 },
    { term: "pop 1985", country: "FR", limit: 200 },
    { term: "rock 80s", country: "FR", limit: 200 },
  ],
  ANNEES_90: [
    { term: "90s hits", country: "FR", limit: 200 },
    { term: "pop 1990", country: "FR", limit: 200 },
    { term: "pop 1995", country: "FR", limit: 200 },
    { term: "dance 90s", country: "FR", limit: 200 },
  ],
  RUSSE: [
    { term: "russian pop", country: "RU", limit: 200 },
    { term: "russian rap", country: "RU", limit: 200 },
    { term: "русская музыка", country: "RU", limit: 200 },
    { term: "русский рок", country: "RU", limit: 200 },
  ],
  TURC: [
    { term: "turkish pop", country: "TR", limit: 200 },
    { term: "turkish arabesk", country: "TR", limit: 200 },
    { term: "türkçe pop", country: "TR", limit: 200 },
    { term: "türkçe rap", country: "TR", limit: 200 },
  ],
  KPOP: [
    { term: "k-pop", country: "KR", limit: 200 },
    { term: "korean pop", country: "KR", limit: 200 },
    { term: "korean r&b", country: "KR", limit: 200 },
    { term: "korean hip hop", country: "KR", limit: 200 },
  ],
  ARABE: [
    { term: "arabic pop", country: "AE", limit: 200 },
    { term: "khaleeji", country: "AE", limit: 200 },
    { term: "اغاني خليجية", country: "AE", limit: 200 },
    { term: "arabic hits", country: "SA", limit: 200 },
  ],
  BRESIL: [
    { term: "musica brasileira", country: "BR", limit: 200 },
    { term: "sertanejo", country: "BR", limit: 200 },
    { term: "mpb", country: "BR", limit: 200 },
    { term: "samba", country: "BR", limit: 200 },
  ],
  INDE: [
    { term: "bollywood", country: "IN", limit: 200 },
    { term: "hindi pop", country: "IN", limit: 200 },
    { term: "hindi songs", country: "IN", limit: 200 },
    { term: "punjabi hits", country: "IN", limit: 200 },
  ],
};

const FRENCH_DEEP_TERMS = [
  "chanson française", "variété française", "chanson française classique",
  "variété française classique", "chanson française années 60",
  "chanson française années 70", "chanson française années 80",
  "chanson française années 90", "chanson française années 2000",
  "chanson française années 2010", "chanson française années 2020",
  "variété française années 60", "variété française années 70",
  "variété française années 80", "variété française années 90",
  "variété française années 2000", "variété française années 2010",
  "variété française années 2020", "french pop classics", "french pop hits",
];

const FRENCH_ARTISTS = [
  "Gilbert Montagné","Jean-Jacques Goldman","Michel Sardou","Johnny Hallyday",
  "France Gall","Daniel Balavoine","Claude François","Joe Dassin","Julien Clerc",
  "Alain Souchon","Laurent Voulzy","Francis Cabrel","Renaud","Patrick Bruel",
  "Florent Pagny","Pascal Obispo","Calogero","Mylène Farmer","Zazie",
  "Véronique Sanson","Michel Berger","Serge Gainsbourg","Jacques Brel",
  "Georges Brassens","Charles Aznavour","Édith Piaf","Dalida","Barbara",
  "Françoise Hardy","Sheila","Sylvie Vartan","Michel Polnareff","Christophe",
  "Gérard Lenorman","Maxime Le Forestier","William Sheller","Étienne Daho",
  "Alain Bashung","Indochine","Téléphone","Niagara","Les Rita Mitsouko",
  "Jean-Louis Aubert","Patricia Kaas","Lara Fabian","Céline Dion","Garou",
  "Daniel Lavoie","Axelle Red","Maurane","Hélène Ségara","Natasha St-Pier",
  "Chimène Badi","Nolwenn Leroy","Jenifer","Amel Bent","Vitaa","Clara Luciani",
  "Juliette Armanet","Zaz","Louane","Vianney","Kendji Girac","Slimane","Gims",
  "Stromae","Angèle","Patrick Fiori","Marc Lavoine","Roch Voisine",
  "Dany Brillant","Enrico Macias","Salvatore Adamo","Pierre Bachelet",
  "Hervé Vilard","Dave","Alain Chamfort","Lio","Jeanne Mas","Desireless",
  "Images","Gold","François Feldman","Cookie Dingler","Début de Soirée",
  "Emile & Images","Jean-Pierre Mader","Bibie","Julie Pietri","Elsa",
  "Vanessa Paradis","Nicole Croisille","Nicoletta","Michèle Torr","Marie Laforêt",
  "Pierre Perret","Hugues Aufray","Yves Duteil","Michel Fugain","Gérard Blanc",
  "Richard Cocciante","Linda de Suza","Herbert Léonard","Philippe Lavil",
  "Liane Foly","Nino Ferrer","Georges Moustaki","Gilbert Bécaud","Charles Trenet",
  "Bourvil","Sacha Distel","Henri Salvador","Annie Cordy","Brigitte Bardot",
  "Petula Clark","Les Forbans","Les Avions","Partenaire Particulier","Luna Parker",
  "Camille","Benjamin Biolay","Raphaël","Bénabar","Thomas Dutronc","Sanseverino",
  "Olivia Ruiz","Coeur de Pirate","Pomme","Hoshi","Grand Corps Malade",
  "Gaëtan Roussel","Louise Attaque","Noir Désir","Superbus","Kyo","M",
  "Christophe Maé","Grégoire","Joyce Jonathan","Camélia Jordana","Yseult",
  "Pierre Garnier","Santa","Zaho de Sagazan","Pierre de Maere",
];

const FRENCH_RAP_ARTISTS = [
  "IAM","NTM","MC Solaar","Oxmo Puccino","Rohff","Booba","Kery James",
  "Soprano","Akhenaton","Fonky Family","Sniper","113","Diam's","La Fouine",
  "Orelsan","Gringe","Nekfeu","Alpha Wann","Lomepal","Vald","Damso","Ninho",
  "Niska","SCH","Jul","Gazo","Tiakola","PLK","Kaaris","Lacrim","Gradur",
  "Médine","Youssoupha","Disiz","Koba LaD","Maes","Dadju","MHD","Aya Nakamura",
  "Leto","Hamza","Zola","SDM","Dinos","Josman","Laylow","Georgio","Kikesa",
  "Bigflo & Oli","Stromae",
];

const GENRE_ALLOW: Record<string, RegExp> = {
  FUNK: /funk|r&b|soul/i,
  REGGAE: /reggae|dancehall|ska|dub/i,
};

const THEME_BUDGET: Record<string, number> = {
  CHANSON_FR: 4000,
  RAP_FR: 2500,
  RUSSE: 1800,
  TURC: 1800,
  ARABE: 1800,
  RAI: 1600,
  BRESIL: 1800,
  INDE: 1800,
  KPOP: 1800,
};
const DEFAULT_BUDGET = 1000;
const QUERY_CONCURRENCY = 10;
const DB_BATCH_SIZE = 400;

function out(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artwork(url: string) {
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}

function year(date: unknown) {
  const match = String(date ?? "").match(/^(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function queriesForTheme(theme: string): SearchQuery[] {
  const base = CONFIG[theme];
  if (!base) throw new Error("THEME_NOT_SEEDABLE");
  if (theme === "CHANSON_FR") {
    return [
      ...FRENCH_DEEP_TERMS.map((term) => ({ term, country: "FR", limit: 200 })),
      ...FRENCH_ARTISTS.map((term) => ({ term, country: "FR", limit: 50, artistExact: true })),
    ];
  }
  if (theme === "RAP_FR") {
    return [
      ...base,
      ...FRENCH_RAP_ARTISTS.map((term) => ({ term, country: "FR", limit: 50, artistExact: true })),
    ];
  }
  return base;
}

async function fetchQuery(query: SearchQuery) {
  const params = new URLSearchParams({
    term: query.term,
    media: "music",
    entity: "song",
    limit: String(Math.max(1, Math.min(query.limit ?? 100, 200))),
    country: query.country,
  });
  if (query.artistExact) params.set("attribute", "artistTerm");
  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
    headers: { "user-agent": "KEEP/1.0 Battle Deep Catalog" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  const rows = Array.isArray(body?.results) ? body.results : [];
  if (!query.artistExact) return rows;
  const wanted = norm(query.term);
  return rows.filter((item: any) => {
    const candidate = norm(item?.artistName);
    return candidate === wanted || candidate.startsWith(`${wanted} `) || wanted.startsWith(`${candidate} `);
  });
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]);
      } catch {
        results[index] = [] as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function seed(theme: string) {
  const queries = queriesForTheme(theme);
  const resultSets = await mapLimit(queries, QUERY_CONCURRENCY, fetchQuery);
  const budget = THEME_BUDGET[theme] ?? DEFAULT_BUDGET;

  const byAppleId = new Map<string, { item: any; country: string }>();
  for (let i = 0; i < resultSets.length; i += 1) {
    const query = queries[i];
    for (const item of resultSets[i] ?? []) {
      const appleId = String(item?.trackId ?? "");
      const preview = String(item?.previewUrl ?? "");
      if (!appleId || !preview.startsWith("https://")) continue;
      if (!byAppleId.has(appleId)) byAppleId.set(appleId, { item, country: query.country });
    }
  }

  const selected: any[] = [];
  const artistKeys = new Set<string>();
  for (const { item, country } of byAppleId.values()) {
    if (selected.length >= budget) break;
    const title = String(item?.trackName ?? "").trim();
    const artist = String(item?.artistName ?? "").trim();
    const previewUrl = String(item?.previewUrl ?? "").trim();
    if (!title || !artist || !previewUrl.startsWith("https://")) continue;

    const genreAllow = GENRE_ALLOW[theme];
    if (genreAllow && !genreAllow.test(String(item?.primaryGenreName ?? ""))) continue;

    artistKeys.add(norm(artist));
    selected.push({
      appleId: String(item.trackId),
      title,
      artist,
      album: String(item.collectionName ?? "") || null,
      durationSec: item.trackTimeMillis ? Math.round(Number(item.trackTimeMillis) / 1000) : null,
      artworkUrl: item.artworkUrl100 ? artwork(String(item.artworkUrl100)) : null,
      previewUrl,
      trackUrl: String(item.trackViewUrl ?? "") || null,
      genre: String(item.primaryGenreName ?? "") || null,
      storefront: country,
      releaseYear: year(item.releaseDate),
    });
  }

  let inserted = 0;
  let updated = 0;
  let linked = 0;
  for (let i = 0; i < selected.length; i += DB_BATCH_SIZE) {
    const chunk = selected.slice(i, i + DB_BATCH_SIZE);
    const { data, error } = await admin.rpc("service_battle_catalog_ingest", {
      p_theme: theme,
      p_items: chunk,
    });
    if (error) throw error;
    inserted += Number(data?.inserted ?? 0);
    updated += Number(data?.updated ?? 0);
    linked += Number(data?.linked ?? 0);
  }

  return {
    theme,
    queries: queries.length,
    found: byAppleId.size,
    considered: selected.length,
    distinctArtists: artistKeys.size,
    inserted,
    updated,
    linked,
    budget,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await authorized(req))) return out(401, { ok: false, error: "unauthorized" });
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
