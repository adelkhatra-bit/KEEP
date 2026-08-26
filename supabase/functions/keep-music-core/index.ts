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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type RuntimeStatus = "UNKNOWN" | "ACTIVE" | "EXHAUSTED" | "ERROR" | "NOT_CONFIGURED";
type KeepVisibility = "PUBLIC" | "PRIVATE";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function setRecognitionStatus(status: RuntimeStatus, lastError: string | null = null) {
  try {
    const now = new Date().toISOString();
    await admin.from("integration_runtime_status").upsert({
      key: "AUDD_API_KEY",
      status,
      last_checked_at: now,
      last_error: lastError ? lastError.slice(0, 500) : null,
      updated_at: now,
    }, { onConflict: "key" });
  } catch {
    // Le statut Super Admin ne doit jamais bloquer une reconnaissance utilisateur.
  }
}

function classifyProviderIssue(message: string, httpStatus?: number): RuntimeStatus {
  if (httpStatus === 402) return "EXHAUSTED";
  if (/quota|credit|balance|request(?:s)?\s+(?:left|limit)|limit\s+(?:reached|exceeded)|not enough|payment|subscription|exhaust/i.test(message)) {
    return "EXHAUSTED";
  }
  return "ERROR";
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  if (typeof data === "string" && data.trim()) return data.trim();

  const legacyEdgeSecret = Deno.env.get(key);
  return typeof legacyEdgeSecret === "string" && legacyEdgeSecret.trim()
    ? legacyEdgeSecret.trim()
    : null;
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

async function allowRecognition(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
  const identityHash = await sha256(`${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 12,
    p_window_seconds: 60,
  });
  if (error) throw error;
  return Boolean(data);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function upscaleArtwork(url: string): string {
  return url
    .replace(/100x100bb/gi, "600x600bb")
    .replace(/100x100/gi, "600x600")
    .replace(/\{w\}/g, "600")
    .replace(/\{h\}/g, "600");
}

/**
 * Fallback gratuit de métadonnées uniquement : lorsqu'AudD reconnaît bien le
 * morceau mais ne renvoie aucune pochette Spotify/Apple, on interroge le
 * catalogue public Apple Search afin de ne pas afficher un carré vide dans
 * KEEP. Aucun flux audio n'est téléchargé ni stocké.
 */
async function findFreeArtwork(title: string, artist: string): Promise<string | null> {
  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8&country=FR`, {
      headers: { "User-Agent": "KEEP/1.0" },
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const results = Array.isArray(body?.results) ? body.results : [];
    if (!results.length) return null;

    const wantedTitle = normalizeText(title);
    const wantedArtist = normalizeText(artist);
    const best = results.find((item: any) => {
      const candidateTitle = normalizeText(item?.trackName);
      const candidateArtist = normalizeText(item?.artistName);
      return candidateTitle === wantedTitle && candidateArtist === wantedArtist;
    }) ?? results.find((item: any) => {
      const candidateTitle = normalizeText(item?.trackName);
      const candidateArtist = normalizeText(item?.artistName);
      return candidateTitle.includes(wantedTitle) && candidateArtist.includes(wantedArtist);
    }) ?? results[0];

    const artwork = String(best?.artworkUrl100 || best?.artworkUrl60 || "").trim();
    return artwork ? upscaleArtwork(artwork) : null;
  } catch {
    return null;
  }
}

async function normalizeAuddResult(result: any) {
  if (!result || !result.title || !result.artist) return null;
  const apple = result.apple_music ?? result.appleMusic ?? null;
  const spotify = result.spotify ?? null;
  let artworkUrl =
    apple?.artwork?.url?.replace?.("{w}", "600")?.replace?.("{h}", "600") ||
    spotify?.album?.images?.[0]?.url ||
    null;

  if (!artworkUrl) artworkUrl = await findFreeArtwork(String(result.title), String(result.artist));

  return {
    confidence: 1,
    title: String(result.title),
    artist: String(result.artist),
    album: result.album ? String(result.album) : undefined,
    isrc: result.isrc ? String(result.isrc) : undefined,
    artworkUrl: artworkUrl ? upscaleArtwork(String(artworkUrl)) : undefined,
    recognitionProviderTrackId: result.song_link ? String(result.song_link) : undefined,
  };
}

async function recognize(req: Request) {
  const userId = await optionalUserId(req);
  if (!(await allowRecognition(req, userId))) {
    return json(429, {
      error: "recognition_rate_limited",
      message: "Trop de tentatives ont été lancées. Attends environ 60 secondes puis réessaie.",
    });
  }

  const apiKey = await getSecret("AUDD_API_KEY");
  if (!apiKey) {
    await setRecognitionStatus("NOT_CONFIGURED", "Aucune clé AudD active");
    return json(409, {
      error: "recognition_not_configured",
      message: "La reconnaissance musicale KEEP n’est pas encore branchée dans le Super Admin.",
    });
  }

  const input = await req.formData().catch(() => null);
  const audio = input?.get("audio");
  if (!(audio instanceof File)) return json(400, { error: "audio_required" });
  if (audio.size < 1000) return json(400, { error: "audio_too_small" });
  if (audio.size > 6 * 1024 * 1024) return json(413, { error: "audio_too_large" });

  const form = new FormData();
  form.append("api_token", apiKey);
  form.append("file", audio, audio.name || "keep-sample.wav");
  form.append("return", "apple_music,spotify");

  const response = await fetch("https://api.audd.io/", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  const providerMessage = String(body?.error?.error_message || body?.error?.message || body?.message || `AudD HTTP ${response.status}`);

  if (!response.ok) {
    const status = classifyProviderIssue(providerMessage, response.status);
    await setRecognitionStatus(status, providerMessage);
    return json(status === "EXHAUSTED" ? 402 : 502, {
      error: status === "EXHAUSTED" ? "recognition_quota_exhausted" : "recognition_provider_http_error",
      status: response.status,
      message: providerMessage.slice(0, 260),
    });
  }
  if (body?.status === "error") {
    const status = classifyProviderIssue(providerMessage);
    await setRecognitionStatus(status, providerMessage);
    return json(status === "EXHAUSTED" ? 402 : 502, {
      error: status === "EXHAUSTED" ? "recognition_quota_exhausted" : "recognition_provider_error",
      message: providerMessage.slice(0, 260),
    });
  }

  await setRecognitionStatus("ACTIVE");
  const recognition = await normalizeAuddResult(body?.result);
  return json(200, { ok: true, recognition });
}

type TrackInput = {
  id?: string;
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
  artworkUrl?: string;
  genres?: string[];
  providerIds?: Record<string, string | undefined>;
};

async function refreshTrackMetadata(existing: any, track: TrackInput, isrc: string): Promise<string> {
  const patch: Record<string, unknown> = {};
  if (!existing.isrc && isrc) patch.isrc = isrc;
  if (!existing.album && track.album) patch.album = track.album;
  if (!existing.artwork_url && track.artworkUrl) patch.artwork_url = track.artworkUrl;
  const incomingProviderIds = track.providerIds && typeof track.providerIds === "object" ? track.providerIds : {};
  if (Object.keys(incomingProviderIds).length) patch.provider_ids = { ...(existing.provider_ids ?? {}), ...incomingProviderIds };
  if (Object.keys(patch).length) await admin.from("tracks").update(patch).eq("id", existing.id);
  return String(existing.id);
}

async function findOrCreateTrack(track: TrackInput): Promise<string> {
  const title = String(track.title ?? "").trim();
  const artist = String(track.artist ?? "").trim();
  const isrc = String(track.isrc ?? "").trim().toUpperCase();
  if (!title || !artist) throw new Error("invalid_track");

  if (isrc) {
    const { data } = await admin.from("tracks").select("id,isrc,album,artwork_url,provider_ids").eq("isrc", isrc).maybeSingle();
    if (data?.id) return refreshTrackMetadata(data, track, isrc);
  }

  const { data: matches, error: matchError } = await admin
    .from("tracks")
    .select("id,isrc,album,artwork_url,provider_ids")
    .ilike("title", title)
    .ilike("artist", artist)
    .limit(1);
  if (matchError) throw matchError;
  if (matches?.[0]?.id) return refreshTrackMetadata(matches[0], track, isrc);

  const { data, error } = await admin.from("tracks").insert({
    isrc: isrc || null,
    title,
    artist,
    album: track.album || null,
    duration_sec: Number.isFinite(track.durationSec) ? Math.round(Number(track.durationSec)) : null,
    artwork_url: track.artworkUrl || null,
    genres: Array.isArray(track.genres) ? track.genres.slice(0, 20) : [],
    provider_ids: track.providerIds && typeof track.providerIds === "object" ? track.providerIds : {},
  }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function recordDecision(req: Request) {
  const userId = await optionalUserId(req);
  if (!userId) return json(401, { error: "account_required" });

  const body = await req.json().catch(() => ({}));
  const decision = String(body?.decision ?? "").toUpperCase();
  if (decision !== "KEPT" && decision !== "PASSED") return json(400, { error: "invalid_decision" });
  const visibility: KeepVisibility = String(body?.visibility ?? "PRIVATE").toUpperCase() === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  const trackId = await findOrCreateTrack((body?.track ?? {}) as TrackInput);

  const context = body?.context && typeof body.context === "object" ? body.context : {};
  const { data, error } = await admin.from("keep_decisions").insert({
    profile_id: userId,
    track_id: trackId,
    decision,
    visibility,
    recommended_playlist_id: null,
    chosen_playlist_id: null,
    was_correction: false,
    context,
  }).select("id,created_at,visibility").single();
  if (error) throw error;
  return json(200, { ok: true, trackId, decisionId: data.id, createdAt: data.created_at, visibility: data.visibility });
}

async function updateDecisionVisibility(req: Request, body: any) {
  const userId = await optionalUserId(req);
  if (!userId) return json(401, { error: "account_required" });
  const decisionId = String(body?.decisionId ?? "").trim();
  const visibility: KeepVisibility = String(body?.visibility ?? "PRIVATE").toUpperCase() === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  if (!/^[0-9a-f-]{36}$/i.test(decisionId)) return json(400, { error: "invalid_decision_id" });

  const { data, error } = await admin
    .from("keep_decisions")
    .update({ visibility })
    .eq("id", decisionId)
    .eq("profile_id", userId)
    .eq("decision", "KEPT")
    .select("id,visibility")
    .maybeSingle();
  if (error) throw error;
  if (!data) return json(404, { error: "decision_not_found" });
  return json(200, { ok: true, decisionId: data.id, visibility: data.visibility });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("health") !== "1") return json(405, { error: "method_not_allowed" });
      const recognitionConfigured = Boolean(await getSecret("AUDD_API_KEY"));
      if (!recognitionConfigured) await setRecognitionStatus("NOT_CONFIGURED", "Aucune clé AudD active");
      const { data: runtime } = await admin.from("integration_runtime_status").select("status,last_checked_at,last_error").eq("key", "AUDD_API_KEY").maybeSingle();
      return json(recognitionConfigured ? 200 : 503, {
        ok: recognitionConfigured && runtime?.status !== "EXHAUSTED" && runtime?.status !== "ERROR",
        service: "keep-music-core",
        recognitionProvider: "AudD",
        recognitionConfigured,
        providerStatus: runtime?.status ?? (recognitionConfigured ? "UNKNOWN" : "NOT_CONFIGURED"),
        lastCheckedAt: runtime?.last_checked_at ?? null,
        lastError: runtime?.last_error ?? null,
        secretExposed: false,
      });
    }

    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) return await recognize(req);

    const cloned = req.clone();
    const body = await cloned.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "decision") return await recordDecision(req);
    if (action === "decision.visibility") return await updateDecisionVisibility(req, body);
    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: "music_core_error", message: message.slice(0, 300) });
  }
});