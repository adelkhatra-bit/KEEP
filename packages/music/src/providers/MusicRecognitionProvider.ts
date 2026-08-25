import { RecognitionResult } from '../types';

/**
 * Interface d'un fournisseur de reconnaissance musicale (empreinte audio -> métadonnées).
 * KEEP n'est lié à aucun fournisseur unique : voir docs/MUSIC_RECOGNITION_PROVIDERS.md
 * pour l'étude comparative (prix, précision, disponibilité) qui a guidé le choix.
 */
export interface MusicRecognitionProvider {
  readonly providerId: string;

  /**
   * @param audioSample Échantillon audio (PCM/WAV/AAC selon provider), quelques secondes.
   * @param requestId Cf. demande explicite du 23/08/2026 -- id de traçage E2E généré côté
   * client (USER_TAP), transmis tel quel si le provider fait un appel réseau traçable côté
   * backend KEEP (voir AcoustIdRecognitionProvider). Optionnel : ignoré par les providers
   * qui n'appellent pas notre propre backend (AudD, Demo).
   * @returns null si aucune correspondance suffisamment confiante.
   */
  recognize(audioSample: ArrayBuffer | Blob, requestId?: string): Promise<RecognitionResult | null>;

  /**
   * Reconnaissance à partir d'un lien partagé (TikTok/Instagram/X/Facebook/
   * page web) plutôt que du micro -- cf. demande explicite du 23/08/2026 :
   * "Partager un lien vers KEEP". Optionnelle : tous les providers ne
   * supportent pas forcément l'analyse de lien (ex. DemoRecognitionProvider).
   * Un écran ne doit proposer "Coller un lien" que si cette méthode existe
   * sur le provider actif -- jamais un bouton qui échoue silencieusement.
   */
  recognizeFromUrl?(url: string): Promise<RecognitionResult | null>;
}
