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

async function setFallbackRuntimeStatus(status: string, lastError: string | null = null) {
  try {
    const now = new Date().toISOString();
    await admin.from("integration_runtime_status").upsert({
      key: "ACRCLOUD",
      status,
      last_checked_at: now,
      last_error: lastError ? lastError.slice(0, 500) : null,
      updated_at: now,
    }, { onConflict: "key" });
  } catch {
    // Le diagnostic ne doit jamais bloquer l'identification.
  }
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

async function paidRecognitionIdentity(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  return sha256(`paid-recognition|${userId ?? "guest"}|${device}|${ip}`);
}

async function allowFallback(identityHash: string) {
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 1,
    p_window_seconds: 20,
  });
  if (error) throw error;
  return Boolean(data);
}

function requestTimezone(req: Request) {
  const value = (req.headers.get("x-keep-timezone") ?? "Europe/Paris").trim();
  return value.slice(0, 80) || "Europe/Paris";
}

function allowFreeDebit(req: Request) {
  return req.headers.get("x-keep-use-free") === "1";
}

function economyBlocked(reason: string | null | undefined) {
  if (reason === "LISTEN_FREE_REQUIRED") return json(402, { error: "listen_free_required" });
  if (reason === "INSUFFICIENT_FREE") return json(402, { error: "listen_free_insufficient" });
  if (reason === "GUEST_LISTEN_LIMIT_REACHED") return json(402, { error: "guest_listen_limit_reached" });
  return json(503, { error: "listen_economy_unavailable" });
}

async function precheckListenEconomy(req: Request, userId: string | null, identityHash: string) {
  if (userId) {
    const { data, error } = await admin.rpc("service_listen_precheck", {
      p_profile_id: userId,
      p_timezone: requestTimezone(req),
      p_allow_free: allowFreeDebit(req),
    });
    if (error) throw error;
    return data as any;
  }
  const { data, error } = await admin.rpc("service_guest_listen_precheck", { p_identity_hash: identityHash });
  if (error) throw error;
  return data as any;
}

async function recordListenEconomy(req: Request, userId: string | null, identityHash: string, sourceKey: string) {
  if (userId) {
    const { data, error } = await admin.rpc("service_record_listen_success", {
      p_profile_id: userId,
      p_source_key: sourceKey,
      p_timezone: requestTimezone(req),
      p_allow_free: allowFreeDebit(req),
    });
    if (error) throw error;
    return data as any;
  }
  const { data, error } = await admin.rpc("service_record_guest_listen_success", {
    p_identity_hash: identityHash,
    p_source_key: sourceKey,
  });
  if (error) throw error;
  return data as any;
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

type CatalogEnrichment = {
  artworkUrl?: string;
  previewUrl?: string;
  appleTrackId?: string;
  appleTrackViewUrl?: string;
  primaryGenre?: string;
  releaseYear?: number;
  // Confirmation indépendante par un catalogue public. Un match ACRCloud
  // moyen n’est promu que si le même titre + artiste existe exactement.
  exactCatalogMatch: boolean;
};

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
  const exactItunes = rows.find((row: any) =>
    normalizeText(row?.trackName) === wantedTitle && normalizeText(row?.artistName) === wantedArtist
  );
  const best = exactItunes
    ?? rows.find((row: any) => normalizeText(row?.trackName).includes(wantedTitle) && normalizeText(row?.artistName).includes(wantedArtist))
    ?? rows[0];
  const exactDeezer = Boolean(
    deezerTrack
    && normalizeText(deezerTrack?.title) === wantedTitle
    && normalizeText(deezerTrack?.artist?.name) === wantedArtist
  );

  const deezerCover = deezerTrack?.album?.cover_xl || deezerTrack?.album?.cover_big || deezerTrack?.album?.cover_medium;
  return {
    artworkUrl: deezerCover ? String(deezerCover) : best?.artworkUrl100 ? upscaleAppleArtwork(String(best.artworkUrl100)) : undefined,
    previewUrl: deezerTrack?.preview ? String(deezerTrack.preview) : best?.previewUrl ? String(best.previewUrl) : undefined,
    appleTrackId: best?.trackId ? String(best.trackId) : undefined,
    appleTrackViewUrl: best?.trackViewUrl ? String(best.trackViewUrl) : undefined,
    primaryGenre: best?.primaryGenreName ? String(best.primaryGenreName) : undefined,
    releaseYear: /^\d{4}/.test(String(best?.releaseDate ?? '')) ? Number(String(best.releaseDate).slice(0, 4)) : undefined,
    exactCatalogMatch: Boolean(exactItunes || exactDeezer),
  };
}

