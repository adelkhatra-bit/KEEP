import { MPEGDecoder } from "npm:mpg123-decoder@1.0.3";
import { computeFingerprint } from "./audioFingerprint.ts";

function isMp3Payload(bytes: Uint8Array, contentType: string | null): boolean {
  const type = String(contentType ?? "").toLowerCase();
  if (type.includes("audio/mpeg") || type.includes("audio/mp3")) return true;
  // ID3 metadata header.
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // MPEG audio frame sync. Useful when CDNs answer application/octet-stream.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  return false;
}

function isMp4AacPayload(bytes: Uint8Array, contentType: string | null): boolean {
  const type = String(contentType ?? "").toLowerCase();
  if (type.includes("audio/mp4") || type.includes("audio/aac") || type.includes("audio/x-m4a")) return true;
  // ISO BMFF / M4A: size(4) + "ftyp".
  return bytes.length >= 8
    && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}


export type SeedableRecognition = {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
  isrc?: string;
  genres?: string[];
  availableOn?: string[];
  releaseYear?: number;
  externalUrls?: Record<string, string>;
  providerIds?: Record<string, string>;
};

/**
 * Ensemence la mémoire d'empreintes KEEP à partir de l'extrait légal déjà
 * obtenu (Deezer/iTunes previewUrl) dès qu'un morceau est identifié avec
 * confiance -- par n'importe quel moteur (AudD, ACRCloud, ou la recherche
 * sans clé). Tourne en arrière-plan, ne ralentit jamais la réponse à
 * l'utilisateur, et échoue silencieusement (best effort, jamais bloquant).
 * Partagé entre les trois moteurs de reconnaissance pour que la mémoire
 * grandisse à partir de CHAQUE reconnaissance réussie, pas seulement des
 * recherches manuelles.
 */
export async function seedFingerprintMemory(admin: any, rec: SeedableRecognition | null) {
  if (!rec?.title || !rec.artist) return;

  // Every successful recognition enriches Loki's own canonical catalog first,
  // even when no preview is available. The RPC deduplicates by ISRC/provider/
  // normalized title+artist and the tracks trigger classifies its genres into
  // Solo/Battle themes. Fingerprinting stays a second, optional layer.
  try {
    await admin.rpc("service_catalog_track_from_recognition", {
      p_title: rec.title,
      p_artist: rec.artist,
      p_isrc: rec.isrc ?? null,
      p_album: rec.album ?? null,
      p_artwork_url: rec.artworkUrl ?? null,
      p_preview_url: rec.previewUrl ?? null,
      p_provider_ids: rec.providerIds ?? {},
      p_external_urls: rec.externalUrls ?? {},
      p_available_on: rec.availableOn ?? [],
      p_genres: rec.genres ?? [],
      p_release_year: Number.isFinite(rec.releaseYear) ? Math.round(Number(rec.releaseYear)) : null,
    });
  } catch (error) {
    console.error("[fingerprintSeed] catalog seed failed", error instanceof Error ? error.message : String(error));
  }

  if (!rec.previewUrl) return;
  try {
    // Un titre + artiste identiques ne prouvent JAMAIS qu'il s'agit du même
    // contenu (live, remix, reprise, paroles différentes). On ne réutilise
    // une empreinte existante qu'avec un identifiant fort ou la même preview.
    let existingId: string | null = null;
    if (rec.isrc) {
      const { data } = await admin.from("keep_fingerprint_tracks").select("id").eq("isrc", rec.isrc.trim().toUpperCase()).maybeSingle();
      existingId = data?.id ?? null;
    }
    for (const key of ["appleMusic", "spotify", "deezer", "itunes"]) {
      const value = rec.providerIds?.[key];
      if (existingId || !value) continue;
      const { data } = await admin.from("keep_fingerprint_tracks").select("id").contains("provider_ids", { [key]: String(value) }).limit(1).maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && rec.previewUrl) {
      const { data } = await admin.from("keep_fingerprint_tracks").select("id").eq("preview_url", rec.previewUrl).limit(1).maybeSingle();
      existingId = data?.id ?? null;
    }
    if (existingId) return;

    const response = await fetch(rec.previewUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const contentType = response.headers.get("content-type");
    const audioBytes = new Uint8Array(await response.arrayBuffer());
    if (audioBytes.length < 1000) return;

    // mpg123 ne sait décoder QUE MPEG audio. Les previews iTunes sont très
    // souvent M4A/AAC (ftyp) : les envoyer à mpg123 produisait
    // MPG123_ERR des centaines de fois et polluait les logs. Tant qu'un
    // décodeur AAC PCM n'est pas embarqué dans l'Edge Runtime, on saute
    // uniquement l'empreinte locale pour ces previews. Le morceau reste bien
    // ajouté au catalogue ci-dessus et ACRCloud/ShazamKit continuent de
    // fonctionner normalement.
    if (!isMp3Payload(audioBytes, contentType)) {
      if (!isMp4AacPayload(audioBytes, contentType)) {
        console.warn("[fingerprintSeed] unsupported preview codec", {
          contentType: contentType ?? "unknown",
          urlHost: (() => { try { return new URL(rec.previewUrl!).host; } catch { return "unknown"; } })(),
        });
      }
      return;
    }

    const decoder = new MPEGDecoder();
    await decoder.ready;
    let decoded: ReturnType<MPEGDecoder["decode"]>;
    try {
      decoded = decoder.decode(audioBytes);
    } finally {
      decoder.free();
    }
    const { channelData, sampleRate } = decoded;
    if (!channelData?.length || channelData[0].length < 4096) return;
    // Vrai mixage mono (moyenne des canaux), pas juste le canal gauche -- doit
    // correspondre à ce qu'un micro/onglet capte réellement (un seul flux
    // mono), sinon les empreintes générées ici ne peuvent jamais matcher
    // celles d'une vraie capture ambiante.
    const samples = channelData.length === 1
      ? channelData[0]
      : (() => {
          const mono = new Float32Array(channelData[0].length);
          for (let i = 0; i < mono.length; i++) {
            let sum = 0;
            for (const channel of channelData) sum += channel[i];
            mono[i] = sum / channelData.length;
          }
          return mono;
        })();

    const hashes = computeFingerprint(samples, sampleRate);
    if (hashes.length < 20) return; // extrait trop court/silencieux pour une empreinte utile

    const { data: trackRow, error: trackError } = await admin
      .from("keep_fingerprint_tracks")
      .insert({
        title: rec.title,
        artist: rec.artist,
        isrc: rec.isrc?.trim().toUpperCase() ?? null,
        album: rec.album ?? null,
        artwork_url: rec.artworkUrl ?? null,
        preview_url: rec.previewUrl,
        external_urls: rec.externalUrls ?? {},
        provider_ids: rec.providerIds ?? {},
        hash_count: hashes.length,
      })
      .select("id")
      .single();
    if (trackError || !trackRow?.id) return;

    const rows = hashes.map((h) => ({ hash: h.hash, track_id: trackRow.id, time_offset_ms: h.timeOffsetMs }));
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from("keep_fingerprint_hashes").insert(rows.slice(i, i + 500));
    }
  } catch (error) {
    console.error("[fingerprintSeed] seed failed", error instanceof Error ? error.message : String(error));
  }
}

export function seedInBackground(admin: any, rec: SeedableRecognition | null) {
  try {
    // @ts-ignore -- global fourni par le runtime Supabase Edge Functions
    EdgeRuntime.waitUntil(seedFingerprintMemory(admin, rec));
  } catch {
    void seedFingerprintMemory(admin, rec);
  }
}
