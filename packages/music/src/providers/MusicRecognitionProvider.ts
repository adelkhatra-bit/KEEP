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
   * @returns null si aucune correspondance suffisamment confiante.
   */
  recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null>;
}
