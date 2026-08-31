import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { seedInBackground as seedFingerprintInBackground } from "../_shared/fingerprintSeed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

function seedInBackground(rec: unknown) {
  seedFingerprintInBackground(admin, rec as any);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SOCIAL_HOSTS = ["tiktok.com", "instagram.com", "youtube.com", "youtu.be", "snapchat.com", "snap.com", "facebook.com", "fb.watch"];
const MUSIC_HOSTS = ["music.apple.com", "open.spotify.com", "deezer.com", "soundcloud.com", "listen.tidal.com"];
const ALLOWED_HOSTS = [...SOCIAL_HOSTS, ...MUSIC_HOSTS];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function hostAllowed(host: string) {
  const clean = host.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some((allowed) => clean === allowed || clean.endsWith(`.${allowed}`));
}

function safeUrl(value: string, base?: URL): URL | null {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (!/^https?:$/.test(url.protocol) || !hostAllowed(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/https?:\/\/\S+/g, " ").replace(/[@#][\p{L}\p{N}_.-]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function cleanMusicText(value: unknown) {
  return String(value ?? "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s*[\[(](official\s*(music\s*)?video|official\s*audio|lyrics?|lyric\s*video|visuali[sz]er|audio|clip officiel|music video)[^\])]*[\])]/gi, "")
    .replace(/\s*[-–—|]\s*(youtube|tiktok|instagram|spotify|apple music|deezer|soundcloud)\s*$/i, "")
    .replace(/\s+/g, " ").trim();
}

function htmlDecode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function jsonStringDecode(value: string) {
  try { return JSON.parse(`"${value.replace(/"/g, '\\"')}"`); }
  catch { return value.replace(/\\u002F/g, "/").replace(/\\n/g, " ").replace(/\\"/g, '"'); }
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const pattern of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ]) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlDecode(match[1]).trim();
  }
  return "";
}

function titleTag(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? cleanMusicText(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanMusicText(jsonStringDecode(match[1]));
  }
  return "";
}

function extractExplicitMusic(html: string): { title: string; artist: string } | null {
  const title = firstMatch(html, [
    /"musicName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"musicTitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"song_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"songName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"audio_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"original_audio_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
  ]);
  const artist = firstMatch(html, [
    /"musicAuthor"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"artist_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"artistName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"musicAuthorName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
  ]);
  if (!title || !artist || /^(original sound|son original|original audio|audio original|originalton)$/i.test(title)) return null;
  return { title, artist };
}

function parseArtistTitle(text: string) {
  const clean = cleanMusicText(text);
  if (!clean) return null;
  const by = clean.match(/^(.{2,120}?)\s+by\s+(.{2,100})$/i);
  if (by) return { title: by[1].trim(), artist: by[2].trim() };
  for (const sep of [" - ", " – ", " — ", " | "]) {
    const parts = clean.split(sep).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0].length <= 100 && parts[1].length <= 140) return { artist: parts[0], title: parts[1] };
  }
  return null;
}

async function optionalUserId(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allowRequest(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80);
  const identityHash = await sha256(`keyless-source-v4|${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", { p_identity_hash: identityHash, p_limit: 24, p_window_seconds: 60 });
  if (error) return true;
  return Boolean(data);
}

async function fetchJson(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6500), headers: { "User-Agent": "KEEP/1.0" } });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch { return null; }
}

async function fetchPage(start: URL): Promise<{ url: URL; html: string }> {
  let current = start;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1 KEEP/1.0",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = safeUrl(response.headers.get("location") ?? "", current);
      if (!next) break;
      current = next;
      continue;
    }
    const type = response.headers.get("content-type") || "";
    return { url: current, html: /text\/html|application\/xhtml/i.test(type) ? (await response.text()).slice(0, 1_800_000) : "" };
  }
  return { url: current, html: "" };
}

async function oEmbed(platform: string, url: string) {
  let endpoint = "";
  if (platform === "TIKTOK") endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  if (platform === "YOUTUBE") endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  return endpoint ? fetchJson(endpoint) : null;
}

type CatalogTrack = {
  source: "apple" | "deezer";
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
  externalUrl?: string;
};

function appleTrack(row: any): CatalogTrack | null {
  if (!row?.trackName || !row?.artistName || !row?.trackId) return null;
  return {
    source: "apple", id: String(row.trackId), title: String(row.trackName), artist: String(row.artistName),
    album: row.collectionName ? String(row.collectionName) : undefined,
    artworkUrl: row.artworkUrl100 ? String(row.artworkUrl100).replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600") : undefined,
    previewUrl: row.previewUrl ? String(row.previewUrl) : undefined,
    externalUrl: row.trackViewUrl ? String(row.trackViewUrl) : undefined,
  };
}

function deezerTrack(row: any): CatalogTrack | null {
  if (!row?.title || !row?.artist?.name || !row?.id) return null;
  return {
    source: "deezer", id: String(row.id), title: String(row.title), artist: String(row.artist.name),
    album: row.album?.title ? String(row.album.title) : undefined,
    artworkUrl: row.album?.cover_xl || row.album?.cover_big || undefined,
    previewUrl: row.preview || undefined,
    externalUrl: row.link || undefined,
  };
}

async function appleLookup(id: string) {
  const payload = await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&country=FR`);
  const row = Array.isArray(payload?.results) ? payload.results.find((item: any) => item?.wrapperType === "track") : null;
  return row ? appleTrack(row) : null;
}

async function deezerLookup(id: string) {
  return deezerTrack(await fetchJson(`https://api.deezer.com/track/${encodeURIComponent(id)}`));
}

async function searchApple(query: string): Promise<CatalogTrack[]> {
  if (!query.trim()) return [];
  const payload = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query.slice(0, 220))}&entity=song&limit=18&country=FR`);
  return (Array.isArray(payload?.results) ? payload.results : []).flatMap((row: any) => { const track = appleTrack(row); return track ? [track] : []; });
}

async function searchDeezer(query: string): Promise<CatalogTrack[]> {
  if (!query.trim()) return [];
  const payload = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query.slice(0, 220))}&limit=18`);
  return (Array.isArray(payload?.data) ? payload.data : []).flatMap((row: any) => { const track = deezerTrack(row); return track ? [track] : []; });
}

