import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type Place = { city?: string; countryCode?: string; provider?: string };
const cache = new Map<string, { expiresAt: number; place: Place }>();

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function cleanCity(value: unknown): string | undefined {
  const city = typeof value === "string" ? value.trim() : "";
  return city ? city.slice(0, 120) : undefined;
}

function cleanCountryCode(value: unknown): string | undefined {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

async function bigDataCloud(lat: number, lng: number): Promise<Place> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("localityLanguage", "fr");
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`bigdatacloud_${response.status}`);
  const data = await response.json().catch(() => ({})) as any;
  return {
    city: cleanCity(data?.city || data?.locality || data?.principalSubdivision),
    countryCode: cleanCountryCode(data?.countryCode),
    provider: "bigdatacloud",
  };
}

async function nominatimReverse(lat: number, lng: number): Promise<Place> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "fr");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "KEEP/1.0 (location resolver)" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`nominatim_${response.status}`);
  const data = await response.json().catch(() => ({})) as any;
  const address = data?.address || {};
  return {
    city: cleanCity(address.city || address.town || address.village || address.municipality || address.county),
    countryCode: cleanCountryCode(address.country_code),
    provider: "nominatim",
  };
}

async function handleReverse(body: any) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json(400, { error: "invalid_coordinates" });
  }

  const cacheKey = `reverse:${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return json(200, { ok: true, ...cached.place, cached: true });

  let place: Place = {};
  try { place = await bigDataCloud(lat, lng); } catch {
    try { place = await nominatimReverse(lat, lng); } catch { place = {}; }
  }

  if (!place.city && !place.countryCode) {
    return json(503, { error: "reverse_geocode_unavailable", message: "Ville/pays momentanément indisponibles." });
  }

  cache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, place });
  return json(200, { ok: true, ...place, cached: false });
}

// Adel (08/09/2026) : "le systeme puisse proposer des adresses automatiquement
// selon le pays ... le FR doit etre automatique" -- autocomplete d'adresse
// (saisie -> suggestions), pour le champ lieu d'un evenement. Nominatim
// (OpenStreetMap) deja utilise et prouve fiable ci-dessus pour le reverse
// geocoding ; son endpoint /search fait exactement l'autocomplete "a la
// Google Maps" sans cle payante ni compte a ouvrir. Biais pays par defaut
// FR (le cas courant), overridable si l'evenement est ailleurs.
type Suggestion = { label: string; city?: string; countryCode?: string; lat: number; lng: number };

async function nominatimSearch(query: string, countryCode: string): Promise<Suggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "fr");
  url.searchParams.set("limit", "6");
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase());
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "KEEP/1.0 (address autocomplete)" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`nominatim_search_${response.status}`);
  const data = await response.json().catch(() => []) as any[];
  return (Array.isArray(data) ? data : []).map((row) => ({
    label: String(row?.display_name || "").slice(0, 200),
    city: cleanCity(row?.address?.city || row?.address?.town || row?.address?.village),
    countryCode: cleanCountryCode(row?.address?.country_code),
    lat: Number(row?.lat),
    lng: Number(row?.lon),
  })).filter((row) => row.label && Number.isFinite(row.lat) && Number.isFinite(row.lng));
}

async function handleSearch(body: any) {
  const query = String(body?.query ?? "").trim().slice(0, 200);
  if (query.length < 3) return json(200, { ok: true, suggestions: [] });
  const countryCode = cleanCountryCode(body?.countryCode) || "FR";

  const cacheKey = `search:${countryCode}:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey) as any;
  if (cached && cached.expiresAt > Date.now()) return json(200, { ok: true, suggestions: cached.place, cached: true });

  try {
    const suggestions = await nominatimSearch(query, countryCode);
    cache.set(cacheKey, { expiresAt: Date.now() + 30 * 60 * 1000, place: suggestions as any });
    return json(200, { ok: true, suggestions, cached: false });
  } catch {
    return json(503, { error: "address_search_unavailable", message: "Recherche d’adresse momentanément indisponible." });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "reverse");
    if (action === "search") return await handleSearch(body);
    return await handleReverse(body);
  } catch {
    return json(500, { error: "location_resolver_error" });
  }
});
