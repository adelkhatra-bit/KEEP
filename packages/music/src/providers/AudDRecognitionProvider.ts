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
  duration_ms?: number;
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

/**
 * Nom de fichier ENVOYÉ À AUDD AVEC LA BONNE EXTENSION -- envoyer un blob
 * webm sous le nom "sample.m4a" (comme avant ce correctif) fait échouer le
 * fingerprint côté AudD ("problem with creating an audio fingerprint"),
 * confirmé en test réel sur iPhone (Safari, capture web via expo-av) le
 * 22/08/2026 : `expo-av` sur Web utilise MediaRecorder, dont le format réel
 * dépend du navigateur (souvent audio/webm), pas garanti m4a comme sur
 * natif. On lit le vrai type MIME du Blob plutôt que de le deviner.
 */
function fileNameForBlob(blob: Blob): string {
  const type = blob.type.split(';')[0].trim().toLowerCase();
  const extensionByMime: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
  };
  const ext = extensionByMime[type] ?? 'm4a'; // m4a = format réel sur natif (HIGH_QUALITY preset), repli raisonnable si type absent.
  return `sample.${ext}`;
}

export class AudDRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'audd';

  constructor(
    private readonly config: AudDConfig,
    // .bind(globalThis) -- Safari refuse d'exécuter `fetch` avec un `this`
    // autre que `window` ("Can only call Window.fetch on instances of
    // Window"), ce qui arrive dès que `fetch` est passé nu comme valeur par
    // défaut puis appelé via `this.fetchImpl(...)` (`this` devient alors
    // l'instance du provider, pas `window`). Confirmé cassé sur iPhone réel
    // (Safari) le 22/08/2026, invisible sur Chromium qui est plus permissif.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
    private readonly baseUrl = 'https://api.audd.io/'
  ) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample]);
    const form = this.baseForm();
    form.append('file', blob, fileNameForBlob(blob));
    return this.submit(form, `fichier envoyé = ${blob.size} octets, type "${blob.type || 'vide'}"`);
  }

  /**
   * Reconnaissance à partir d'un lien partagé -- AudD accepte un champ `url`
   * à la place de `file` et sait parser TikTok/Instagram/X/Facebook ainsi que
   * l'OpenGraph/JSON-LD/<audio>/<video> d'une page web quelconque (doc AudD,
   * vérifiée le 23/08/2026). Aucune supposition sur la plateforme d'origine :
   * on envoie le lien tel quel, AudD dit ce qu'il en tire ou renvoie une
   * erreur -- jamais de plateforme devinée depuis l'URL côté KEEP.
   */
  async recognizeFromUrl(url: string): Promise<RecognitionResult | null> {
    if (!url.trim()) {
      throw new AudDRecognitionError('AudD : lien vide.');
    }
    const form = this.baseForm();
    form.append('url', url.trim());
    return this.submit(form, `lien envoyé = "${url.trim()}"`);
  }

  private baseForm(): FormData {
    if (!this.config.apiToken) {
      throw new AudDRecognitionError(
        'AudD : api_token manquant. Créer un compte sur audd.io (free tier 300 requêtes) et fournir la clé via une méthode sécurisée -- jamais en dur dans le code.'
      );
    }
    const form = new FormData();
    form.append('api_token', this.config.apiToken);
    form.append('return', 'apple_music,spotify');
    if (this.config.market) form.append('market', this.config.market);
    return form;
  }

  private async submit(form: FormData, diagnostic: string): Promise<RecognitionResult | null> {
    // `body: form as any` -- `typeof fetch` résout ici vers les types globaux
    // React Native (via node_modules), dont le `FormData` diffère du DOM
    // standard utilisé pour construire `form` juste au-dessus -- un simple
    // conflit de déclaration de types ambiants, aucun risque runtime (les
    // deux décrivent le même objet FormData natif).
    const res = await this.fetchImpl(this.baseUrl, { method: 'POST', body: form as any });
    if (!res.ok) {
      throw new AudDRecognitionError(`AudD API -> HTTP ${res.status}`);
    }

    const json = (await res.json()) as AudDResponse;
    if (json.status !== 'success') {
      throw new AudDRecognitionError(
        `AudD API erreur ${json.error?.error_code ?? '?'} : ${json.error?.error_message ?? 'réponse inattendue'} ` +
          `[diagnostic : ${diagnostic}]`
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
      durationSec: match.spotify?.duration_ms ? Math.round(match.spotify.duration_ms / 1000) : undefined,
      recognitionProviderTrackId,
      songLink: match.song_link,
    };
  }
}