function tokens(value: string) {
  const ignored = new Set(["official", "video", "audio", "lyrics", "lyric", "music", "clip", "remix", "version", "feat", "ft", "the", "and", "youtube", "tiktok", "instagram"]);
  return normalize(value).split(/\s+/).filter((t) => t.length >= 2 && !ignored.has(t));
}

function tokenCoverage(needle: string, haystack: string) {
  const wanted = tokens(needle);
  if (!wanted.length) return 0;
  const have = new Set(tokens(haystack));
  return wanted.filter((t) => have.has(t)).length / wanted.length;
}

function scoreTrack(track: CatalogTrack, evidence: string, explicit: { title: string; artist: string } | null) {
  const combined = `${track.artist} ${track.title} ${track.album ?? ""}`;
  let score = tokenCoverage(evidence, combined) * 0.45 + tokenCoverage(track.title, evidence) * 0.28 + tokenCoverage(track.artist, evidence) * 0.23;
  if (explicit) {
    const titleScore = tokenCoverage(explicit.title, track.title);
    const artistScore = tokenCoverage(explicit.artist, track.artist);
    score = Math.max(score, titleScore * 0.54 + artistScore * 0.42 + (normalize(track.title) === normalize(explicit.title) ? 0.03 : 0) + (normalize(track.artist) === normalize(explicit.artist) ? 0.03 : 0));
  }
  return Math.min(1, score);
}

function sameSong(a: CatalogTrack, b: CatalogTrack) {
  return tokenCoverage(a.title, b.title) >= 0.8 && tokenCoverage(a.artist, b.artist) >= 0.8;
}

