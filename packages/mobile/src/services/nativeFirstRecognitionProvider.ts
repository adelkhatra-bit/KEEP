import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { recognizeWithNativeShazam } from './nativeShazamRecognition';

/**
 * Ordre de coût/couverture :
 * 1. ShazamKit natif iOS (aucune clé AudD/ACRCloud dans l'app),
 * 2. provider serveur KEEP (AudD puis ACRCloud).
 */
export class NativeFirstRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-native-first';

  constructor(private readonly fallback: MusicRecognitionProvider) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    const native = await recognizeWithNativeShazam(audioSample);
    if (native) return native;
    return this.fallback.recognize(audioSample);
  }
}
