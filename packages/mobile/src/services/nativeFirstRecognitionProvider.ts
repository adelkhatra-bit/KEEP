import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { recognizeSharedSourceKeyless } from './keylessSharedSourceRecognition';
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
    // ShazamKit, collective KEEP memory and an explicit shared source are all
    // free fast paths. Start them together; the first trustworthy match wins.
    // Paid/server providers start only if every fast path returned no match.
    const fast = await firstRecognition([
      recognizeWithNativeShazam(audioSample).then((result) => result ? { ...result, engine: 'ShazamKit' } : null),
      recognizeWithKeepMemoryFast(audioSample).then((result) => result ? { ...result, engine: 'Loki Memory' } : null),
      recognizeSharedSourceKeyless().then((result) => result ? { ...result, engine: 'KEYLESS_SOURCE' } : null),
    ]);
    if (fast) {
      noteSuccessfulRecognitionForPaidSuppression(fast);
      const providerTrackId = String(fast.recognitionProviderTrackId ?? '');
      if (!providerTrackId.startsWith('keep-memory:') && !providerTrackId.startsWith('keyless:')) {
        void learnRecognitionInBackground(fast);
      }
      return fast;
    }

    return this.fallback.recognizeAfterMemory
      ? this.fallback.recognizeAfterMemory(audioSample)
      : this.fallback.recognize(audioSample);
  }
}
