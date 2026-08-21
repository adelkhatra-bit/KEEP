import { MusicRecognitionProvider } from './MusicRecognitionProvider';
import { RecognitionResult } from '../types';

/**
 * Implémentation RÉELLE (REST) de MusicRecognitionProvider pour AudD.
 *
 * Sources vérifiées le 21/08/2026 (recherche + lecture de la doc officielle
 * AudD, pas une supposition) : docs.audd.io.
 *
 * Contraintes réelles qui façonnent ce fichier :
 * - Endpoint unique `https://api.audd.io/`, POST multipart/form-data,
 *   champs `api_token`, `file` (l'échantillon audio), `return` (métadonnées
 *   étendues : on demande `apple_music,spotify` pour récupérer l'ISRC, qui
 *   n'est PAS présent dans la réponse de base).
 * - **AudD ne fournit aucun score de confiance continu** (contrairement à
 *   d'autres providers) — la correspondance est binaire (trouvé / pas
 *   trouvé). On ne fabrique donc jamais un score type "0.87" : `confidence`
 *   vaut 1.0 sur un match (documenté comme tel, pas une vraie probabilité),
 *   et `recognize()` renvoie `null` sur l'absence de correspondance.
 * - Réponse de succès : `{status:"success", result: {...} | null | []}` —
 *   attention, `result` peut être `null` OU un tableau vide selon les cas,
 *   les deux doivent être traités comme "pas de correspondance".
 * - Limite : 10 Mo par fichier sur l'endpoint standard (suffisant pour un
 *   échantillon de quelques secondes ; l'endpoint "enterprise" existe pour
 *   des fichiers plus gros, non nécessaire pour KEEP).
 */

export interface AudDConfig {
  apiToken: string;
  /** Code pays pour des résultats régionaux (par défaut "us" côté AudD). */
  market?: string;
}

export class AudDRecognitionError extends Error {}

interface AudDAppleMusicMatch {
  isrc?: string;
  artwork?: { url?: string };
  playParams?: { id?: string };
}
interface AudDSpotifyMatch {
  external_ids?: { isrc?: string };
  album?: { images?: { url: string }[] };
  id?: string;
}
interface AudDResultItem {
  artist: string;
  title: string;
  album?: string;
  song_link?: string;
  apple_music?: AudDAppleMusicMatch;
  spotify?: AudDSpotifyMatch;
}
interface AudDResponse {
  status: 'success' | 'error';
  result?: AudDResultItem | AudDResultItem[] | null;
  error?: { error_code?: number; error_message?: string };
}

function appleArtworkUrl(url?: string, size = 300): string | undefined {
  if (!url) return undefined;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

export class AudDRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'audd';

  constructor(
    private readonly config: AudDConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = 'https://api.audd.io/'
  ) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    if (!this.config.apiToken) {
      throw new AudDRecognitionError(
        'AudD : api_token manquant. Créer un compte sur audd.io (free tier 300 requêtes) et fournir la clé via une méthode sécurisée -- jamais en dur dans le code.'
      );
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample]);
    const form = new FormData();
    form.append('api_token', this.config.apiToken);
    form.append('file', blob, 'sample.m4a');
    form.append('return', 'apple_music,spotify');
    if (this.config.market) form.append('market', this.config.market);

    const res = await this.fetchImpl(this.baseUrl, { method: 'POST', body: form });
    if (!res.ok) {
      throw new AudDRecognitionError(`AudD API -> HTTP ${res.status}`);
    }

    const json = (await res.json()) as AudDResponse;
    if (json.status !== 'success') {
      throw new AudDRecognitionError(
        `AudD API erreur ${json.error?.error_code ?? '?'} : ${json.error?.error_message ?? 'réponse inattendue'}`
      );
    }

    const result = json.result;
    if (!result || (Array.isArray(result) && result.length === 0)) {
      return null; // Aucune correspondance -- jamais un faux résultat inventé.
    }
    const match = Array.isArray(result) ? result[0] : result;
    return this.toRecognitionResult(match);
  }

  private toRecognitionResult(match: AudDResultItem): RecognitionResult {
    const isrc = match.apple_music?.isrc ?? match.spotify?.external_ids?.isrc;
    const artworkUrl = appleArtworkUrl(match.apple_music?.artwork?.url) ?? match.spotify?.album?.images?.[0]?.url;
    const recognitionProviderTrackId = match.apple_music?.playParams?.id ?? match.spotify?.id ?? match.song_link;

    return {
      // AudD ne renvoie pas de score continu -- voir commentaire en tête de fichier.
      confidence: 1.0,
      title: match.title,
      artist: match.artist,
      album: match.album,
      isrc,
      artworkUrl,
      recognitionProviderTrackId,
    };
  }
}