function recognition(track: CatalogTrack, confidence: number, sourceUrl: string, corroborating?: CatalogTrack | null) {
  const providerIds: Record<string, string> = {};
  const externalUrls: Record<string, string> = { source: sourceUrl };
  for (const item of [track, corroborating].filter(Boolean) as CatalogTrack[]) {
    if (item.source === "apple") { providerIds.appleMusic = item.id; if (item.externalUrl) externalUrls.appleMusic = item.externalUrl; }
    if (item.source === "deezer") { providerIds.deezer = item.id; if (item.externalUrl) externalUrls.deezer = item.externalUrl; }
  }
  externalUrls.youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`)}`;
  return {
    confidence: Math.max(0.55, Math.min(0.99, confidence)), title: track.title, artist: track.artist, album: track.album,
    artworkUrl: track.artworkUrl || corroborating?.artworkUrl, previewUrl: track.previewUrl || corroborating?.previewUrl,
    availableOn: [providerIds.appleMusic ? "Apple Music" : null, providerIds.deezer ? "Deezer" : null].filter(Boolean),
    externalUrls, providerIds, recognitionProviderTrackId: `keyless:${track.source}:${track.id}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const body = await req.json().catch(() => ({}));
    if (String(body?.action ?? "") === "health") {
      return json(200, { ok: true, service: "keep-music-keyless-source", provider: "KEYLESS_SOURCE", apiKeyRequired: false, catalogs: ["APPLE_ITUNES_SEARCH", "DEEZER_PUBLIC_SEARCH"], crossCatalogValidation: true, secretExposed: false });
    }

    const userId = await optionalUserId(req);
    if (!(await allowRequest(req, userId))) return json(429, { ok: false, provider: "KEYLESS_SOURCE", error: "keyless_rate_limited", recognition: null });

    const rawUrl = String(body?.url ?? "").trim();
    const sourceUrl = safeUrl(rawUrl);
    const rawText = cleanMusicText(body?.rawText ?? "").slice(0, 1500);
    const suppliedTitle = cleanMusicText(body?.title ?? "").slice(0, 500);
    const platform = String(body?.platform ?? "UNKNOWN").toUpperCase();
    if (!sourceUrl && !rawText && !suppliedTitle) return json(200, { ok: true, provider: "KEYLESS_SOURCE", recognition: null });

    if (sourceUrl?.hostname.toLowerCase().includes("music.apple.com")) {
      const pathId = sourceUrl.pathname.split("/").filter(Boolean).reverse().find((part) => /^\d+$/.test(part));
      const id = sourceUrl.searchParams.get("i") || pathId || "";
      if (/^\d+$/.test(id)) {
        const exact = await appleLookup(id);
        if (exact) {
          const rec = recognition(exact, 0.99, sourceUrl.toString());
          seedInBackground(rec);
          return json(200, { ok: true, provider: "KEYLESS_SOURCE", strategy: "apple-direct", recognition: rec, evidence: { direct: true, crossCatalogConfirmed: false } });
        }
      }
    }

    if (sourceUrl?.hostname.toLowerCase().includes("deezer.com")) {
      const match = sourceUrl.pathname.match(/\/track\/(\d+)/i);
      if (match?.[1]) {
        const exact = await deezerLookup(match[1]);
        if (exact) {
          const rec = recognition(exact, 0.99, sourceUrl.toString());
          seedInBackground(rec);
          return json(200, { ok: true, provider: "KEYLESS_SOURCE", strategy: "deezer-direct", recognition: rec, evidence: { direct: true, crossCatalogConfirmed: false } });
        }
      }
    }

    let page = { url: sourceUrl, html: "" as string };
    if (sourceUrl) {
      try { const fetched = await fetchPage(sourceUrl); page = { url: fetched.url, html: fetched.html }; } catch { /* metadata best effort */ }
    }
    const embedded = page.url ? await oEmbed(platform, page.url.toString()) : null;
    const explicit = extractExplicitMusic(page.html);
    const ogTitle = metaContent(page.html, "og:title") || metaContent(page.html, "twitter:title") || titleTag(page.html);
    const ogDescription = metaContent(page.html, "og:description") || metaContent(page.html, "twitter:description") || metaContent(page.html, "description");
    const parsed = [suppliedTitle, rawText, String(embedded?.title ?? ""), ogTitle].map(parseArtistTitle).find(Boolean) as { title: string; artist: string } | undefined;
    const evidence = [explicit?.title, explicit?.artist, parsed?.title, parsed?.artist, embedded?.title, embedded?.author_name, ogTitle, ogDescription, suppliedTitle, rawText].filter(Boolean).join(" ").slice(0, 5000);

    const queries = new Set<string>();
    if (explicit) queries.add(`${explicit.artist} ${explicit.title}`);
    if (parsed) queries.add(`${parsed.artist} ${parsed.title}`);
    if (embedded?.title) queries.add(cleanMusicText(embedded.title));
    if (ogTitle) queries.add(cleanMusicText(ogTitle));
    if (suppliedTitle) queries.add(suppliedTitle);
    if (evidence) queries.add(cleanMusicText(evidence).slice(0, 180));

    const candidates: CatalogTrack[] = [];
    for (const query of Array.from(queries).filter(Boolean).slice(0, 4)) {
      const [apple, deezer] = await Promise.all([searchApple(query), searchDeezer(query)]);
      candidates.push(...apple, ...deezer);
    }
    if (!candidates.length) return json(200, { ok: true, provider: "KEYLESS_SOURCE", recognition: null, reason: "catalog_no_match" });

    const explicitEvidence = explicit ?? parsed ?? null;
    const scored = candidates.map((track) => ({ track, score: scoreTrack(track, evidence, explicitEvidence) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    const corroborating = scored.find((item) => item.track.source !== best.track.source && sameSong(best.track, item.track))?.track ?? null;
    let confidence = best.score + (corroborating ? 0.12 : 0);
    if (explicit && confidence >= 0.6) confidence = Math.max(confidence, 0.86);
    const directMusicHost = Boolean(page.url && MUSIC_HOSTS.some((host) => page.url!.hostname.toLowerCase().replace(/^www\./, "") === host || page.url!.hostname.toLowerCase().endsWith(`.${host}`)));
    const threshold = directMusicHost ? 0.58 : 0.68;
    if (confidence < threshold) return json(200, { ok: true, provider: "KEYLESS_SOURCE", recognition: null, confidence, reason: "confidence_too_low" });

    const finalRecognition = recognition(best.track, confidence, page.url?.toString() || rawUrl, corroborating);
    seedInBackground(finalRecognition);
    return json(200, {
      ok: true, provider: "KEYLESS_SOURCE", strategy: corroborating ? "cross-catalog" : explicit ? "explicit-music-metadata" : "public-metadata",
      recognition: finalRecognition,
      evidence: { platform, explicitMusicMetadata: Boolean(explicit), parsedArtistTitle: Boolean(parsed), crossCatalogConfirmed: Boolean(corroborating), directMusicHost },
    });
  } catch (error) {
    console.error("[keep-music-keyless-source]", error);
    return json(200, { ok: false, provider: "KEYLESS_SOURCE", recognition: null, reason: "resolver_unavailable" });
  }
});
