import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-worker-key, x-keep-cron-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validInternalKey(supplied: string, name: string) {
  if (!supplied) return false;
  const { data, error } = await admin
    .from("keep_internal_worker_secrets")
    .select("secret_hash")
    .eq("name", name)
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return (await sha256(supplied)) === String(data.secret_hash);
}

async function authorized(req: Request) {
  const workerKey = req.headers.get("x-keep-worker-key") || "";
  if (workerKey && await validInternalKey(workerKey, "battle-catalog-seed")) return true;
  const cronKey = req.headers.get("x-keep-cron-key") || "";
  return cronKey ? validInternalKey(cronKey, "battle-catalog-cron") : false;
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
  HOUSE: [
    { term: "house music", country: "US", limit: 200 },
    { term: "deep house", country: "GB", limit: 200 },
    { term: "tech house", country: "GB", limit: 200 },
    { term: "french house", country: "FR", limit: 200 },
  ],
  REGGAETON: [
    { term: "reggaeton", country: "MX", limit: 200 },
    { term: "urbano latino", country: "MX", limit: 200 },
    { term: "latin urban", country: "US", limit: 200 },
    { term: "perreo", country: "MX", limit: 200 },
  ],
  AMAPIANO: [
    { term: "amapiano", country: "ZA", limit: 200 },
    { term: "south african amapiano", country: "ZA", limit: 200 },
    { term: "amapiano hits", country: "ZA", limit: 200 },
    { term: "piano dance south africa", country: "ZA", limit: 200 },
  ],
  ALTERNATIVE: [
    { term: "alternative", country: "US", limit: 200 },
    { term: "indie rock", country: "US", limit: 200 },
    { term: "indie pop", country: "GB", limit: 200 },
    { term: "alternative rock", country: "US", limit: 200 },
  ],
  COUNTRY: [
    { term: "country", country: "US", limit: 200 },
    { term: "country hits", country: "US", limit: 200 },
    { term: "country classics", country: "US", limit: 200 },
    { term: "modern country", country: "US", limit: 200 },
  ],
  METAL: [
    { term: "heavy metal", country: "US", limit: 200 },
    { term: "metal classics", country: "US", limit: 200 },
    { term: "alternative metal", country: "US", limit: 200 },
    { term: "metalcore", country: "US", limit: 200 },
  ],
  SOUNDTRACK: [
    { term: "movie soundtrack", country: "US", limit: 200 },
    { term: "film score", country: "US", limit: 200 },
    { term: "soundtrack hits", country: "US", limit: 200 },
    { term: "bandes originales films", country: "FR", limit: 200 },
  ],
  BLUES: [
    { term: "blues", country: "US", limit: 200 },
    { term: "blues classics", country: "US", limit: 200 },
    { term: "electric blues", country: "US", limit: 200 },
    { term: "blues rock", country: "US", limit: 200 },
  ],
  TECHNO: [
    { term: "techno", country: "DE", limit: 200 },
    { term: "berlin techno", country: "DE", limit: 200 },
    { term: "detroit techno", country: "US", limit: 200 },
    { term: "melodic techno", country: "DE", limit: 200 },
  ],
  TRANCE: [
    { term: "trance", country: "NL", limit: 200 },
    { term: "progressive trance", country: "NL", limit: 200 },
    { term: "uplifting trance", country: "GB", limit: 200 },
    { term: "psytrance", country: "DE", limit: 200 },
  ],
  DNB: [
    { term: "drum and bass", country: "GB", limit: 200 },
    { term: "liquid drum and bass", country: "GB", limit: 200 },
    { term: "jungle drum bass", country: "GB", limit: 200 },
    { term: "dnb classics", country: "GB", limit: 200 },
  ],
  DUBSTEP: [
    { term: "dubstep", country: "GB", limit: 200 },
    { term: "melodic dubstep", country: "US", limit: 200 },
    { term: "brostep", country: "US", limit: 200 },
    { term: "uk dubstep", country: "GB", limit: 200 },
  ],
  UK_GARAGE: [
    { term: "uk garage", country: "GB", limit: 200 },
    { term: "2 step garage", country: "GB", limit: 200 },
    { term: "garage classics", country: "GB", limit: 200 },
    { term: "bassline uk", country: "GB", limit: 200 },
  ],
  GRIME: [
    { term: "grime", country: "GB", limit: 200 },
    { term: "uk grime", country: "GB", limit: 200 },
    { term: "grime classics", country: "GB", limit: 200 },
    { term: "grime rap", country: "GB", limit: 200 },
  ],
  DRILL: [
    { term: "drill rap", country: "GB", limit: 200 },
    { term: "uk drill", country: "GB", limit: 200 },
    { term: "chicago drill", country: "US", limit: 200 },
    { term: "french drill", country: "FR", limit: 200 },
  ],
  PUNK: [
    { term: "punk rock", country: "US", limit: 200 },
    { term: "punk classics", country: "GB", limit: 200 },
    { term: "pop punk", country: "US", limit: 200 },
    { term: "hardcore punk", country: "US", limit: 200 },
  ],
  GOSPEL: [
    { term: "gospel", country: "US", limit: 200 },
    { term: "gospel classics", country: "US", limit: 200 },
    { term: "contemporary gospel", country: "US", limit: 200 },
    { term: "african gospel", country: "ZA", limit: 200 },
  ],
  DANCEHALL: [
    { term: "dancehall", country: "JM", limit: 200 },
    { term: "jamaican dancehall", country: "JM", limit: 200 },
    { term: "dancehall classics", country: "JM", limit: 200 },
    { term: "modern dancehall", country: "JM", limit: 200 },
  ],
  SALSA: [
    { term: "salsa", country: "US", limit: 200 },
    { term: "salsa classics", country: "US", limit: 200 },
    { term: "salsa cubana", country: "MX", limit: 200 },
    { term: "salsa romantica", country: "MX", limit: 200 },
  ],
  BACHATA: [
    { term: "bachata", country: "US", limit: 200 },
    { term: "bachata dominicana", country: "US", limit: 200 },
    { term: "bachata romantica", country: "US", limit: 200 },
    { term: "modern bachata", country: "US", limit: 200 },
  ],
  CUMBIA: [
    { term: "cumbia", country: "MX", limit: 200 },
    { term: "cumbia colombiana", country: "CO", limit: 200 },
    { term: "cumbia mexicana", country: "MX", limit: 200 },
    { term: "cumbia argentina", country: "AR", limit: 200 },
  ],
  MERENGUE: [
    { term: "merengue", country: "US", limit: 200 },
    { term: "merengue dominicano", country: "US", limit: 200 },
    { term: "merengue clasico", country: "US", limit: 200 },
    { term: "merengue hits", country: "US", limit: 200 },
  ],
  FLAMENCO: [
    { term: "flamenco", country: "ES", limit: 200 },
    { term: "flamenco pop", country: "ES", limit: 200 },
    { term: "nuevo flamenco", country: "ES", limit: 200 },
    { term: "rumba flamenca", country: "ES", limit: 200 },
  ],
  FADO: [
    { term: "fado", country: "PT", limit: 200 },
    { term: "fado portugues", country: "PT", limit: 200 },
    { term: "fado classics", country: "PT", limit: 200 },
    { term: "modern fado", country: "PT", limit: 200 },
  ],
  ZOUK: [
    { term: "zouk", country: "FR", limit: 200 },
    { term: "zouk antilles", country: "FR", limit: 200 },
    { term: "zouk love", country: "FR", limit: 200 },
    { term: "zouk classics", country: "FR", limit: 200 },
  ],
  KOMPA: [
    { term: "kompa", country: "US", limit: 200 },
    { term: "kompa haitien", country: "US", limit: 200 },
    { term: "compas haitien", country: "US", limit: 200 },
    { term: "kompa classics", country: "US", limit: 200 },
  ],
  GNAWA: [
    { term: "gnawa", country: "FR", limit: 200 },
    { term: "gnaoua maroc", country: "FR", limit: 200 },
    { term: "gnawa fusion", country: "FR", limit: 200 },
    { term: "moroccan gnawa", country: "FR", limit: 200 },
  ],
  CHAABI: [
    { term: "chaabi marocain", country: "FR", limit: 200 },
    { term: "chaabi algerien", country: "FR", limit: 200 },
    { term: "moroccan chaabi", country: "FR", limit: 200 },
    { term: "algerian chaabi", country: "FR", limit: 200 },
  ],
  KHALEEJI: [
    { term: "khaleeji", country: "SA", limit: 200 },
    { term: "khaleeji hits", country: "AE", limit: 200 },
    { term: "gulf arabic music", country: "AE", limit: 200 },
    { term: "اغاني خليجية", country: "SA", limit: 200 },
  ],
  EGYPTIAN_POP: [
    { term: "egyptian pop", country: "EG", limit: 200 },
    { term: "egyptian hits", country: "EG", limit: 200 },
    { term: "arabic egypt pop", country: "EG", limit: 200 },
    { term: "موسيقى مصرية", country: "EG", limit: 200 },
  ],
  JPOP: [
    { term: "j-pop", country: "JP", limit: 200 },
    { term: "japanese pop", country: "JP", limit: 200 },
    { term: "japanese hits", country: "JP", limit: 200 },
    { term: "city pop japanese", country: "JP", limit: 200 },
  ],
  ANIME: [
    { term: "anime songs", country: "JP", limit: 200 },
    { term: "anime soundtrack", country: "JP", limit: 200 },
    { term: "anime openings", country: "JP", limit: 200 },
    { term: "anisong", country: "JP", limit: 200 },
  ],
  CPOP: [
    { term: "c-pop", country: "HK", limit: 200 },
    { term: "chinese pop", country: "HK", limit: 200 },
    { term: "cantopop", country: "HK", limit: 200 },
    { term: "chinese hits", country: "HK", limit: 200 },
  ],
  MANDOPOP: [
    { term: "mandopop", country: "TW", limit: 200 },
    { term: "mandarin pop", country: "TW", limit: 200 },
    { term: "taiwan pop", country: "TW", limit: 200 },
    { term: "mandarin hits", country: "TW", limit: 200 },
  ],
  PUNJABI: [
    { term: "punjabi", country: "IN", limit: 200 },
    { term: "punjabi pop", country: "IN", limit: 200 },
    { term: "bhangra", country: "IN", limit: 200 },
    { term: "punjabi hits", country: "IN", limit: 200 },
  ],
  AFROHOUSE: [
    { term: "afro house", country: "ZA", limit: 200 },
    { term: "african house", country: "ZA", limit: 200 },
    { term: "afro house hits", country: "ZA", limit: 200 },
    { term: "south african house", country: "ZA", limit: 200 },
  ],
  AFROPOP: [
    { term: "afropop", country: "NG", limit: 200 },
    { term: "african pop", country: "NG", limit: 200 },
    { term: "naija pop", country: "NG", limit: 200 },
    { term: "afropop hits", country: "GB", limit: 200 },
  ],
  LOFI: [
    { term: "lofi", country: "US", limit: 200 },
    { term: "lofi hip hop", country: "US", limit: 200 },
    { term: "lofi beats", country: "US", limit: 200 },
    { term: "chillhop", country: "US", limit: 200 },
  ],
  AMBIENT: [
    { term: "ambient", country: "US", limit: 200 },
    { term: "ambient electronic", country: "GB", limit: 200 },
    { term: "ambient chill", country: "US", limit: 200 },
    { term: "downtempo ambient", country: "GB", limit: 200 },
  ],
  FOLK: [
    { term: "folk", country: "US", limit: 200 },
    { term: "folk classics", country: "US", limit: 200 },
    { term: "indie folk", country: "GB", limit: 200 },
    { term: "french folk", country: "FR", limit: 200 },
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
  DANCE: [
    { term: "dance hits", country: "US", limit: 200 },
    { term: "dance music", country: "GB", limit: 200 },
    { term: "eurodance", country: "DE", limit: 200 },
    { term: "dance pop", country: "FR", limit: 200 },
  ],
  WORLD: [
    { term: "world music", country: "US", limit: 200 },
    { term: "worldwide music", country: "GB", limit: 200 },
    { term: "african world music", country: "ZA", limit: 200 },
    { term: "mediterranean music", country: "FR", limit: 200 },
  ],
  HIPHOP: [
    { term: "hip hop", country: "US", limit: 200 },
    { term: "hip hop classics", country: "US", limit: 200 },
    { term: "hip hop 2000s", country: "US", limit: 200 },
    { term: "hip hop 2020s", country: "US", limit: 200 },
  ],
  SERTANEJO: [
    { term: "sertanejo", country: "BR", limit: 200 },
    { term: "sertanejo universitario", country: "BR", limit: 200 },
    { term: "sertanejo raiz", country: "BR", limit: 200 },
    { term: "sertanejo hits", country: "BR", limit: 200 },
  ],
  ARABIC_POP: [
    { term: "arabic pop", country: "AE", limit: 200 },
    { term: "arab pop hits", country: "SA", limit: 200 },
    { term: "lebanese pop", country: "AE", limit: 200 },
    { term: "اغاني عربية", country: "AE", limit: 200 },
  ],
  AFRO_FUSION: [
    { term: "afro fusion", country: "NG", limit: 200 },
    { term: "afrofusion", country: "GB", limit: 200 },
    { term: "afro fusion hits", country: "NG", limit: 200 },
    { term: "afrobeats fusion", country: "GB", limit: 200 },
  ],
  BAILE_FUNK: [
    { term: "baile funk", country: "BR", limit: 200 },
    { term: "funk carioca", country: "BR", limit: 200 },
    { term: "brazilian funk", country: "BR", limit: 200 },
    { term: "baile funk hits", country: "BR", limit: 200 },
  ],
  PAGODE: [
    { term: "pagode", country: "BR", limit: 200 },
    { term: "pagode brasileiro", country: "BR", limit: 200 },
    { term: "pagode hits", country: "BR", limit: 200 },
    { term: "samba pagode", country: "BR", limit: 200 },
  ],
  HARD_ROCK: [
    { term: "hard rock", country: "US", limit: 200 },
    { term: "hard rock classics", country: "US", limit: 200 },
    { term: "hard rock 80s", country: "US", limit: 200 },
    { term: "modern hard rock", country: "GB", limit: 200 },
  ],
  INDIE: [
    { term: "indie", country: "GB", limit: 200 },
    { term: "indie pop", country: "GB", limit: 200 },
    { term: "indie rock", country: "US", limit: 200 },
    { term: "indie hits", country: "US", limit: 200 },
  ],
  LATIN_POP: [
    { term: "latin pop", country: "MX", limit: 200 },
    { term: "pop latino", country: "MX", limit: 200 },
    { term: "latin pop hits", country: "US", limit: 200 },
    { term: "pop en español", country: "ES", limit: 200 },
  ],
  MEXICAN: [
    { term: "musica mexicana", country: "MX", limit: 200 },
    { term: "regional mexicano", country: "MX", limit: 200 },
    { term: "mariachi", country: "MX", limit: 200 },
    { term: "corridos", country: "MX", limit: 200 },
  ],
  TROPICAL: [
    { term: "musica tropical", country: "MX", limit: 200 },
    { term: "tropical latin", country: "US", limit: 200 },
    { term: "tropical hits", country: "MX", limit: 200 },
    { term: "caribbean tropical", country: "US", limit: 200 },
  ],
  VOCAL: [
    { term: "vocal pop", country: "US", limit: 200 },
    { term: "vocal jazz", country: "US", limit: 200 },
    { term: "vocal classics", country: "GB", limit: 200 },
    { term: "vocal music", country: "FR", limit: 200 },
  ],
  SINGER_SONGWRITER: [
    { term: "singer songwriter", country: "US", limit: 200 },
    { term: "singer songwriter classics", country: "GB", limit: 200 },
    { term: "acoustic singer songwriter", country: "US", limit: 200 },
    { term: "auteur compositeur interprète", country: "FR", limit: 200 },
  ],
  INSTRUMENTAL: [
    { term: "instrumental music", country: "US", limit: 200 },
    { term: "instrumental hits", country: "GB", limit: 200 },
    { term: "instrumental piano", country: "FR", limit: 200 },
    { term: "instrumental guitar", country: "US", limit: 200 },
  ],
  NEW_AGE: [
    { term: "new age", country: "US", limit: 200 },
    { term: "new age classics", country: "US", limit: 200 },
    { term: "meditation new age", country: "GB", limit: 200 },
    { term: "relaxing new age", country: "FR", limit: 200 },
  ],
  CHRISTMAS: [
    { term: "christmas songs", country: "US", limit: 200 },
    { term: "christmas classics", country: "GB", limit: 200 },
    { term: "chansons de noël", country: "FR", limit: 200 },
    { term: "navidad musica", country: "ES", limit: 200 },
  ],
  ANNEES_60: [
    { term: "60s hits", country: "US", limit: 200 },
    { term: "années 60 français", country: "FR", limit: 200 },
    { term: "rock 60s", country: "GB", limit: 200 },
    { term: "soul 60s", country: "US", limit: 200 },
  ],
  ANNEES_70: [
    { term: "70s hits", country: "US", limit: 200 },
    { term: "années 70 français", country: "FR", limit: 200 },
    { term: "rock 70s", country: "GB", limit: 200 },
    { term: "disco 70s", country: "US", limit: 200 },
  ],
  ANNEES_2000: [
    { term: "2000s hits", country: "US", limit: 200 },
    { term: "années 2000 français", country: "FR", limit: 200 },
    { term: "pop 2000s", country: "GB", limit: 200 },
    { term: "rap 2000s", country: "US", limit: 200 },
  ],
  ANNEES_2010: [
    { term: "2010s hits", country: "US", limit: 200 },
    { term: "années 2010 français", country: "FR", limit: 200 },
    { term: "pop 2010s", country: "GB", limit: 200 },
    { term: "rap 2010s", country: "US", limit: 200 },
  ],
  ANNEES_2020: [
    { term: "2020s hits", country: "US", limit: 200 },
    { term: "années 2020 français", country: "FR", limit: 200 },
    { term: "pop 2020s", country: "GB", limit: 200 },
    { term: "rap 2020s", country: "US", limit: 200 },
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
  HOUSE: /house|dance|electronic|electronica/i,
  REGGAETON: /reggaeton|latin|latino|urban|urbano/i,
  AMAPIANO: /amapiano|afro|dance/i,
  ALTERNATIVE: /alternative|indie|rock/i,
  COUNTRY: /country/i,
  METAL: /metal|rock/i,
  SOUNDTRACK: /soundtrack|original|film|score|bande/i,
  BLUES: /blues/i,
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
  TECHNO: 1600, TRANCE: 1600, DNB: 1500, DUBSTEP: 1400, UK_GARAGE: 1400,
  GRIME: 1400, DRILL: 1800, PUNK: 1500, GOSPEL: 1400, DANCEHALL: 1600,
  SALSA: 1700, BACHATA: 1500, CUMBIA: 1600, MERENGUE: 1400, FLAMENCO: 1400,
  FADO: 1200, ZOUK: 1400, KOMPA: 1200, GNAWA: 1000, CHAABI: 1400,
  KHALEEJI: 1500, EGYPT_POP: 1500, JPOP: 1900, ANIME: 1800, CPOP: 1700,
  MANDOPOP: 1700, PUNJABI: 1700, AFROHOUSE: 1600, AFROPOP: 1800, LOFI: 1400,
  AMBIENT: 1200, FOLK: 1400,
};
const DEFAULT_BUDGET = 1000;
const QUERY_CONCURRENCY = 10;
// One cron tick processes only five provider searches. This keeps expansion
// continuous without hammering the public catalog API.
const BATCH_QUERY_COUNT = 5;
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

async function seed(theme: string, batch = 0) {
  const allQueries = queriesForTheme(theme);
  const safeBatch = Math.max(0, Math.floor(Number.isFinite(batch) ? batch : 0));
  const totalBatches = Math.ceil(allQueries.length / BATCH_QUERY_COUNT);
  const start = safeBatch * BATCH_QUERY_COUNT;
  const queries = allQueries.slice(start, start + BATCH_QUERY_COUNT);
  const budget = THEME_BUDGET[theme] ?? DEFAULT_BUDGET;
  if (!queries.length) {
    return { theme, batch: safeBatch, totalBatches, done: true, queries: 0, found: 0, considered: 0, distinctArtists: 0, inserted: 0, updated: 0, linked: 0, budget };
  }
  const resultSets = await mapLimit(queries, QUERY_CONCURRENCY, fetchQuery);

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
    batch: safeBatch,
    totalBatches,
    nextBatch: safeBatch + 1,
    done: safeBatch + 1 >= totalBatches,
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
    let batch = 0;
    if (req.method === "GET") {
      const url = new URL(req.url);
      theme = url.searchParams.get("theme")?.toUpperCase() ?? "";
      batch = Number(url.searchParams.get("batch") ?? 0);
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      theme = String(body?.theme ?? "").toUpperCase();
      batch = Number(body?.batch ?? 0);
    } else return out(405, { error: "method_not_allowed" });
    return out(200, { ok: true, ...(await seed(theme, batch)) });
  } catch (error) {
    return out(400, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
