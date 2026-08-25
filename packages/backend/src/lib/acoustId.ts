import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

/**
 * Chromaprint/AcoustID/MusicBrainz -- provider de reconnaissance GRATUIT,
 * placé DEVANT AudD dans la chaîne (cf. demande explicite du 23/08/2026 --
 * recherche technique menée avant d'écrire ce fichier, voir résumé dans
 * docs/RECOGNITION_PROVIDERS_RESEARCH.md).
 *
 * Constat de la recherche : aucun wrapper npm de Chromaprint n'est
 * maintenu (fpcalc/chromaprint.js/chromaprint-fixed sont tous abandonnés
 * depuis 2017-2018) -- ni de WASM/pur-JS viable pour un usage côté client
 * mobile/web. Le chemin réel et standard (celui utilisé par MusicBrainz
 * Picard et beets) est le binaire `fpcalc` compilé, appelé côté SERVEUR via
 * child_process -- d'où ce fichier côté backend, pas côté mobile.
 *
 * `fpcalc` doit être installé sur la machine qui exécute ce backend
 * (`apt install libchromaprint-tools` sur Debian/Ubuntu, `brew install
 * chromaprint` sur Mac, `choco install chromaprint` sur Windows -- nécessite
 * des droits admin, non installé automatiquement ici). Sans lui,
 * `computeFingerprint` jette FpcalcNotFoundError -- jamais un faux résultat.
 */
export class FpcalcNotFoundError extends Error {}
export class AcoustIdError extends Error {}

export interface FingerprintResult {
  fingerprint: string;
  durationSec: number;
}

export interface AcoustIdMatch {
  /** 0-1, fourni par AcoustID -- contrairement à AudD, un vrai score continu. */
  score: number;
  musicbrainzRecordingId: string;
  title: string;
  artist: string;
}

export async function computeFingerprint(audioBuffer: Buffer, fileExtension: string): Promise<FingerprintResult> {
  const tmpFile = join(tmpdir(), `keep-fp-${randomUUID()}.${fileExtension}`);
  await writeFile(tmpFile, audioBuffer);
  try {
    // BUG RÉEL diagnostiqué le 24/08/2026 : `fpcalc` (sans chemin) dépendait
    // du PATH du process -- réglé une fois dans une session PowerShell
    // interactive qui a fini par disparaître (redémarrage du backend), donc
    // ENOENT silencieux dès le premier redémarrage propre suivant, alors que
    // le binaire n'avait jamais bougé. FPCALC_PATH (chemin absolu) élimine
    // cette dépendance fragile -- 'fpcalc' reste le repli si non renseigné
    // (machines où le binaire est un vrai paquet système sur le PATH).
    const fpcalcBin = process.env.FPCALC_PATH || 'fpcalc';
    const { stdout } = await execFileAsync(fpcalcBin, ['-json', tmpFile]);
    const parsed = JSON.parse(stdout) as { fingerprint: string; duration: number };
    return { fingerprint: parsed.fingerprint, durationSec: parsed.duration };
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      throw new FpcalcNotFoundError(
        'fpcalc introuvable sur ce serveur -- installer Chromaprint (apt install libchromaprint-tools / brew install chromaprint / choco install chromaprint) pour activer la reconnaissance gratuite AcoustID.'
      );
    }
    throw e;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

interface AcoustIdApiResponse {
  status: 'ok' | 'error';
  error?: { message?: string };
  results?: {
    id: string;
    score: number;
    recordings?: { id: string; title?: string; artists?: { name: string }[] }[];
  }[];
}

/** Lookup AcoustID -- gratuit, limité à ~3 req/s côté client (voir docs.acoustid.org), usage non-commercial pour la clé de test. */
export async function lookupAcoustId(fp: FingerprintResult, apiKey: string): Promise<AcoustIdMatch | null> {
  const url =
    `https://api.acoustid.org/v2/lookup?client=${encodeURIComponent(apiKey)}` +
    `&meta=recordings&duration=${Math.round(fp.durationSec)}&fingerprint=${encodeURIComponent(fp.fingerprint)}`;
  const res = await fetch(url);
  const json = (await res.json()) as AcoustIdApiResponse;
  if (json.status !== 'ok') {
    throw new AcoustIdError(`AcoustID : ${json.error?.message ?? `réponse inattendue (HTTP ${res.status})`}`);
  }

  const best = (json.results ?? []).filter((r) => r.recordings?.length).sort((a, b) => b.score - a.score)[0];
  const recording = best?.recordings?.[0];
  if (!best || !recording) return null;

  return {
    score: best.score,
    musicbrainzRecordingId: recording.id,
    title: recording.title ?? '(titre inconnu)',
    artist: recording.artists?.map((a) => a.name).join(', ') ?? '(artiste inconnu)',
  };
}

/**
 * ISRC -- pas inclus dans la réponse AcoustID de base, un second appel vers
 * MusicBrainz (gratuit, sans clé) est nécessaire. Courtoisie MusicBrainz :
 * ~1 requête/s, User-Agent obligatoire et identifiable (leur politique
 * d'usage bloque les clients anonymes) -- jamais omis.
 */
export async function fetchIsrcFromMusicBrainz(recordingId: string): Promise<string | undefined> {
  const res = await fetch(`https://musicbrainz.org/ws/2/recording/${recordingId}?inc=isrcs&fmt=json`, {
    headers: { 'User-Agent': 'KEEP-MusicApp/0.1 (contact: see EXPO_PUBLIC_API_URL operator)' },
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { isrcs?: string[] };
  return json.isrcs?.[0];
}
