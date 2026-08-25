import { MusicRecognitionProvider } from './MusicRecognitionProvider';
import { RecognitionResult } from '../types';

/**
 * Implémentation RÉELLE (REST) de MusicRecognitionProvider pour AudD.
 *
 * Sources vérifiées le 21/08/2026 (recherche + lecture de la doc officielle
 * AudD, pas une supposition) : docs.audd.io.
 */
export interface AudDConfig {
  apiToken: string;
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
    // BUG RÉEL trouvé le 26/08/2026, reproduit en direct dans un vrai
    // navigateur (session Playwright réelle, pas une supposition) : erreur
    // "Failed to execute 'fetch' on 'Window': Illegal invocation" -- EXACTEMENT
    // l'erreur rapportée par Adel depuis le début sur l'écoute en Mode Réel.
    // Cause : la valeur par défaut `= fetch` capture une référence détachée
    // de `window.fetch`. Chrome/V8 exige que fetch() soit appelé avec le bon
    // récepteur (`this === window`) -- un appel via `this.fetchImpl(...)`
    // perd ce contexte et plante systématiquement. musicEngine.ts (mobile)
    // instancie ce provider SANS fournir de fetchImpl personnalisé, donc
    // TOUTE tentative de reconnaissance réelle sur Chrome/web passait par ce
    // chemin cassé -- ce qui explique qu'AudD ait reçu 166 requêtes réelles
    // ce mois-ci (probablement via Safari/natif, moins strict sur ce point)
    // alors que la reconnaissance ne fonctionnait jamais dans le navigateur
    // réellement testé cette session. `.bind(globalThis)` fonctionne aussi
    // bien en navigateur (web) qu'avec le polyfill fetch de React Native
    // (natif) -- jamais une référence nue.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
    private readonly baseUrl = 'https://api.audd.io/'
  ) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    if (!this.config.apiToken) {
      throw new AudDRecognitionError(
        'AudD : api_token manquant. Créer un compte sur audd.io (free tier 300 requêtes) et fournir la clé via une méthode sécurisée -- jamais en dur dans le code.'
      );
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample]);
    // BUG RÉEL trouvé le 26/08/2026 (compte AudD actif, 166 requêtes reçues ce
    // mois d'après le tableau de bord réel d'Adel, mais aucune reconnaissance
    // ne remonte jamais) : le fichier envoyé était TOUJOURS nommé
    // "sample.m4a", quel que soit son contenu réel. Or micCapture.ts (web)
    // produit un vrai WAV (encodeWav(), type MIME "audio/wav") depuis la
    // correction du 26/08/2026 sur la capture web -- AudD recevait donc du
    // contenu WAV étiqueté .m4a, une extension trompeuse qui peut faire
    // échouer le décodage côté serveur AudD sans jamais renvoyer d'erreur
    // HTTP explicite (juste un "no match" silencieux -- exactement le
    // symptôme observé). Nom de fichier dérivé du VRAI type MIME du blob.
    const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : 'm4a';
    const form = new FormData();
    form.append('api_token', this.config.apiToken);
    form.append('file', blob, `sample.${extension}`);
    form.append('return', 'apple_music,spotify');
    if (this.config.market) form.append('market', this.config.market);

    // React Native fournit sa propre déclaration de fetch/FormData alors que
    // le package musique est aussi compilé pour le Web. Les objets sont
    // compatibles à l'exécution, mais leurs types DOM/RN se chevauchent.
    // Le cast reste volontairement local au body multipart pour ne masquer
    // aucune autre erreur de type dans le provider.
    const res = await this.fetchImpl(this.baseUrl, { method: 'POST', body: form as any });
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
      return null;
    }
    const match = Array.isArray(result) ? result[0] : result;
    return this.toRecognitionResult(match);
  }

  private toRecognitionResult(match: AudDResultItem): RecognitionResult {
    const isrc = match.apple_music?.isrc ?? match.spotify?.external_ids?.isrc;
    const artworkUrl = appleArtworkUrl(match.apple_music?.artwork?.url) ?? match.spotify?.album?.images?.[0]?.url;
    const recognitionProviderTrackId = match.apple_music?.playParams?.id ?? match.spotify?.id ?? match.song_link;

    return {
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