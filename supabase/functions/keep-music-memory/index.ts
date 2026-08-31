import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeFingerprint, decodeWavPcm16 } from "../_shared/audioFingerprint.ts";

// Dernier maillon de la cascade de reconnaissance KEEP : la mémoire
// collective construite localement (voir keep-music-keyless-source pour
// l'ensemencement). N'est interrogée qu'après un échec d'AudD ET d'ACRCloud
// -- couvre le contenu indépendant/underground absent des catalogues
// commerciaux, à condition qu'un utilisateur l'ait déjà fait identifier une
// première fois (recherche manuelle ou partage).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id, x-keep-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
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

async function allowLookup(req: Request, userId: string | null) {
  const device = (req.headers.get("x-keep-device-id") ?? "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80);
  const identityHash = await sha256(`keep-memory|${userId ?? "guest"}|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", { p_identity_hash: identityHash, p_limit: 12, p_window_seconds: 60 });
  if (error) return true;
  return Boolean(data);
}

// Score minimum de votes sur le même décalage temporel pour accepter un
// match. Calibré sur le test empirique de l'algorithme (vrai match ~97% des
// hashs consistants, faux match ~11%) -- 15 votes reste très en dessous du
// pire vrai match observé tout en filtrant largement le bruit de fond.
const MIN_VOTE_MATCH = 15;

async function identify(req: Request) {
  const userId = await optionalUserId(req);
  if (!(await allowLookup(req, userId))) {
    return json(429, { error: "memory_rate_limited", message: "Mémoire KEEP temporairement limitée. Réessaie dans quelques secondes." });
  }

  const input = await req.formData().catch(() => null);
  const audio = input?.get("audio");
  if (!(audio instanceof File)) return json(400, { error: "audio_required" });
  if (audio.size < 1000) return json(400, { error: "audio_too_small" });
  if (audio.size > 6 * 1024 * 1024) return json(413, { error: "audio_too_large" });

  let hashes;
  try {
    const buffer = await audio.arrayBuffer();
    const { samples, sampleRate } = decodeWavPcm16(buffer);
    hashes = computeFingerprint(samples, sampleRate);
  } catch (error) {
    return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "decode_failed", detail: error instanceof Error ? error.message : String(error) });
  }
  if (hashes.length < 20) return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "signal_too_short" });

  // Un seul aller-retour DB via RPC (POST + corps JSON) plutôt qu'un filtre
  // .in() classique : avec plusieurs milliers de valeurs de hash, .in()
  // construit une URL GET de dizaines de milliers de caractères qui échoue
  // silencieusement ("TypeError: error sending request", confirmé en
  // production le 31/08/2026) -- le corps de requête RPC n'a pas cette
  // limite.
  const hashValues = Array.from(new Set(hashes.map((h) => h.hash)));
  const { data: rows, error: lookupError } = await admin
    .rpc("service_lookup_fingerprint_hashes", { p_hashes: hashValues });
  if (lookupError) {
    console.error("[keep-music-memory] lookup query failed", JSON.stringify(lookupError));
    return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "no_candidates" });
  }
  if (!rows?.length) return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "no_candidates" });

  const dbOffsetsByHash = new Map<number, { trackId: string; offset: number }[]>();
  for (const row of rows) {
    const arr = dbOffsetsByHash.get(row.hash);
    const entry = { trackId: row.track_id as string, offset: row.time_offset_ms as number };
    if (arr) arr.push(entry); else dbOffsetsByHash.set(row.hash, [entry]);
  }

  const votesByTrack = new Map<string, Map<number, number>>();
  for (const h of hashes) {
    const candidates = dbOffsetsByHash.get(h.hash);
    if (!candidates) continue;
    for (const c of candidates) {
      const delta = Math.round((c.offset - h.timeOffsetMs) / 50) * 50;
      const perTrack = votesByTrack.get(c.trackId) ?? new Map<number, number>();
      perTrack.set(delta, (perTrack.get(delta) ?? 0) + 1);
      votesByTrack.set(c.trackId, perTrack);
    }
  }

  let bestTrackId: string | null = null;
  let bestVotes = 0;
  for (const [trackId, offsets] of votesByTrack) {
    for (const votes of offsets.values()) {
      if (votes > bestVotes) { bestVotes = votes; bestTrackId = trackId; }
    }
  }

  if (!bestTrackId || bestVotes < MIN_VOTE_MATCH) {
    return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "no_confident_match", bestVotes });
  }

  const { data: track } = await admin.from("keep_fingerprint_tracks").select("*").eq("id", bestTrackId).maybeSingle();
  if (!track) return json(200, { ok: true, provider: "KEEP_MEMORY", recognition: null, reason: "track_missing" });

  return json(200, {
    ok: true,
    provider: "KEEP_MEMORY",
    recognition: {
      confidence: Math.min(0.97, 0.6 + bestVotes / 200),
      title: track.title,
      artist: track.artist,
      album: track.album ?? undefined,
      artworkUrl: track.artwork_url ?? undefined,
      previewUrl: track.preview_url ?? undefined,
      availableOn: Object.keys(track.provider_ids ?? {}).length ? Object.keys(track.external_urls ?? {}) : [],
      externalUrls: track.external_urls ?? {},
      providerIds: track.provider_ids ?? {},
      recognitionProviderTrackId: `keep-memory:${track.id}`,
    },
    matchVotes: bestVotes,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("health") !== "1") return json(405, { error: "method_not_allowed" });
      const { count } = await admin.from("keep_fingerprint_tracks").select("id", { count: "exact", head: true });
      return json(200, { ok: true, service: "keep-music-memory", provider: "KEEP_MEMORY", seededTracks: count ?? 0, secretExposed: false });
    }
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    return await identify(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: "memory_gateway_error", message: message.slice(0, 300) });
  }
});
