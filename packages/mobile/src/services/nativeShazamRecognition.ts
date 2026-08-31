import { Platform } from 'react-native';
import type { RecognitionResult } from '@keep/music';
import KeepShazam from '../../modules/keep-shazam';

const NATIVE_ERROR_BACKOFF_MS = 5 * 60 * 1000;
let unavailableUntil = 0;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Lecture audio native impossible.'));
      reader.onloadend = () => {
        const value = String(reader.result ?? '');
        const comma = value.indexOf(',');
        if (comma < 0) return reject(new Error('Encodage audio native invalide.'));
        resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Reconnaissance iOS sans clé AudD/ACRCloud : ShazamKit interroge directement
 * le catalogue Shazam d'Apple. Le module est optionnel pour conserver le web et
 * Android fonctionnels. Si l'App Service ShazamKit n'est pas encore activé sur
 * l'App ID Apple, on retombe silencieusement sur les autres moteurs.
 */
export async function recognizeWithNativeShazam(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
  if (Platform.OS !== 'ios' || !KeepShazam || Date.now() < unavailableUntil) return null;
  try {
    if (!KeepShazam.isAvailable()) return null;
    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/m4a' });
    if (!blob.size) return null;
    const base64 = await blobToBase64(blob);
    const result = await KeepShazam.recognizeBase64(base64);
    if (!result?.title || !result?.artist) return null;
    unavailableUntil = 0;
    return {
      confidence: Number.isFinite(result.confidence) ? result.confidence : 0.99,
      title: result.title,
      artist: result.artist,
      isrc: result.isrc,
      artworkUrl: result.artworkUrl,
      genres: Array.isArray(result.genres) ? result.genres : [],
      providerIds: result.providerIds ?? {},
      externalUrls: result.externalUrls ?? {},
      availableOn: result.availableOn ?? ['Shazam'],
      recognitionProviderTrackId: result.recognitionProviderTrackId,
    };
  } catch {
    // Erreur d'App Service/provisioning ou indisponibilité Shazam : ne jamais
    // casser l'écoute. Le serveur AudD/ACRCloud et le fallback social continuent.
    unavailableUntil = Date.now() + NATIVE_ERROR_BACKOFF_MS;
    return null;
  }
}
