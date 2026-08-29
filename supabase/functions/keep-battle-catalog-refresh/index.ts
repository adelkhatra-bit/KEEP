import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" } });
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(feat|featuring|ft)\.?\s+.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artwork600(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!url) return null;
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}

function yearFrom(value: unknown): number | null {
  const match = String(value ?? "").match(/^(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1900 && year <= 2100 ? year : null;
}

function themesFor(genreRaw: unknown, year: number | null): string[] {
  const genre = norm(genreRaw);
  const out = new Set<string>();
  if (/afro|afrobeats|afro beat/.test(genre)) out.add("AFRO");
  if (/french pop|chanson francaise/.test(genre)) out.add("CHANSON_FR");
  if (/classical|classique/.test(genre)) out.add("CLASSIQUE");
  if (/disco/.test(genre)) out.add("DISCO");
  if (/dance|electronic|electronica|house|techno/.test(genre)) out.add("ELECTRO");
  if (/funk/.test(genre)) out.add("FUNK");
  if (/jazz/.test(genre)) out.add("JAZZ");
  if (/latin|latino|reggaeton/.test(genre)) out.add("LATINO");
  if (/\bpop\b/.test(genre)) out.add("POP");
  if (/rai|maghreb/.test(genre)) out.add("RAI");
  if (/reggae|dancehall/.test(genre)) out.add("REGGAE");
  if (/r b|rnb|soul/.test(genre)) out.add("RNB");
  if (/soul/.test(genre)) out.add("SOUL");
  if (/rock|alternative|metal|punk/.test(genre)) out.add("ROCK");
  if (year != null && year >= 1980 && year <= 1989) out.add("ANNEES_80");
  if (year != null && year >= 1990 && year <= 1999) out.add("ANNEES_90");
  return [...out];
}

function bestMatch(results: any[], title: string, artist: string): any | null {
  const wantedTitle = norm(title);
  const wantedArtist = norm(artist);
  let best: any | null = null;
  let bestScore = -1;
  for (const item of results) {
    const t = norm(item?.trackName);
    const a = norm(item?.artistName);
    if (!t || !a) continue;
    let score = 0;
    if (a === wantedArtist) score += 6;
    else if (a.includes(wantedArtist) || wantedArtist.includes(a)) score += 3;
    if (t === wantedTitle) score += 7;
    else if (t.includes(wantedTitle) || wantedTitle.includes(t)) score += 4;
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore >= 9 ? best : null;
}

async function lookup(track: any) {
  const term = encodeURIComponent(`${track.artist} ${track.title}`);
  const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8&country=FR`, { headers: { "user-agent": "KEEP/1.0 Battle Catalog" } });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const rows = Array.isArray(body?.results) ? body.results : [];
  const match = bestMatch(rows, track.title, track.artist);
  if (!match || !String(match.previewUrl ?? "").startsWith("https://")) return null;
  return match;
}

async function processOne(track: any) {
  const match = await lookup(track);
  if (!match) return { enriched: false, themed: 0 };

  const year = yearFrom(match.releaseDate);
  const existingProviderIds = track.provider_ids && typeof track.provider_ids === "object" ? track.provider_ids : {};
  const existingExternalUrls = track.external_urls && typeof track.external_urls === "object" ? track.external_urls : {};
  const existingAvailable = Array.isArray(track.available_on) ? track.available_on : [];
  const patch: Record<string, unknown> = {
    preview_url: String(match.previewUrl),
    provider_ids: { ...existingProviderIds, appleMusic: String(match.trackId) },
    external_urls: { ...existingExternalUrls, appleMusic: String(match.trackViewUrl ?? "") || undefined },
    available_on: Array.from(new Set([...existingAvailable, "Apple Music"])),
  };
  if (!track.artwork_url && match.artworkUrl100) patch.artwork_url = artwork600(match.artworkUrl100);
  if (!track.album && match.collectionName) patch.album = String(match.collectionName);
  if (track.release_year == null && year != null) patch.release_year = year;

  const { error: updateError } = await admin.from("tracks").update(patch).eq("id", track.id);
  if (updateError) return { enriched: false, themed: 0 };

  const themes = themesFor(match.primaryGenreName, year);
  if (themes.length) {
    await admin.from("keep_battle_track_themes").upsert(
      themes.map((themeCode) => ({ track_id: track.id, theme_code: themeCode, source: "itunes_public", confidence: 0.85 })),
      { onConflict: "track_id,theme_code" },
    );
  }
  return { enriched: true, themed: themes.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const requested = Number(body?.limit ?? 24);
    const limit = Math.max(5, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 24, 36));

    const { count: playableBefore } = await admin.from("tracks").select("id", { count: "exact", head: true }).not("preview_url", "is", null).neq("preview_url", "");
    if ((playableBefore ?? 0) >= 180 && body?.force !== true) {
      return json(200, { ok: true, skipped: true, reason: "catalog_target_reached", playable: playableBefore ?? 0, secretRequired: false });
    }

    const { data: tracks, error } = await admin
      .from("tracks")
      .select("id,title,artist,album,artwork_url,preview_url,release_year,provider_ids,external_urls,available_on")
      .or("preview_url.is.null,preview_url.eq.")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    let enriched = 0;
    let themed = 0;
    const rows = tracks ?? [];
    for (let start = 0; start < rows.length; start += 4) {
      const batch = rows.slice(start, start + 4);
      const results = await Promise.all(batch.map(processOne));
      for (const result of results) { if (result.enriched) enriched += 1; themed += result.themed; }
    }

    const { count: playableAfter } = await admin.from("tracks").select("id", { count: "exact", head: true }).not("preview_url", "is", null).neq("preview_url", "");
    return json(200, {
      ok: true,
      secretRequired: false,
      provider: "Apple iTunes public catalog",
      scanned: rows.length,
      enriched,
      themeLinksAdded: themed,
      playableBefore: playableBefore ?? 0,
      playableAfter: playableAfter ?? playableBefore ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: "battle_catalog_refresh_failed", message: message.slice(0, 300) });
  }
});
