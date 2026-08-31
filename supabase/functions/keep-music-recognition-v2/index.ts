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

type RuntimeStatus = "UNKNOWN" | "ACTIVE" | "EXHAUSTED" | "ERROR" | "NOT_CONFIGURED";
type CredentialSource = "VAULT" | "EDGE_SECRET";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function setRuntimeStatus(status: RuntimeStatus, lastError: string | null = null) {
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
    // Le diagnostic ne doit jamais bloquer l'écoute.
  }
}

function plausibleAuddToken(value: string | null | undefined): value is string {
  if (!value) return false;
  const clean = value.trim();
  if (clean.length < 16 || clean.length > 256 || /\s/.test(clean)) return false;
  if (/^(test|demo|null|none|todo|fake|key|token|1234)$/i.test(clean)) return false;
  return true;
}

async function vaultSecret(key: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (error) throw error;
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function resolveAuddCredential(): Promise<{ token: string; source: CredentialSource } | null> {
  // Important : un ancien placeholder saisi dans le Vault ne doit pas masquer
  // un vrai secret Edge déjà configuré sur le projet Supabase.
  const vault = await vaultSecret("AUDD_API_KEY");
  if (plausibleAuddToken(vault)) return { token: vault, source: "VAULT" };

  const edge = Deno.env.get("AUDD_API_KEY")?.trim() || null;
  if (plausibleAuddToken(edge)) return { token: edge, source: "EDGE_SECRET" };
  return null;
}

async function optionalUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allowRecognition(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  const identityHash = await sha256(`recognition-v2|${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 12,
    p_window_seconds: 60,
  });
  if (error) throw error;
  return Boolean(data);
}

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function upscaleArtwork(url: string) {
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600")
    .replace(/\{w\}/g, "600").replace(/\{h\}/g, "600");
}

async function freeCatalog(title: string, artist: string) {
  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8&country=FR`, {
      headers: { "User-Agent": "KEEP/1.0" },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    if (!rows.length) return null;
    const wantedTitle = normalizeText(title);
    const wantedArtist = normalizeText(artist);
    return rows.find((row: any) => normalizeText(row?.trackName) === wantedTitle && normalizeText(row?.artistName) === wantedArtist)
      ?? rows.find((row: any) => normalizeText(row?.trackName).includes(wantedTitle) && normalizeText(row?.artistName).includes(wantedArtist))
      ?? rows[0];
  } catch {
    return null;
  }
}

// AudD ne renvoie que Apple Music/Spotify (paramètre `return`). Deezer est
// cherché séparément (API publique, sans clé) pour que "où trouver ce
// morceau" soit complet quel que soit le moteur qui a reconnu l'audio.
async function freeDeezer(title: string, artist: string) {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(`https://api.deezer.com/search?q=${query}&limit=8`);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (!rows.length) return null;
    const wantedTitle = normalizeText(title);
    const wantedArtist = normalizeText(artist);
    return rows.find((row: any) => normalizeText(row?.title) === wantedTitle && normalizeText(row?.artist?.name) === wantedArtist)
      ?? rows.find((row: any) => normalizeText(row?.title).includes(wantedTitle) && normalizeText(row?.artist?.name).includes(wantedArtist))
      ?? rows[0];
  } catch {
    return null;
  }
}

async function normalizeResult(result: any) {
  if (!result?.title || !result?.artist) return null;
  const apple = result.apple_music ?? null;
  const spotify = result.spotify ?? null;
  const [catalog, deezer] = await Promise.all([
    freeCatalog(String(result.title), String(result.artist)),
    freeDeezer(String(result.title), String(result.artist)),
  ]);
  const appleId = apple?.playParams?.id ?? apple?.id ?? catalog?.trackId ?? undefined;
  const spotifyId = spotify?.id ?? undefined;
  const deezerId = deezer?.id ?? undefined;
  const artwork = apple?.artwork?.url || spotify?.album?.images?.[0]?.url || catalog?.artworkUrl100
    || deezer?.album?.cover_xl || deezer?.album?.cover_big || undefined;
  const providerIds: Record<string, string> = {};
  if (appleId) providerIds.appleMusic = String(appleId);
  if (spotifyId) providerIds.spotify = String(spotifyId);
  if (deezerId) providerIds.deezer = String(deezerId);
  const externalUrls: Record<string, string> = {};
  if (spotifyId) externalUrls.spotify = `https://open.spotify.com/track/${encodeURIComponent(String(spotifyId))}`;
  if (catalog?.trackViewUrl) externalUrls.appleMusic = String(catalog.trackViewUrl);
  if (deezer?.link) externalUrls.deezer = String(deezer.link);
  if (result.song_link) externalUrls.universal = String(result.song_link);
  externalUrls.youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${result.artist} ${result.title}`)}`;

  return {
    confidence: 1,
    title: String(result.title),
    artist: String(result.artist),
    album: result.album ? String(result.album) : catalog?.collectionName ? String(catalog.collectionName) : deezer?.album?.title ? String(deezer.album.title) : undefined,
    isrc: result.isrc ? String(result.isrc) : apple?.isrc ? String(apple.isrc) : spotify?.external_ids?.isrc ? String(spotify.external_ids.isrc) : undefined,
    artworkUrl: artwork ? upscaleArtwork(String(artwork)) : undefined,
    previewUrl: catalog?.previewUrl ? String(catalog.previewUrl) : deezer?.preview ? String(deezer.preview) : undefined,
    availableOn: [spotifyId ? "Spotify" : null, (appleId || catalog?.trackViewUrl) ? "Apple Music" : null, deezerId ? "Deezer" : null].filter(Boolean),
    externalUrls,
    providerIds,
    recognitionProviderTrackId: result.song_link ? String(result.song_link) : undefined,
  };
}

function isAuthorizationFailure(message: string) {
  return /authorization|authorisation|api[_ -]?token|invalid\s+(?:api\s*)?(?:key|token)|unauthori[sz]ed|forbidden/i.test(message);
}

function isQuotaFailure(message: string, status: number) {
  return status === 402 || /quota|credit|balance|limit\s+(?:reached|exceeded)|requests?\s+left|payment|subscription|exhaust/i.test(message);
}

async function recognize(req: Request) {
  const userId = await optionalUserId(req);
  if (!(await allowRecognition(req, userId))) {
    return json(429, { error: "recognition_rate_limited", message: "KEEP écoute toujours. Nouvelle analyse dans quelques secondes." });
  }

  const credential = await resolveAuddCredential();
  if (!credential) {
    await setRuntimeStatus("NOT_CONFIGURED", "Clé AudD absente ou invalide dans Vault/Edge Secret");
    return json(409, {
      error: "recognition_not_configured",
      message: "Reconnaissance musicale indisponible : remplace la clé AudD dans le Super Admin KEEP.",
    });
  }

  const input = await req.formData().catch(() => null);
  const audio = input?.get("audio");
  if (!(audio instanceof File)) return json(400, { error: "audio_required" });
  if (audio.size < 1000) return json(400, { error: "audio_too_small" });
  if (audio.size > 6 * 1024 * 1024) return json(413, { error: "audio_too_large" });
  console.log("keep-music-recognition-v2 diag", JSON.stringify({ audioSizeBytes: audio.size, audioType: audio.type, platform: req.headers.get("x-keep-platform") }));

  const form = new FormData();
  form.append("api_token", credential.token);
  form.append("file", audio, audio.name || "keep-sample.m4a");
  form.append("return", "apple_music,spotify");

  let response: Response;
  try {
    response = await fetch("https://api.audd.io/", { method: "POST", body: form });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await setRuntimeStatus("ERROR", detail);
    return json(503, { error: "recognition_network_error", message: "KEEP n’arrive pas à joindre le moteur musical. L’écoute reste active." });
  }

  const payload = await response.json().catch(() => null);
  const providerMessage = String(payload?.error?.error_message || payload?.error?.message || payload?.message || `AudD HTTP ${response.status}`);
  // Diagnostic du 30/08/2026 (Adel : "ça ne détecte jamais rien" sur
  // ordinateur/iPhone/Samsung) : confirmé en direct sur de vraies tentatives
  // -- audio réel envoyé (400-700 Ko de WAV), AudD répond systématiquement
  // avec succès, et un vrai match a bien été trouvé au moins une fois pendant
  // la session de test. La majorité des "aucun résultat" viennent
  // d'AudD lui-même (empreinte non reconnue), pas d'un bug du pipeline --
  // limite réelle de la capture ambiante par micro, pas un problème de code.
  // Réactivé brièvement pour confirmer que ça tient toujours sur le nouveau
  // round de tests du 30/08/2026 (ordinateur + téléphone).
  console.log("keep-music-recognition-v2 diag", JSON.stringify({ ok: response.ok, status: payload?.status, hasResult: Boolean(payload?.result) }));

  if (!response.ok || payload?.status === "error") {
    if (isQuotaFailure(providerMessage, response.status)) {
      await setRuntimeStatus("EXHAUSTED", providerMessage);
      return json(402, { error: "recognition_quota_exhausted", message: "Quota de reconnaissance AudD épuisé. Active ACRCloud ou recharge AudD dans le Super Admin." });
    }
    if (isAuthorizationFailure(providerMessage)) {
      await setRuntimeStatus("NOT_CONFIGURED", providerMessage);
      return json(409, { error: "recognition_not_configured", message: "La clé AudD enregistrée n’est pas valide. Remplace-la dans le Super Admin KEEP." });
    }
    await setRuntimeStatus("ERROR", providerMessage);
    return json(502, { error: "recognition_provider_error", message: "Le moteur de reconnaissance a rencontré une erreur. KEEP va réessayer automatiquement." });
  }

  await setRuntimeStatus("ACTIVE");
  const recognition = await normalizeResult(payload?.result);
  if (recognition) seedInBackground(admin, recognition as any);
  return json(200, { ok: true, provider: "AudD", credentialSource: credential.source, recognition });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("health") !== "1") return json(405, { error: "method_not_allowed" });
      const credential = await resolveAuddCredential();
      if (!credential) await setRuntimeStatus("NOT_CONFIGURED", "Clé AudD absente ou invalide dans Vault/Edge Secret");
      return json(credential ? 200 : 503, {
        ok: Boolean(credential),
        service: "keep-music-recognition-v2",
        recognitionProvider: "AudD",
        credentialValid: Boolean(credential),
        credentialSource: credential?.source ?? null,
        secretExposed: false,
      });
    }
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    return await recognize(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setRuntimeStatus("ERROR", message);
    return json(500, { error: "recognition_gateway_error", message: "Reconnaissance temporairement indisponible. KEEP va réessayer automatiquement." });
  }
});
