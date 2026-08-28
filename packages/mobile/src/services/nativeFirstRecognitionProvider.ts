import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { recognizeSharedSourceKeyless } from './keylessSharedSourceRecognition';
import { recognizeWithNativeShazam } from './nativeShazamRecognition';

/**
 * Cascade de reconnaissance KEEP, du plus autonome au plus dépendant :
 * 1. ShazamKit natif iOS — aucune clé AudD/ACRCloud dans l'app ;
 * 2. lien partagé TikTok/YouTube/Instagram/Snapchat/etc. — métadonnées +
 *    catalogues publics sans credential ;
 * 3. provider serveur KEEP — AudD puis ACRCloud uniquement s'ils sont actifs.
 *
 * Chaque étape est best-effort : une indisponibilité ne casse jamais l'écoute.
 */
export class NativeFirstRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-native-keyless-first';

  constructor(private readonly fallback: MusicRecognitionProvider) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    const native = await recognizeWithNativeShazam(audioSample);
    if (native) return native;

    const sharedSource = await recognizeSharedSourceKeyless();
    if (sharedSource) return sharedSource;

    return this.fallback.recognize(audioSample);
  }
}
