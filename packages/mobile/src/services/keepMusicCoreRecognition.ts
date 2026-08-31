import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { CanonicalTrack, MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import type { KeepVisibility } from '../types';
import { getSupabaseAccessToken, supabase } from './supabaseClient';
import { getSharedMusicSource } from './sharedMusicSourceService';
import { APP_NAME } from '../config/brand';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DEVICE_KEY = '@keep/music-device-id-v1';
const FALLBACK_RECHECK_MS = 30 * 1000;
const PROVIDER_RATE_LIMIT_BACKOFF_MS = 65 * 1000;
const KEYLESS_SOURCE_RECHECK_MS = 15 * 1000;
let fallbackUnavailableUntil = 0;
let recognitionBackoffUntil = 0;
let lastKeylessSourceSignature = '';
let lastKeylessSourceAttemptAt = 0;

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
 * Enregistre le morceau gardé dans le profil réel quand un compte est connecté.
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

/** Met à jour uniquement la visibilité d'un morceau gardé appartenant au compte actif. */
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
 * Lorsqu'un membre avait d'abord récupéré gratuitement un titre depuis un
 * autre profil, puis le reconnaît ensuite lui-même avec Écouter, sa propre
 * écoute devient la source de ses futurs partages. Le morceau gardé reste unique et
 * l'ancienne provenance sociale reste conservée dans l'historique serveur.
 */
export async function markDirectRediscovery(
  trackId: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY) || !supabase) return false;
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return false;
  const { data, error } = await supabase.rpc('keep_mark_direct_rediscovery', {
    p_track_id: trackId,
    p_context: context,
  });
  if (error) return false;
  return data === true;
}

export interface PersistedKeepDecision {
  decisionId: string;
  visibility: KeepVisibility;
  createdAt: string;
  detectedAt: string;
  sessionId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
  creditPolicy: 'LISTEN_KEEP' | 'SOCIAL_ZERO_CREDIT';
  track: CanonicalTrack;
}

/**
 * Recharge les morceaux gardés d'un compte depuis Supabase.
 *
 * L'historique détaillé de session reste disponible hors-ligne dans
 * AsyncStorage, mais le profil musical (Loki DNA / morceaux gardés) ne doit pas
 * dépendre d'un seul navigateur ou téléphone. Cette lecture transforme donc
 * les décisions persistées côté serveur en CanonicalTrack réutilisables par le
 * store local après une mise à jour, une reconnexion ou un nouvel appareil.
 */