// Capture ambiante (micro/onglet) sur un extrait court : ACRCloud peut
// répondre avec un score faible plutôt qu'un vrai no-match. Un score bas
// présenté comme certitude est la cause directe des mauvais artistes
// rapportés en test réel (30/08/2026) -- en dessous du seuil, KEEP traite
// ça comme une non-reconnaissance et laisse la cascade continuer (source
// sans clé) plutôt que d'afficher un résultat non fiable.
// Audit réel 04/10/2026 : des titres corrects payés par ACRCloud sont revenus
// avec des scores 22–49 sur capture ambiante iPhone. Le seuil fixe 55 jetait
// donc des réponses valides et déclenchait un autre appel payant. Politique :
// - 40+ : accepté comme résultat ACR normal ;
// - 22–39 : accepté uniquement si Apple/iTunes ou Deezer confirme EXACTEMENT
//   le même titre + artiste ;
// - 20–39 sans corroboration : candidat de consensus multi-fenêtres ;
// - <20 : rejet.
// Cette logique garde la qualité tout en évitant de payer deux fois pour un
// match déjà suffisamment étayé.
const MIN_ACR_SCORE = 40;
const MIN_REPEAT_CANDIDATE_SCORE = 20;
const MIN_CATALOG_CORROBORATED_SCORE = 22;

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

async function normalizeAcrMusicWithEvidence(music: any) {
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
    recognition: {
      confidence: Number.isFinite(score) ? Math.max(0, Math.min(1, score / 100)) : 1,
      title,
      artist: String(artist),
      album: music.album?.name ? String(music.album.name) : undefined,
      isrc: firstString(music.external_ids?.isrc),
      artworkUrl: enrichment.artworkUrl,
      previewUrl: enrichment.previewUrl,
      genres: enrichment.primaryGenre ? [enrichment.primaryGenre] : [],
      releaseYear: enrichment.releaseYear,
      availableOn,
      externalUrls,
      providerIds,
      recognitionProviderTrackId: music.acrid ? String(music.acrid) : undefined,
    },
    exactCatalogMatch: enrichment.exactCatalogMatch,
  };
}

async function normalizeAcrMusic(music: any) {
  const normalized = await normalizeAcrMusicWithEvidence(music);
  return normalized?.recognition ?? null;
}

