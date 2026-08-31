import { MPEGDecoder } from "npm:mpg123-decoder@1.0.3";
import { computeFingerprint } from "./audioFingerprint.ts";

export type SeedableRecognition = {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
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
  if (!rec?.previewUrl || !rec.title || !rec.artist) return;
  try {
    const { data: existing } = await admin
      .from("keep_fingerprint_tracks")
      .select("id")
      .ilike("title", rec.title)
      .ilike("artist", rec.artist)
      .maybeSingle();
    if (existing?.id) return; // déjà ensemencé, pas besoin de refaire le calcul

    const response = await fetch(rec.previewUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const mp3Bytes = new Uint8Array(await response.arrayBuffer());
    if (mp3Bytes.length < 1000) return;

    const decoder = new MPEGDecoder();
    await decoder.ready;
    const { channelData, sampleRate } = decoder.decode(mp3Bytes);
    decoder.free();
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
