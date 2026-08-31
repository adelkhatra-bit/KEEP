import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecognitionResult } from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';
import type { SharedMusicSource } from './sharedMusicSourceService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DEVICE_KEY = '@keep/music-device-id-v1';
const MIN_CONFIDENCE = 0.68;

function configured(value: string | undefined): value is string {
  return Boolean(value && value !== 'undefined' && !value.startsWith('your_'));
}

async function getDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
  } catch {}
  return 'keep-keyless-guest';
}

/**
 * Fallback sans clé de reconnaissance.
 *
 * IMPORTANT : `keep-music-keyless-source` est l'unique resolver serveur
 * canonique. Le partage direct ET le fallback de la boucle micro doivent
 * passer par lui pour éviter deux algorithmes concurrents avec des scores
 * différents. Il analyse les métadonnées publiques puis recoupe Apple/Deezer.
 */
export async function resolveKeylessSocialMusic(source: SharedMusicSource): Promise<RecognitionResult | null> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const [accessToken, deviceId] = await Promise.all([getSupabaseAccessToken(), getDeviceId()]);
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/keep-music-keyless-source`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-keep-device-id': deviceId,
      },
      body: JSON.stringify({
        url: source.url,
        rawText: source.rawText,
        title: source.title,
        platform: source.platform,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const recognition = payload?.recognition as RecognitionResult | null | undefined;
    if (!recognition?.title || !recognition?.artist) return null;
    if (!Number.isFinite(recognition.confidence) || recognition.confidence < MIN_CONFIDENCE) return null;
    return recognition;
  } catch {
    // Le partage social reste une aide : il ne doit jamais interrompre le micro
    // ni afficher une erreur rouge si une plateforme refuse ses métadonnées.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
