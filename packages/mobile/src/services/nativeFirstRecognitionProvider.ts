import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { recognizeWithNativeShazam } from './nativeShazamRecognition';
import { learnRecognitionInBackground, noteSuccessfulRecognitionForPaidSuppression, recognizeWithKeepMemoryFast } from './keepMusicCoreRecognition';

/**
 * Cascade de reconnaissance Loki, du plus autonome au plus dépendant :
 * 1. ShazamKit natif iOS — aucune clé AudD/ACRCloud dans l'app ;
 * 2. lien partagé TikTok/YouTube/Instagram/Snapchat/etc. — métadonnées +
 *    catalogues publics sans credential ;
 * 3. provider serveur Loki — AudD puis ACRCloud uniquement s'ils sont actifs.
 *
 * Chaque étape est best-effort : une indisponibilité ne casse jamais l'écoute.
 */
type MemoryAwareProvider = MusicRecognitionProvider & {
  recognizeAfterMemory?: (audioSample: ArrayBuffer | Blob) => Promise<RecognitionResult | null>;
};

async function firstRecognition(promises: Array<Promise<RecognitionResult | null>>): Promise<RecognitionResult | null> {
  return new Promise((resolve) => {
    let remaining = promises.length;
    let settled = false;
    const finishNull = () => {
      remaining -= 1;
      if (!settled && remaining === 0) resolve(null);
    };
    for (const promise of promises) {
      promise.then((value) => {
        if (!settled && value) {
          settled = true;
          resolve(value);
          return;
        }
        finishNull();
      }).catch(finishNull);
    }
  });
}

export class NativeFirstRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-native-keyless-first';

  constructor(private readonly fallback: MemoryAwareProvider) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    // ShazamKit et la mémoire collective KEEP reconnaissent l'échantillon du micro.
    // Un ancien lien YouTube partagé est une autre source et ne doit jamais
    // gagner la course contre l'empreinte audio live.
    const fast = await firstRecognition([
      recognizeWithNativeShazam(audioSample),
      recognizeWithKeepMemoryFast(audioSample),
    ]);
    if (fast) {
      noteSuccessfulRecognitionForPaidSuppression(fast);
      const providerTrackId = String(fast.recognitionProviderTrackId ?? '');
      if (!providerTrackId.startsWith('keep-memory:') && !providerTrackId.startsWith('keyless:')) {
        void learnRecognitionInBackground(fast);
      }
      return fast;
    }

    // La reconnaissance live reste liée à audioSample ; la reconnaissance
    // d'une URL fournie explicitement appartient au parcours de partage.
    return this.fallback.recognizeAfterMemory
      ? this.fallback.recognizeAfterMemory(audioSample)
      : this.fallback.recognize(audioSample);
  }
}