export async function loadOwnPersistedKeeps(limit = 750): Promise<PersistedKeepDecision[]> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY) || !supabase) return [];
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return [];

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/keep_decisions`);
  url.searchParams.set('select', 'id,profile_id,visibility,created_at,context,source_user_id,source:profiles!keep_decisions_source_user_id_fkey(username),track:tracks(id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,external_urls,available_on)');
  url.searchParams.set('profile_id', `eq.${userId}`);
  url.searchParams.set('decision', 'eq.KEPT');
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 1000))));

  const response = await fetch(url.toString(), { headers: baseHeaders(accessToken) });
  const rows = await parseResponse(response);
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row: any): PersistedKeepDecision[] => {
    if (String(row?.profile_id || '') !== userId) return [];
    const track = Array.isArray(row?.track) ? row.track[0] : row?.track;
    const source = Array.isArray(row?.source) ? row.source[0] : row?.source;
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
      sourceProfileId: row.source_user_id ? String(row.source_user_id) : undefined,
      sourceUsername: source?.username ? String(source.username) : undefined,
      creditPolicy: context.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL_ZERO_CREDIT' : 'LISTEN_KEEP',
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
  functionName: 'keep-music-core' | 'keep-music-recognition-v2' | 'keep-music-fallback' | 'keep-music-memory',
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
        'x-keep-platform': Platform.OS,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch (error: any) {
    return { ok: false, status: 0, payload: { error: 'network_error', message: error?.message ?? 'Réseau indisponible' } };
  }
}

/**
 * Mémoire musicale collective Loki : empreintes calculées localement à
 * partir des extraits légaux déjà récupérés (Deezer/iTunes) quand un
 * morceau a été identifié avec confiance une première fois (recherche
 * manuelle ou partage). Couvre le contenu indépendant/underground absent
 * des catalogues AudD/ACRCloud, à condition qu'il ait déjà été vu une fois.
 */
async function keepMemoryRecognition(blob: Blob, accessToken: string | null, deviceId: string): Promise<RecognitionResult | null> {
  const attempt = await recognitionAttempt('keep-music-memory', blob, accessToken, deviceId);
  if (attempt.ok && attempt.payload?.recognition) return attempt.payload.recognition as RecognitionResult;
  return null;
}

async function keylessSourceRecognition(accessToken: string | null): Promise<RecognitionResult | null> {
  const source = await getSharedMusicSource();
  if (!source) return null;

  const signature = `${source.sharedAt}|${source.url}|${source.title ?? ''}|${source.rawText ?? ''}`;
  const now = Date.now();
  if (signature === lastKeylessSourceSignature && now - lastKeylessSourceAttemptAt < KEYLESS_SOURCE_RECHECK_MS) return null;
  lastKeylessSourceSignature = signature;
  lastKeylessSourceAttemptAt = now;

  try {
    const response = await fetch(`${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/keep-music-keyless-source`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: source.url,
        rawText: source.rawText ?? null,
        title: source.title ?? null,
        platform: source.platform,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.recognition) return null;
    return payload.recognition as RecognitionResult;
  } catch {
    // Le mode sans clé est best-effort et ne doit jamais interrompre le micro.
    return null;
  }
}

/**
 * Recherche manuelle par texte (artiste/titre tapé par l'utilisateur) quand
 * l'empreinte audio ne trouve rien -- typiquement du contenu indépendant/
 * underground absent des catalogues commerciaux AudD/ACRCloud. Réutilise le
 * même moteur gratuit sans clé que le partage social (Apple + Deezer,
 * scoring par recouvrement de tokens), juste avec un texte fourni à la main
 * au lieu d'une page scrappée.
 */
export async function searchTrackByText(query: string): Promise<RecognitionResult | null> {
  const trimmed = query.trim();
  if (!trimmed || !configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return null;
  // Un lien Spotify/Deezer/Apple Music/SoundCloud/Tidal collé donne une bien
  // meilleure preuve qu'un titre tapé à la main -- keep-music-keyless-source
  // sait déjà lire ces hôtes (lookup exact Apple/Deezer, page title sinon) et
  // applique un seuil de confiance plus permissif que pour du texte libre.
  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  const body = looksLikeUrl ? { url: trimmed } : { title: trimmed };
  try {
    const accessToken = await getSupabaseAccessToken();
    const response = await fetch(`${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/keep-music-keyless-source`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.recognition) return null;
    return payload.recognition as RecognitionResult;
  } catch {
    return null;
  }
}

function fallbackKnownUnavailable() {
  return Date.now() < fallbackUnavailableUntil;
}

function markFallbackUnavailable() {
  fallbackUnavailableUntil = Date.now() + FALLBACK_RECHECK_MS;
}

/**
 * Reconnaissance musicale en cascade :
 * 1. AudD via `keep-music-recognition-v2` (clé serveur/Vault validée),
 * 2. ACRCloud via `keep-music-fallback` uniquement si AudD ne reconnaît pas
 *    le morceau ou rencontre un incident,
 * 3. sans clé : métadonnées publiques du partage social + catalogue iTunes.
 *
 * Spotify/YouTube/Deezer/Apple servent ensuite à enrichir le morceau reconnu ;
 * ils ne sont jamais présentés comme des moteurs d'empreinte audio eux-mêmes.
 */
export class KeepMusicCoreRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-music-recognition-v2';

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) {
      throw new Error(`Reconnaissance ${APP_NAME} indisponible : Supabase n’est pas configuré.`);
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });
    if (!blob.size) return null;
    // Un 429 précédent ne doit ni afficher une erreur rouge ni relancer le
    // serveur à chaque échantillon. L'écoute reste active et reprend seule.
    if (Date.now() < recognitionBackoffUntil) return null;

    const [accessToken, deviceId] = await Promise.all([getSupabaseAccessToken(), getDeviceId()]);

    // AJOUT P0 (31/08/2026, demande Adel : "notre systeme devrait devenir de
    // plus en plus intelligent et retenir les musiques deja ecoutees" --
    // constate en reel avec un second compte/appareil qui redetectait trop
    // lentement un morceau deja reconnu une premiere fois). La memoire Loki
    // (empreinte acoustique auto-alimentee a chaque reconnaissance reussie,
    // collective entre TOUS les utilisateurs) etait verifiee EN DERNIER, apres
    // AudD ET ACRCloud -- donc meme un morceau deja appris par le systeme
    // attendait deux allers-retours vers des fournisseurs externes avant
    // d'etre retrouve. Verifiee ici en premier : auto-hebergee (pas de
    // latence/quota externe), et seulement peuplee depuis des matchs deja
    // confirmes avec confiance -- donc pas moins fiable, seulement plus
    // rapide pour ce cas precis.
    const memory = await keepMemoryRecognition(blob, accessToken, deviceId);
    if (memory) {
      recognitionBackoffUntil = 0;
      fallbackUnavailableUntil = 0;
      return memory;
    }

    const primary = await recognitionAttempt('keep-music-recognition-v2', blob, accessToken, deviceId);
    const primaryRateLimited = primary.status === 429 || primary.payload?.error === 'recognition_rate_limited';
    if (primary.ok && primary.payload?.recognition) {
      recognitionBackoffUntil = 0;
      return primary.payload.recognition as RecognitionResult;
    }

    // Si ACRCloud a déjà répondu « non configuré », ne pas répéter à chaque
    // extrait le même aller-retour 409. On retente périodiquement pour que
    // l'activation future dans le Super Admin soit prise en compte sans reload.
    if (fallbackKnownUnavailable()) {
      const keyless = await keylessSourceRecognition(accessToken);
      if (keyless) {
        recognitionBackoffUntil = 0;
        return keyless;
      }
      if (primaryRateLimited) recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
      // AudD/ACRCloud absents ou indisponibles ne deviennent jamais une erreur
      // rouge utilisateur : Loki continue d'écouter et le partage social reste actif.
      return null;
    }

    // Un no-match AudD ou une erreur fournisseur déclenche le second moteur.
    // Le même échantillon est réutilisé : aucune nouvelle capture micro n'est
    // nécessaire et le morceau reste dans la session dès qu'un moteur répond.
    const fallback = await recognitionAttempt('keep-music-fallback', blob, accessToken, deviceId);
    if (fallback.ok && fallback.payload?.recognition) {
      fallbackUnavailableUntil = 0;
      recognitionBackoffUntil = 0;
      return fallback.payload.recognition as RecognitionResult;
    }

    const keyless = await keylessSourceRecognition(accessToken);
    if (keyless) {
      recognitionBackoffUntil = 0;
      return keyless;
    }

    if (fallback.status === 429 || fallback.payload?.error === 'fallback_rate_limited') {
      recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
      return null;
    }

    if (fallback.status === 409 || fallback.payload?.error === 'fallback_not_configured') {
      markFallbackUnavailable();
      if (primaryRateLimited) {
        recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
        return null;
      }
      return null;
    }

    // Avec ou sans fournisseur payant, une panne de reconnaissance ne coupe
    // jamais la session. Le micro continue et le moteur sans clé sera retenté
    // dès qu'un nouveau partage social fournit des métadonnées exploitables.
    return null;
  }
}

export const isSecureRecognitionConfigured = configured(SUPABASE_URL) && configured(SUPABASE_ANON_KEY);
