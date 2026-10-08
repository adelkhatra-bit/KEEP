import { Platform } from 'react-native';
import type { RecognitionResult } from '@keep/music';
import KeepShazam from '../../modules/keep-shazam';
import { supabase } from './supabaseClient';

const NATIVE_ERROR_BACKOFF_MS = 15 * 1000;
let unavailableUntil = 0;

const reportedShazamDiagnostics = new Set<string>();

async function reportShazamDiagnostic(code: string, message: string, context: Record<string, unknown> = {}): Promise<void> {
  if (!supabase || reportedShazamDiagnostics.has(code)) return;
  reportedShazamDiagnostics.add(code);
  try {
    const { data } = await supabase.auth.getSession();
    const profileId = data.session?.user?.id;
    if (!profileId) return;
    await supabase.from('client_diagnostics').insert({
      profile_id: profileId,
      area: 'shazamkit_recognition',
      code,
      message: String(message || code).slice(0, 500),
      platform: Platform.OS,
      context,
    });
  } catch {
    // Le diagnostic ne doit jamais ralentir ni casser la cascade de reconnaissance.
  }
}


function isBlobLike(value: unknown): value is Blob {
  const row = value as any;
  return Boolean(row && typeof row.size === 'number' && typeof row.arrayBuffer === 'function');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const nativeBase64 = (blob as any)?.base64;
  if (typeof nativeBase64 === 'function') {
    return String(await nativeBase64.call(blob));
  }
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
  if (Platform.OS !== 'ios' || Date.now() < unavailableUntil) return null;
  if (!KeepShazam) {
    console.warn('[ShazamKit] module natif absent');
    void reportShazamDiagnostic('SHAZAM_MODULE_UNAVAILABLE', 'Module KeepShazam absent du binaire iOS.');
    return null;
  }
  try {
    if (!KeepShazam.isAvailable()) {
      console.warn('[ShazamKit] module présent mais indisponible');
      void reportShazamDiagnostic('SHAZAM_NOT_AVAILABLE', 'ShazamKit est présent mais isAvailable() renvoie false.');
      return null;
    }
    // Expo File implémente Blob mais n'est pas garanti d'être instanceof
    // le Blob global de React Native. Test structurel obligatoire.
    if (!isBlobLike(audioSample)) {
      void reportShazamDiagnostic('SHAZAM_SAMPLE_UNSUPPORTED', 'Échantillon natif non compatible Blob/File.', {
        sampleType: typeof audioSample,
      });
      return null;
    }
    const blob = audioSample;
    if (!blob.size) {
      void reportShazamDiagnostic('SHAZAM_SAMPLE_EMPTY', 'Échantillon natif vide.');
      return null;
    }
    const base64 = await blobToBase64(blob);
    const result = await KeepShazam.recognizeBase64(base64);
    if (!result?.title || !result?.artist) {
      void reportShazamDiagnostic('SHAZAM_NO_MATCH', 'ShazamKit a répondu sans correspondance.', { sampleBytes: blob.size });
      return null;
    }
    unavailableUntil = 0;
    console.info('[ShazamKit] match confirmé', { title: result.title, artist: result.artist });
    void reportShazamDiagnostic('SHAZAM_MATCH_OK', 'ShazamKit a reconnu un morceau sur cet appareil TestFlight.', {
      sampleBytes: blob.size,
      hasIsrc: Boolean(result.isrc),
    });
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
  } catch (error: any) {
    // Erreur d'App Service/provisioning ou indisponibilité Shazam : ne jamais
    // casser l'écoute. ACRCloud et les chemins gratuits continuent, mais on
    // conserve enfin la cause pour distinguer entitlement, fichier et réseau
    // sur un vrai build TestFlight.
    const errorName = String(error?.name || 'Error');
    const errorMessage = String(error?.message || error || 'ShazamKit error');
    console.warn('[ShazamKit] échec natif', { errorName, errorMessage });
    void reportShazamDiagnostic('SHAZAM_NATIVE_ERROR', errorMessage, { errorName });
    unavailableUntil = Date.now() + NATIVE_ERROR_BACKOFF_MS;
    return null;
  }
}
