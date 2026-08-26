import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CanonicalTrack, MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import type { KeepVisibility } from '../types';
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

function baseHeaders(accessToken?: string | null): Record<string, string> {
  if (!configured(SUPABASE_ANON_KEY)) return {};
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
  };
}

/**
 * Enregistre le KEEP dans le profil réel quand un compte est connecté.
 * Un invité reste 100 % local : aucune auth Supabase artificielle n'est créée.
 */
export async function recordKeepDecision(
  track: CanonicalTrack,
  visibility: KeepVisibility,
  context: Record<string, unknown> = {},
): Promise<{ decisionId: string; trackId: string } | null> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return null;
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return null;

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/keep-music-core`, {
    method: 'POST',
    headers: {
      ...baseHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'decision',
      decision: 'KEPT',
      visibility,
      track: {
        id: track.id,
        isrc: track.isrc,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationSec: track.durationSec,
        artworkUrl: track.artworkUrl,
        genres: track.genres ?? [],
        providerIds: track.providerIds ?? {},
      },
      context,
    }),
  });
  const payload = await parseResponse(response);
  return payload?.decisionId && payload?.trackId
    ? { decisionId: String(payload.decisionId), trackId: String(payload.trackId) }
    : null;
}

/** Met à jour uniquement la visibilité d'un KEEP appartenant au compte actif. */
export async function updateKeepDecisionVisibility(decisionId: string, visibility: KeepVisibility): Promise<boolean> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return false;
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return false;

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/keep-music-core`, {
    method: 'POST',
    headers: {
      ...baseHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'decision.visibility', decisionId, visibility }),
  });
  await parseResponse(response);
  return true;
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
        ...baseHeaders(accessToken),
        'x-keep-device-id': await getDeviceId(),
      },
      body: form,
    });

    const payload = await parseResponse(response);
    return payload?.recognition ? payload.recognition as RecognitionResult : null;
  }
}

export const isSecureRecognitionConfigured = configured(SUPABASE_URL) && configured(SUPABASE_ANON_KEY);
