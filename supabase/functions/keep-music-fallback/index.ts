import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { seedInBackground } from "../_shared/fingerprintSeed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id, x-keep-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  if (typeof data === "string" && data.trim()) return data.trim();
  const legacy = Deno.env.get(key);
  return typeof legacy === "string" && legacy.trim() ? legacy.trim() : null;
}

async function optionalUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allowFallback(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  // Préfixe dédié : le fallback ne consomme pas la fenêtre AudD lorsqu'il est
  // appelé après un no-match. Il conserve néanmoins une protection de coût.
  const identityHash = await sha256(`acrcloud|${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 12,
    p_window_seconds: 60,
  });
  if (error) throw error;
  return Boolean(data);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item.trim());
    return found ? String(found).trim() : undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function upscaleAppleArtwork(url: string) {
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}

async function fetchJsonSafe(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), ...init });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch { return null; }
}

type CatalogEnrichment = { artworkUrl?: string; previewUrl?: string; appleTrackId?: string; appleTrackViewUrl?: string };

// ACRCloud identifie l'empreinte audio mais ne renvoie ni jaquette, ni extrait
// écoutable, ni lien Apple Music (juste des identifiants Spotify/Deezer/
// YouTube). Deux sources gratuites, sans compte, comblent ça, en parallèle :
// un lookup exact Deezer quand son ID est présent (jaquette + extrait 30s),
// et une recherche iTunes par titre+artiste (même technique déjà éprouvée
// côté AudD) pour le lien Apple Music et un extrait de secours. L'extrait
// joue dans KEEP -- ouvrir la plateforme externe reste une action séparée,
// volontaire, jamais forcée juste parce qu'aucun aperçu n'était disponible.
async function resolveCatalogEnrichment(title: string, artist: string, deezerTrackId?: string): Promise<CatalogEnrichment> {
  const [deezerTrack, itunesPayload] = await Promise.all([
    deezerTrackId ? fetchJsonSafe(`https://api.deezer.com/track/${encodeURIComponent(deezerTrackId)}`) : Promise.resolve(null),
    fetchJsonSafe(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=8&country=FR`,
      { headers: { "User-Agent": "KEEP/1.0" } },
    ),
  ]);

  const rows = Array.isArray(itunesPayload?.results) ? itunesPayload.results : [];
  const wantedTitle = normalizeText(title);
  const wantedArtist = normalizeText(artist);
  const best = rows.find((row: any) => normalizeText(row?.trackName) === wantedTitle && normalizeText(row?.artistName) === wantedArtist)
    ?? rows.find((row: any) => normalizeText(row?.trackName).includes(wantedTitle) && normalizeText(row?.artistName).includes(wantedArtist))
    ?? rows[0];

  const deezerCover = deezerTrack?.album?.cover_xl || deezerTrack?.album?.cover_big || deezerTrack?.album?.cover_medium;
  return {
    artworkUrl: deezerCover ? String(deezerCover) : best?.artworkUrl100 ? upscaleAppleArtwork(String(best.artworkUrl100)) : undefined,
    previewUrl: deezerTrack?.preview ? String(deezerTrack.preview) : best?.previewUrl ? String(best.previewUrl) : undefined,
    appleTrackId: best?.trackId ? String(best.trackId) : undefined,
    appleTrackViewUrl: best?.trackViewUrl ? String(best.trackViewUrl) : undefined,
  };
}

// Capture ambiante (micro/onglet) sur un extrait court : ACRCloud peut
// répondre avec un score faible plutôt qu'un vrai no-match. Un score bas
// présenté comme certitude est la cause directe des mauvais artistes
// rapportés en test réel (30/08/2026) -- en dessous du seuil, KEEP traite
// ça comme une non-reconnaissance et laisse la cascade continuer (source
// sans clé) plutôt que d'afficher un résultat non fiable.
const MIN_ACR_SCORE = 65;

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(signed);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function normalizeHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

async function normalizeAcrMusic(music: any) {
  if (!music?.title) return null;
  const artist = first(music.artists)?.name ?? music.artist ?? "";
  if (!String(artist).trim()) return null;

  const external = music.external_metadata ?? {};
  const spotify = first(external.spotify);
  const youtube = first(external.youtube);
  const deezer = first(external.deezer);
  const spotifyId = spotify?.track?.id ? String(spotify.track.id) : undefined;
  const youtubeId = youtube?.vid ? String(youtube.vid) : youtube?.track?.id ? String(youtube.track.id) : undefined;
  const deezerId = deezer?.track?.id ? String(deezer.track.id) : undefined;

  const score = Number(music.score ?? 100);
  const title = String(music.title);
  const enrichment = await resolveCatalogEnrichment(title, String(artist), deezerId);
  const appleId = enrichment.appleTrackId;

  const providerIds: Record<string, string> = {};
  if (spotifyId) providerIds.spotify = spotifyId;
  if (youtubeId) providerIds.youtubeMusic = youtubeId;
  if (deezerId) providerIds.deezer = deezerId;
  if (appleId) providerIds.appleMusic = appleId;

  const availableOn: string[] = [];
  const externalUrls: Record<string, string> = {};
  if (spotifyId) {
    availableOn.push("Spotify");
    externalUrls.spotify = `https://open.spotify.com/track/${encodeURIComponent(spotifyId)}`;
  }
  if (youtubeId) {
    availableOn.push("YouTube Music");
    externalUrls.youtubeMusic = `https://music.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
  }
  if (deezerId) {
    availableOn.push("Deezer");
    externalUrls.deezer = `https://www.deezer.com/track/${encodeURIComponent(deezerId)}`;
  }
  if (enrichment.appleTrackViewUrl) {
    availableOn.push("Apple Music");
    externalUrls.appleMusic = enrichment.appleTrackViewUrl;
  }
  externalUrls.youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${music.title}`)}`;

  return {
    confidence: Number.isFinite(score) ? Math.max(0, Math.min(1, score / 100)) : 1,
    title,
    artist: String(artist),
    album: music.album?.name ? String(music.album.name) : undefined,
    isrc: firstString(music.external_ids?.isrc),
    artworkUrl: enrichment.artworkUrl,
    previewUrl: enrichment.previewUrl,
    availableOn,
    externalUrls,
    providerIds,
    recognitionProviderTrackId: music.acrid ? String(music.acrid) : undefined,
  };
}

async function identify(req: Request) {
  const userId = await optionalUserId(req);
  if (!(await allowFallback(req, userId))) {
    return json(429, { error: "fallback_rate_limited", message: "Fallback musical temporairement limité. Réessaie dans quelques secondes." });
  }

  const [accessKey, accessSecret, rawHost] = await Promise.all([
    getSecret("ACRCLOUD_ACCESS_KEY"),
    getSecret("ACRCLOUD_ACCESS_SECRET"),
    getSecret("ACRCLOUD_HOST"),
  ]);
  if (!accessKey || !accessSecret || !rawHost) {
    return json(409, {
      error: "fallback_not_configured",
      message: "ACRCloud n'est pas encore configuré dans le Super Admin KEEP.",
    });
  }

  const input = await req.formData().catch(() => null);
  const audio = input?.get("audio");
  if (!(audio instanceof File)) return json(400, { error: "audio_required" });
  if (audio.size < 1000) return json(400, { error: "audio_too_small" });
  if (audio.size > 5 * 1024 * 1024) return json(413, { error: "audio_too_large" });

  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join("\n");
  const signature = await hmacSha1Base64(accessSecret, stringToSign);

  const form = new FormData();
  form.append("sample", audio, audio.name || "keep-sample.m4a");
  form.append("access_key", accessKey);
  form.append("sample_bytes", String(audio.size));
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);

  const host = normalizeHost(rawHost);
  const response = await fetch(`https://${host}${httpUri}`, { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return json(502, { error: "acrcloud_http_error", status: response.status, message: String(body?.status?.msg ?? `HTTP ${response.status}`).slice(0, 220) });
  }

  const statusCode = Number(body?.status?.code ?? -1);
  if (statusCode !== 0) {
    // ACRCloud renvoie aussi un statut JSON pour un simple no-match. KEEP le
    // traite comme une absence de reconnaissance et non comme une page d'erreur.
    console.log("keep-music-fallback diag", JSON.stringify({ statusCode, statusMsg: body?.status?.msg ?? null }));
    return json(200, { ok: true, provider: "ACRCloud", recognition: null, providerStatus: statusCode });
  }

  const music = Array.isArray(body?.metadata?.music) ? body.metadata.music[0] : null;
  const rawScore = Number(music?.score ?? 100);
  console.log("keep-music-fallback diag", JSON.stringify({ statusCode, hasMusic: Boolean(music), rawScore, title: music?.title ?? null, artist: first(music?.artists)?.name ?? music?.artist ?? null, minAcrScore: MIN_ACR_SCORE }));
  if (music && Number.isFinite(rawScore) && rawScore < MIN_ACR_SCORE) {
    return json(200, { ok: true, provider: "ACRCloud", recognition: null, providerStatus: statusCode, lowConfidenceScore: rawScore });
  }
  const acrRecognition = await normalizeAcrMusic(music);
  if (acrRecognition) seedInBackground(admin, acrRecognition as any);
  return json(200, { ok: true, provider: "ACRCloud", recognition: acrRecognition });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("health") !== "1") return json(405, { error: "method_not_allowed" });
      const [accessKey, accessSecret, host] = await Promise.all([
        getSecret("ACRCLOUD_ACCESS_KEY"),
        getSecret("ACRCLOUD_ACCESS_SECRET"),
        getSecret("ACRCLOUD_HOST"),
      ]);
      const configured = Boolean(accessKey && accessSecret && host);
      return json(configured ? 200 : 503, {
        ok: configured,
        service: "keep-music-fallback",
        recognitionProvider: "ACRCloud",
        configured,
        secretExposed: false,
      });
    }
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    return await identify(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: "fallback_error", message: message.slice(0, 300) });
  }
});
