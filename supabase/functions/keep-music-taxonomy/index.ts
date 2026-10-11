import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300",
};

const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
let syncGenresPromise: Promise<void> | null = null;
let syncCountriesPromise: Promise<void> | null = null;

function cleanLimit(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(10, Math.min(Math.round(n), max)) : fallback;
}
function genreKey(label: string) {
  return label.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}
async function upsertChunks(table: string, rows: any[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + size));
    if (error) throw error;
  }
}
async function syncGenres() {
  if (syncGenresPromise) return syncGenresPromise;
  syncGenresPromise = (async () => {
    const response = await fetch("https://musicbrainz.org/ws/2/genre/all?fmt=txt", {
      headers: { "User-Agent": "LokiMusic/1.0 (https://github.com/adelkhatra-bit/KEEP)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`musicbrainz_${response.status}`);
    const body = await response.text();
    const names = Array.from(new Set(body.split(/\r?\n/).map((x) => x.normalize("NFKC").replace(/\s+/g, " ").trim()).filter(Boolean)));
    await upsertChunks("music_genre_catalog", names.map((label) => ({
      genre_key: genreKey(label),
      label,
      source: "MUSICBRAINZ",
      updated_at: new Date().toISOString(),
    })));
  })().finally(() => { syncGenresPromise = null; });
  return syncGenresPromise;
}
async function syncCountries() {
  if (syncCountriesPromise) return syncCountriesPromise;
  syncCountriesPromise = (async () => {
    const response = await fetch("https://restcountries.com/v3.1/all?fields=cca2,name,languages", { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`countries_${response.status}`);
    const data = await response.json().catch(() => []);
    const raw = Array.isArray(data) ? data : [];
    const rows = raw.flatMap((row: any) => {
      const code = String(row?.cca2 ?? "").trim().toUpperCase();
      const name = String(row?.name?.common ?? row?.name?.official ?? "").trim();
      if (!/^[A-Z]{2}$/.test(code) || !name) return [];
      return [{
        code,
        name,
        language_codes: row?.languages && typeof row.languages === "object" ? Object.keys(row.languages).map((x) => String(x).toLowerCase()) : [],
        source: "RESTCOUNTRIES",
        updated_at: new Date().toISOString(),
      }];
    });
    const languageMap = new Map<string,string>();
    for (const row of raw) {
      if (!row?.languages || typeof row.languages !== "object") continue;
      for (const [code, name] of Object.entries(row.languages)) {
        const cleanCode = String(code ?? "").trim().toLowerCase();
        const cleanName = String(name ?? "").trim();
        if (cleanCode && cleanName && !languageMap.has(cleanCode)) languageMap.set(cleanCode, cleanName);
      }
    }
    await upsertChunks("music_country_catalog", rows);
    await upsertChunks("music_language_catalog", Array.from(languageMap.entries()).map(([code,name]) => ({
      code, name, source: "RESTCOUNTRIES", updated_at: new Date().toISOString(),
    })));
  })().finally(() => { syncCountriesPromise = null; });
  return syncCountriesPromise;
}
async function ensureCatalogs() {
  const [{ count: genreCount }, { count: countryCount }, { count: languageCount }] = await Promise.all([
    admin.from("music_genre_catalog").select("*", { count: "exact", head: true }),
    admin.from("music_country_catalog").select("*", { count: "exact", head: true }),
    admin.from("music_language_catalog").select("*", { count: "exact", head: true }),
  ]);
  await Promise.all([
    (genreCount ?? 0) < 500 ? syncGenres().catch(() => {}) : Promise.resolve(),
    ((countryCount ?? 0) < 180 || (languageCount ?? 0) < 120) ? syncCountries().catch(() => {}) : Promise.resolve(),
  ]);
}
async function handle(payload: any) {
  await ensureCatalogs();
  const kind = String(payload?.kind ?? "genres").toLowerCase();
  const query = String(payload?.q ?? "").trim();
  if (kind === "countries") {
    const limit = cleanLimit(payload?.limit, 300, 300);
    const { data, error } = await admin.rpc("keep_music_country_search", { p_query: query || null, p_limit: limit });
    if (error) throw error;
    return { ok: true, kind, items: data ?? [] };
  }
  if (kind === "languages") {
    const limit = cleanLimit(payload?.limit, 300, 300);
    const { data, error } = await admin.rpc("keep_music_language_search", { p_query: query || null, p_limit: limit });
    if (error) throw error;
    return { ok: true, kind, items: data ?? [] };
  }
  const limit = cleanLimit(payload?.limit, query ? 120 : 80, 300);
  const { data, error } = await admin.rpc("keep_music_genre_search", { p_query: query || null, p_limit: limit });
  if (error) throw error;
  return { ok: true, kind: "genres", items: data ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const payload = {
      kind: body?.kind ?? url.searchParams.get("kind"),
      q: body?.q ?? url.searchParams.get("q"),
      limit: body?.limit ?? url.searchParams.get("limit"),
    };
    return json(200, await handle(payload));
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
