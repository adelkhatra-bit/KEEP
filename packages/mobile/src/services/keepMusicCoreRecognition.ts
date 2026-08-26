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

function audioExtension(blob: Blob): string {
  const type = String(blob.type || '').toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  // expo-av HIGH_QUALITY produit généralement un conteneur m4a sur iOS/Android.
  return 'm4a';
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

export interface PersistedKeepDecision {
  decisionId: string;
  visibility: KeepVisibility;
  createdAt: string;
  detectedAt: string;
  sessionId?: string;
  track: CanonicalTrack;
}

/**
 * Recharge les KEEP d'un compte depuis Supabase.
 *
 * L'historique détaillé de session reste disponible hors-ligne dans
 * AsyncStorage, mais le profil musical (KEEP DNA / morceaux gardés) ne doit pas
 * dépendre d'un seul navigateur ou téléphone. Cette lecture transforme donc
 * les décisions persistées côté serveur en CanonicalTrack réutilisables par le
 * store local après une mise à jour, une reconnexion ou un nouvel appareil.
 */
export async function loadOwnPersistedKeeps(limit = 750): Promise<PersistedKeepDecision[]> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return [];
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return [];

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/keep_decisions`);
  url.searchParams.set('select', 'id,visibility,created_at,context,track:tracks(id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,external_urls,available_on)');
  url.searchParams.set('decision', 'eq.KEPT');
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 1000))));

  const response = await fetch(url.toString(), { headers: baseHeaders(accessToken) });
  const rows = await parseResponse(response);
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row: any): PersistedKeepDecision[] => {
    const track = Array.isArray(row?.track) ? row.track[0] : row?.track;
    if (!row?.id || !track?.id || !track?.title || !track?.artist) return [];
    const context = row?.context && typeof row.context === 'object' ? row.context : {};
    const createdAt = String(row.created_at || new Date().toISOString());
    const detectedAt = typeof context.detectedAt === 'string' && context.detectedAt ? context.detectedAt : createdAt;
    const sessionId = typeof context.sessionId === 'string' && context.sessionId ? context.sessionId : undefined;
    const visibility: KeepVisibility = row.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    return [{
      decisionId: String(row.id),
      visibility,
      createdAt,
      detectedAt,
      sessionId,
      track: {
        id: String(track.id),
        isrc: track.isrc || undefined,
        title: String(track.title),
        artist: String(track.artist),
        album: track.album || undefined,
        durationSec: typeof track.duration_sec === 'number' ? track.duration_sec : undefined,
        artworkUrl: track.artwork_url || undefined,
        genres: Array.isArray(track.genres) ? track.genres : [],
        providerIds: track.provider_ids && typeof track.provider_ids === 'object' ? track.provider_ids : {},
        previewUrl: track.preview_url || undefined,
        externalUrls: track.external_urls && typeof track.external_urls === 'object' ? track.external_urls : {},
        availableOn: Array.isArray(track.available_on) ? track.available_on : [],
      },
    }];
  });
}

type RecognitionAttempt = {
  ok: boolean;
  status: number;
  payload: any;
};

async function recognitionAttempt(
  functionName: 'keep-music-core' | 'keep-music-fallback',
  blob: Blob,
  accessToken: string | null,
  deviceId: string,
): Promise<RecognitionAttempt> {
  const form = new FormData();
  form.append('audio', blob, `keep-sample.${audioExtension(blob)}`);
  try {
    const response = await fetch(`${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'x-keep-device-id': deviceId,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch (error: any) {
    return { ok: false, status: 0, payload: { error: 'network_error', message: error?.message ?? 'Réseau indisponible' } };
  }
}

function attemptMessage(attempt: RecognitionAttempt): string {
  return String(attempt.payload?.message || attempt.payload?.error || (attempt.status ? `HTTP ${attempt.status}` : 'Reconnaissance indisponible'));
}

/**
 * Reconnaissance musicale en cascade :
 * 1. AudD via `keep-music-core` (clé serveur/Vault),
 * 2. ACRCloud via `keep-music-fallback` uniquement si AudD ne reconnaît pas
 *    le morceau ou rencontre un incident.
 *
 * Spotify/YouTube/Deezer/Apple servent ensuite à enrichir le morceau reconnu ;
 * ils ne sont jamais présentés comme des moteurs d'empreinte audio eux-mêmes.
 */
export class KeepMusicCoreRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-music-core';

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) {
      throw new Error('Reconnaissance KEEP indisponible : Supabase n’est pas configuré.');
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });
    if (!blob.size) return null;

    const [accessToken, deviceId] = await Promise.all([getSupabaseAccessToken(), getDeviceId()]);
    const primary = await recognitionAttempt('keep-music-core', blob, accessToken, deviceId);
    if (primary.ok && primary.payload?.recognition) {
      return primary.payload.recognition as RecognitionResult;
    }

    // Un no-match AudD ou une erreur fournisseur déclenche le second moteur.
    // Le même échantillon est réutilisé : aucune nouvelle capture micro n'est
    // nécessaire et le morceau reste dans la session dès qu'un moteur répond.
    const fallback = await recognitionAttempt('keep-music-fallback', blob, accessToken, deviceId);
    if (fallback.ok && fallback.payload?.recognition) {
      return fallback.payload.recognition as RecognitionResult;
    }

    // Fallback non configuré : on conserve le comportement AudD historique.
    // Un simple no-match n'est jamais transformé en erreur utilisateur.
    if (primary.ok) return null;
    if (fallback.status === 409 || fallback.payload?.error === 'fallback_not_configured') {
      throw new Error(attemptMessage(primary));
    }

    // Si les deux moteurs ont été tentés mais ne trouvent rien, on évite une
    // fausse erreur rouge : l'écoute continue et réessaiera au prochain extrait.
    if (fallback.ok) return null;
    throw new Error(attemptMessage(primary));
  }
}

export const isSecureRecognitionConfigured = configured(SUPABASE_URL) && configured(SUPABASE_ANON_KEY);
