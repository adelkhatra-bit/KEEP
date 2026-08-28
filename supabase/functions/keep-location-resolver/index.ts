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

async function nominatim(lat: number, lng: number): Promise<Place> {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(400, { error: "invalid_coordinates" });
    }

    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return json(200, { ok: true, ...cached.place, cached: true });

    let place: Place = {};
    try { place = await bigDataCloud(lat, lng); } catch {
      try { place = await nominatim(lat, lng); } catch { place = {}; }
    }

    if (!place.city && !place.countryCode) {
      return json(503, { error: "reverse_geocode_unavailable", message: "Ville/pays momentanément indisponibles." });
    }

    cache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, place });
    return json(200, { ok: true, ...place, cached: false });
  } catch {
    return json(500, { error: "location_resolver_error" });
  }
});
