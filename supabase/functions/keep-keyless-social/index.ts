import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_HOSTS = [
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "instagram.com", "www.instagram.com",
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "snapchat.com", "www.snapchat.com", "snap.com", "www.snap.com",
  "facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch",
];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\p{L}\p{N}_.-]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function jsonStringDecode(value: string) {
  try { return JSON.parse(`"${value.replace(/"/g, '\\"')}"`); } catch { return value.replace(/\\u002F/g, "/").replace(/\\n/g, " ").replace(/\\"/g, '"'); }
}

function allowedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
    return allowed ? url : null;
  } catch { return null; }
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
  const identityHash = await sha256(`keyless-social|${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 24,
    p_window_seconds: 60,
  });
  if (error) return true; // Le fallback ne doit pas tomber si le diagnostic DB est momentanément indisponible.
  return Boolean(data);
}

async function fetchSocialPage(startUrl: URL): Promise<{ url: URL; html: string }> {
  let current = startUrl;
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
      const location = response.headers.get("location");
      if (!location) break;
      const next = allowedUrl(new URL(location, current).toString());
      if (!next) throw new Error("unsafe_redirect");
      current = next;
      continue;
    }
    const html = (await response.text()).slice(0, 1_800_000);
    return { url: current, html };
  }
  return { url: current, html: "" };
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlDecode(match[1]).trim();
  }
  return "";
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return jsonStringDecode(match[1]).trim();
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
  if (!title || !artist) return null;
  const generic = normalize(title);
  if (/^(original sound|son original|original audio|audio original|originalton)$/.test(generic)) return null;
  return { title, artist };
}

async function oEmbed(platform: string, url: string) {
  let endpoint = "";
  if (platform === "TIKTOK") endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  if (platform === "YOUTUBE") endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "KEEP/1.0" } });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch { return null; }
}

type CatalogTrack = {
  source: "apple" | "deezer";
  id: string;
  title: string;
  artist: string;
  album?: string;
  isrc?: string;
  artworkUrl?: string;
  previewUrl?: string;
  externalUrl?: string;
};

async function searchApple(query: string): Promise<CatalogTrack[]> {
  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=15&country=FR`, {
      signal: AbortSignal.timeout(6000), headers: { "User-Agent": "KEEP/1.0" },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    return (Array.isArray(payload?.results) ? payload.results : []).flatMap((row: any) => {
      if (!row?.trackName || !row?.artistName || !row?.trackId) return [];
      return [{
        source: "apple" as const,
        id: String(row.trackId),
        title: String(row.trackName),
        artist: String(row.artistName),
        album: row.collectionName ? String(row.collectionName) : undefined,
        artworkUrl: row.artworkUrl100 ? String(row.artworkUrl100).replace(/100x100bb/gi, "600x600bb") : undefined,
        previewUrl: row.previewUrl ? String(row.previewUrl) : undefined,
        externalUrl: row.trackViewUrl ? String(row.trackViewUrl) : undefined,
      }];
    });
  } catch { return []; }
}

async function searchDeezer(query: string): Promise<CatalogTrack[]> {
  try {
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`, {
      signal: AbortSignal.timeout(6000), headers: { "User-Agent": "KEEP/1.0" },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    return (Array.isArray(payload?.data) ? payload.data : []).flatMap((row: any) => {
      if (!row?.title || !row?.artist?.name || !row?.id) return [];
      return [{
        source: "deezer" as const,
        id: String(row.id),
        title: String(row.title),
        artist: String(row.artist.name),
        album: row.album?.title ? String(row.album.title) : undefined,
        artworkUrl: row.album?.cover_xl || row.album?.cover_big || undefined,
        previewUrl: row.preview || undefined,
        externalUrl: row.link || undefined,
      }];
    });
  } catch { return []; }
}

function tokens(value: string) {
  const ignored = new Set(["official", "video", "audio", "lyrics", "lyric", "music", "clip", "remix", "version", "feat", "ft", "the", "and"]);
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2 && !ignored.has(token));
}

function tokenCoverage(needle: string, haystack: string) {
  const wanted = tokens(needle);
  if (!wanted.length) return 0;
  const have = new Set(tokens(haystack));
  return wanted.filter((token) => have.has(token)).length / wanted.length;
}

function scoreTrack(track: CatalogTrack, evidence: string, explicit: { title: string; artist: string } | null) {
  const titleEvidence = tokenCoverage(track.title, evidence);
  const artistEvidence = tokenCoverage(track.artist, evidence);
  let score = titleEvidence * 0.52 + artistEvidence * 0.38;
  if (titleEvidence >= 0.8 && artistEvidence >= 0.7) score += 0.08;
  if (explicit) {
    const titleExact = normalize(track.title) === normalize(explicit.title);
    const artistExact = normalize(track.artist) === normalize(explicit.artist);
    const titleClose = tokenCoverage(explicit.title, track.title);
    const artistClose = tokenCoverage(explicit.artist, track.artist);
    score = Math.max(score, titleClose * 0.5 + artistClose * 0.42 + (titleExact ? 0.04 : 0) + (artistExact ? 0.04 : 0));
  }
  return Math.min(1, score);
}

function sameCatalogSong(a: CatalogTrack, b: CatalogTrack) {
  return tokenCoverage(a.title, b.title) >= 0.8 && tokenCoverage(a.artist, b.artist) >= 0.8;
}

async function resolve(req: Request) {
  const userId = await optionalUserId(req);
  if (!(await allowRequest(req, userId))) return json(429, { error: "keyless_rate_limited", recognition: null });
  const body = await req.json().catch(() => ({}));
  const inputUrl = allowedUrl(String(body?.url ?? ""));
  if (!inputUrl) return json(400, { error: "unsupported_social_url", recognition: null });
  const platform = String(body?.platform ?? "UNKNOWN").toUpperCase();
  const suppliedTitle = String(body?.title ?? "").slice(0, 500);
  const rawText = String(body?.rawText ?? "").slice(0, 1500);

  let page = { url: inputUrl, html: "" };
  try { page = await fetchSocialPage(inputUrl); } catch { /* oEmbed + supplied metadata can still work. */ }
  const embedded = await oEmbed(platform, page.url.toString());
  const ogTitle = metaContent(page.html, "og:title");
  const ogDescription = metaContent(page.html, "og:description") || metaContent(page.html, "description");
  const explicit = extractExplicitMusic(page.html);
  const evidence = [explicit?.title, explicit?.artist, embedded?.title, embedded?.author_name, ogTitle, ogDescription, suppliedTitle, rawText]
    .filter(Boolean).join(" ").slice(0, 5000);

  const queries = new Set<string>();
  if (explicit) queries.add(`${explicit.artist} ${explicit.title}`);
  if (embedded?.title) queries.add(String(embedded.title));
  if (ogTitle) queries.add(ogTitle);
  if (suppliedTitle) queries.add(suppliedTitle);
  const cleanedEvidence = evidence.replace(/[#@][^\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleanedEvidence) queries.add(cleanedEvidence.slice(0, 180));

  const candidates: CatalogTrack[] = [];
  for (const query of Array.from(queries).slice(0, 3)) {
    const [apple, deezer] = await Promise.all([searchApple(query), searchDeezer(query)]);
    candidates.push(...apple, ...deezer);
  }
  if (!candidates.length) return json(200, { ok: true, provider: "KEYLESS_SOCIAL", recognition: null, reason: "catalog_no_match" });

  const scored = candidates.map((track) => ({ track, score: scoreTrack(track, evidence, explicit) })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  let confidence = best.score;
  const corroborating = scored.find((item) => item.track.source !== best.track.source && sameCatalogSong(best.track, item.track));
  if (corroborating) confidence = Math.min(0.99, confidence + 0.12);
  if (explicit && confidence >= 0.62) confidence = Math.max(confidence, 0.86);

  // Sans empreinte audio nous refusons les correspondances faibles : mieux vaut
  // continuer à écouter qu'ajouter un faux morceau dans la session de l'utilisateur.
  if (confidence < 0.72) return json(200, { ok: true, provider: "KEYLESS_SOCIAL", recognition: null, confidence, reason: "confidence_too_low" });

  const providerIds: Record<string, string> = {};
  if (best.track.source === "apple") providerIds.appleMusic = best.track.id;
  if (best.track.source === "deezer") providerIds.deezer = best.track.id;
  if (corroborating?.track.source === "apple") providerIds.appleMusic = corroborating.track.id;
  if (corroborating?.track.source === "deezer") providerIds.deezer = corroborating.track.id;
  const externalUrls: Record<string, string> = { source: page.url.toString() };
  if (best.track.source === "apple" && best.track.externalUrl) externalUrls.appleMusic = best.track.externalUrl;
  if (best.track.source === "deezer" && best.track.externalUrl) externalUrls.deezer = best.track.externalUrl;
  if (corroborating?.track.source === "apple" && corroborating.track.externalUrl) externalUrls.appleMusic = corroborating.track.externalUrl;
  if (corroborating?.track.source === "deezer" && corroborating.track.externalUrl) externalUrls.deezer = corroborating.track.externalUrl;

  return json(200, {
    ok: true,
    provider: "KEYLESS_SOCIAL",
    resolvedUrl: page.url.toString(),
    recognition: {
      confidence,
      title: best.track.title,
      artist: best.track.artist,
      album: best.track.album,
      artworkUrl: best.track.artworkUrl || corroborating?.track.artworkUrl,
      previewUrl: best.track.previewUrl || corroborating?.track.previewUrl,
      availableOn: [providerIds.appleMusic ? "Apple Music" : null, providerIds.deezer ? "Deezer" : null].filter(Boolean),
      externalUrls,
      providerIds,
      recognitionProviderTrackId: `keyless-social:${best.track.source}:${best.track.id}`,
    },
    evidence: { platform, explicitMusicMetadata: Boolean(explicit), crossCatalogConfirmed: Boolean(corroborating) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try { return await resolve(req); }
  catch (error) {
    console.error("[keep-keyless-social]", error);
    return json(200, { ok: false, provider: "KEYLESS_SOCIAL", recognition: null, reason: "resolver_unavailable" });
  }
});
