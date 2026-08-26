import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DEVICE_KEY = '@keep/music-device-id-v1';

function configured(value: string | undefined): value is string {
  return Boolean(value && value !== 'undefined' && !value.startsWith('your_'));
}

function makeDeviceId() {
  const cryptoApi = (globalThis as any)?.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `keep-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = makeDeviceId();
    await AsyncStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return makeDeviceId();
  }
}

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.message || payload?.error || `HTTP ${response.status}`);
    throw new Error(message);
  }
  return payload;
}

/**
 * Reconnaissance musicale via la fonction Supabase `keep-music-core`.
 * La clé AudD reste exclusivement dans Supabase Vault : aucune clé fournisseur
 * n'est exposée dans le bundle web/iOS/Android. Les invités sont protégés par
 * le rate-limit serveur IP + identifiant local, les comptes par leur auth.uid().
 */
export class KeepMusicCoreRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-music-core';

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) {
      throw new Error('Reconnaissance KEEP indisponible : Supabase n’est pas configuré.');
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });
    if (!blob.size) return null;

    const form = new FormData();
    form.append('audio', blob, 'keep-sample.wav');

    const accessToken = await getSupabaseAccessToken();
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/keep-music-core`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        'x-keep-device-id': await getDeviceId(),
      },
      body: form,
    });

    const payload = await parseResponse(response);
    return payload?.recognition ? payload.recognition as RecognitionResult : null;
  }
}

export const isSecureRecognitionConfigured = configured(SUPABASE_URL) && configured(SUPABASE_ANON_KEY);
