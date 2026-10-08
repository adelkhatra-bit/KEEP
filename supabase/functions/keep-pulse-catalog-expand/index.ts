import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers });

function cleanText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
function artwork600(value: unknown): string | null {
  const url = cleanText(value);
  if (!url) return null;
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}
function releaseYear(value: unknown): number | null {
  const match = cleanText(value).match(/^(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}
function unique(values: unknown[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = cleanText(raw);
    const key = value.toLocaleLowerCase("en");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

type Query = { term: string; country: string };

async function search(query: Query): Promise<any[]> {
  const params = new URLSearchParams({
    term: query.term,
    media: "music",
    entity: "song",
    limit: "75",
    country: query.country,
  });
  const response = await fetch("https://itunes.apple.com/search?" + params.toString(), {
    headers: { "user-agent": "LokiMusic/1.0 Pulse Catalog" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.results) ? payload.results : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { ok: false, error: "unauthorized" });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const uid = authData?.user?.id;
  if (authError || !uid) return json(401, { ok: false, error: "unauthorized" });

  try {
    const { data: allowed, error: allowError } = await admin.rpc("service_allow_catalog_expansion", {
      p_profile_id: uid,
      p_daily_limit: 12,
      p_cooldown_minutes: 45,
    });
    if (allowError) throw allowError;
    if (!allowed) return json(200, { ok: true, skipped: true, reason: "rate_limited" });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("favorite_genres,inferred_genres,favorite_artists,inferred_artists,music_country_codes,country_code")
      .eq("id", uid)
      .maybeSingle();
    if (profileError) throw profileError;

    const genres = unique([
      ...((profile?.favorite_genres as unknown[]) ?? []),
      ...((profile?.inferred_genres as unknown[]) ?? []),
    ], 6);
    const artists = unique([
      ...((profile?.favorite_artists as unknown[]) ?? []),
      ...((profile?.inferred_artists as unknown[]) ?? []),
    ], 3);
    const countries = unique([
      ...((profile?.music_country_codes as unknown[]) ?? []),
      profile?.country_code,
      "US",
      "FR",
      "GB",
    ], 4).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));

    const safeCountries = countries.length ? countries : ["US", "FR"];
    const queries: Query[] = [];
    const queryKeys = new Set<string>();

    const push = (term: string, country: string) => {
      const cleanTerm = cleanText(term);
      if (!cleanTerm || !/^[A-Z]{2}$/.test(country)) return;
      const key = cleanTerm.toLocaleLowerCase("en") + ":" + country;
      if (queryKeys.has(key) || queries.length >= 9) return;
      queryKeys.add(key);
      queries.push({ term: cleanTerm, country });
    };

    // Genres are paired with several user-selected storefronts so local music
    // can surface without maintaining a hard-coded country list.
    genres.forEach((genre, index) => {
      push(genre, safeCountries[index % safeCountries.length]);
      if (index < 3 && safeCountries.length > 1) {
        push(genre, safeCountries[(index + 1) % safeCountries.length]);
      }
    });
    artists.forEach((artist, index) => push(artist, safeCountries[index % safeCountries.length]));

    // A brand-new user with no declared taste still gets locally relevant
    // discovery material rather than an empty Pulse.
    if (!queries.length) {
      safeCountries.slice(0, 3).forEach((country) => push("music hits", country));
    }

    const batches = await Promise.all(queries.map(async (query) => ({
      query,
      rows: await search(query).catch(() => []),
    })));

    const byAppleId = new Map<string, any>();
    for (const { query, rows } of batches) {
      for (const item of rows) {
        const appleId = cleanText(item?.trackId);
        const title = cleanText(item?.trackName);
        const artist = cleanText(item?.artistName);
        const previewUrl = cleanText(item?.previewUrl);
        if (!appleId || !title || !artist || !previewUrl.startsWith("https://")) continue;
        if (byAppleId.has(appleId)) continue;
        byAppleId.set(appleId, {
          appleId,
          title,
          artist,
          album: cleanText(item?.collectionName) || null,
          artworkUrl: artwork600(item?.artworkUrl100),
          previewUrl,
          trackUrl: cleanText(item?.trackViewUrl) || null,
          genre: cleanText(item?.primaryGenreName) || null,
          storefront: query.country,
          releaseYear: releaseYear(item?.releaseDate),
          durationSec: Number.isFinite(Number(item?.trackTimeMillis))
            ? Math.max(1, Math.round(Number(item.trackTimeMillis) / 1000))
            : null,
        });
        if (byAppleId.size >= 450) break;
      }
      if (byAppleId.size >= 450) break;
    }

    const items = [...byAppleId.values()];
    if (!items.length) {
      return json(200, { ok: true, skipped: true, reason: "no_provider_results", queries: queries.length });
    }

    const { data: ingested, error: ingestError } = await admin.rpc("service_music_catalog_ingest", {
      p_items: items,
    });
    if (ingestError) throw ingestError;

    return json(200, {
      ok: true,
      provider: "Apple iTunes public catalog",
      queries: queries.length,
      countries: safeCountries,
      genres: genres.slice(0, 6),
      artists: artists.slice(0, 3),
      found: items.length,
      inserted: Number(ingested?.inserted ?? 0),
      updated: Number(ingested?.updated ?? 0),
      storesFullTracks: false,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