async function identify(req: Request) {
  const userId = await optionalUserId(req);
  const identityHash = await paidRecognitionIdentity(req, userId);
  const economy = await precheckListenEconomy(req, userId, identityHash);
  if (!economy?.allowed) return economyBlocked(economy?.reason);
  // Le quota produit est contrôlé AVANT le rate-limit fournisseur : accepter
  // « Utiliser 1 FREE » ne doit pas être bloqué par une tentative refusée.
  if (!(await allowFallback(identityHash))) {
    return json(429, { error: "fallback_rate_limited", message: "Fallback musical temporairement limité. Réessaie dans quelques secondes." });
  }
  const listenSourceKey = `acr:${crypto.randomUUID()}`;

  const [accessKey, accessSecret, rawHost] = await Promise.all([
    getSecret("ACRCLOUD_ACCESS_KEY"),
    getSecret("ACRCLOUD_ACCESS_SECRET"),
    getSecret("ACRCLOUD_HOST"),
  ]);
  if (!accessKey || !accessSecret || !rawHost) {
    await setFallbackRuntimeStatus("NOT_CONFIGURED", "Configuration ACRCloud incomplète");
    return json(409, {
      error: "fallback_not_configured",
      message: "ACRCloud n'est pas encore configuré dans le Super Admin Loki Music.",
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
    const message = String(body?.status?.msg ?? `HTTP ${response.status}`).slice(0, 220);
    await setFallbackRuntimeStatus("ERROR", message);
    return json(502, { error: "acrcloud_http_error", status: response.status, message });
  }

  const statusCode = Number(body?.status?.code ?? -1);
  if (statusCode !== 0) {
    const statusMsg = String(body?.status?.msg ?? "");
    console.log("keep-music-fallback diag", JSON.stringify({ statusCode, statusMsg: statusMsg || null }));

    // 3003 = quota ACRCloud épuisé. C'était traité comme un simple no-match,
    // donc Loki rappelait ACRCloud encore et encore alors qu'aucun morceau ne
    // pouvait être reconnu. On signale maintenant explicitement l'indisponibilité
    // pour que le mobile passe à la mémoire Loki et cesse de marteler le quota.
    if (statusCode === 3003) {
      await setFallbackRuntimeStatus("EXHAUSTED", statusMsg || "requests limit exceeded");
      return json(200, {
        ok: true,
        provider: "ACRCloud",
        recognition: null,
        providerStatus: statusCode,
        providerUnavailable: "quota_exhausted",
        retryAfterSeconds: 21600,
      });
    }

    // Les autres statuts fournisseur (dont les vrais no-match) restent des
    // réponses non bloquantes : le moteur poursuit la cascade.
    await setFallbackRuntimeStatus("ACTIVE", null);
    return json(200, { ok: true, provider: "ACRCloud", recognition: null, providerStatus: statusCode });
  }

  await setFallbackRuntimeStatus("ACTIVE", null);

  const music = Array.isArray(body?.metadata?.music) ? body.metadata.music[0] : null;
  const rawScore = Number(music?.score ?? 100);
  console.log("keep-music-fallback diag", JSON.stringify({ statusCode, hasMusic: Boolean(music), rawScore, title: music?.title ?? null, artist: first(music?.artists)?.name ?? music?.artist ?? null, minAcrScore: MIN_ACR_SCORE }));
  if (music && Number.isFinite(rawScore) && rawScore < MIN_ACR_SCORE) {
    const normalized = rawScore >= MIN_REPEAT_CANDIDATE_SCORE ? await normalizeAcrMusicWithEvidence(music) : null;
    const candidateRecognition = normalized?.recognition ?? null;
    const catalogCorroborated = Boolean(
      candidateRecognition
      && normalized?.exactCatalogMatch
      && rawScore >= MIN_CATALOG_CORROBORATED_SCORE
    );
    if (catalogCorroborated) {
      console.log("keep-music-fallback corroborated", JSON.stringify({ rawScore, title: candidateRecognition.title, artist: candidateRecognition.artist }));
      const listenRecord = await recordListenEconomy(req, userId, identityHash, listenSourceKey);
      if (listenRecord?.recorded === false) return economyBlocked(listenRecord?.reason);
      (candidateRecognition as any).__listenEconomyRecorded = true;
      // Score acoustique faible mais catalogue exact : compté uniquement ici,
      // après la reconnaissance réellement acceptée.
      return json(200, {
        ok: true, provider: "ACRCloud", recognition: candidateRecognition, providerStatus: statusCode,
        lowConfidenceScore: rawScore, recognitionEvidence: "catalog_exact", listenEconomy: listenRecord,
      });
    }
    return json(200, {
      ok: true, provider: "ACRCloud", recognition: null, candidateRecognition, providerStatus: statusCode,
      lowConfidenceScore: rawScore,
      recognitionEvidence: normalized?.exactCatalogMatch ? "catalog_exact_below_threshold" : "repeat_required",
    });
  }
  const acrRecognition = await normalizeAcrMusic(music);
  if (acrRecognition) {
    const listenRecord = await recordListenEconomy(req, userId, identityHash, listenSourceKey);
    if (listenRecord?.recorded === false) return economyBlocked(listenRecord?.reason);
    (acrRecognition as any).__listenEconomyRecorded = true;
    seedInBackground(admin, acrRecognition as any);
    return json(200, { ok: true, provider: "ACRCloud", recognition: acrRecognition, listenEconomy: listenRecord });
  }
  return json(200, { ok: true, provider: "ACRCloud", recognition: null });
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
