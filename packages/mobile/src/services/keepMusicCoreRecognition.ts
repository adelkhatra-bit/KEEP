import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import type { CanonicalTrack, MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import type { KeepVisibility } from '../types';
import { getSupabaseAccessToken, supabase } from './supabaseClient';
import { getSharedMusicSource } from './sharedMusicSourceService';
import { APP_NAME } from '../config/brand';
import { updateRecognitionConsensus, type RecognitionConsensusState } from './recognitionConsensus';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DEVICE_KEY = '@keep/music-device-id-v1';
const FALLBACK_RECHECK_MS = 30 * 1000;
const FALLBACK_QUOTA_RECHECK_MS = 6 * 60 * 60 * 1000;
const PRIMARY_RECHECK_MS = 5 * 60 * 1000;
const PROVIDER_RATE_LIMIT_BACKOFF_MS = 65 * 1000;
// Économie FREE 04/10/2026 : les fast-paths gratuits restent réactifs, mais
// aucun fournisseur payant ne doit recevoir plus d'un extrait toutes les 20 s.
const PAID_PROVIDER_MIN_GAP_MS = 20 * 1000;
const DEFAULT_RECOGNIZED_TRACK_REMAINING_MS = 75 * 1000;
const MAX_RECOGNIZED_TRACK_REMAINING_MS = 4 * 60 * 1000;
// 04/10/2026: AudD renvoie actuellement recognition_not_configured (409) en production.
// ACRCloud est configuré et devient le moteur serveur prioritaire. AudD reste déployé
// mais hors du chemin normal tant qu'une clé valide n'est pas explicitement réactivée.
const AUDD_PRIMARY_ENABLED = false;
const KEYLESS_SOURCE_RECHECK_MS = 15 * 1000;
let fallbackUnavailableUntil = 0;
let primaryUnavailableUntil = 0;
let recognitionBackoffUntil = 0;
let fallbackConsensus: RecognitionConsensusState | null = null;
let lastPaidProviderAttemptAt = 0;
let paidProviderSuppressedUntil = 0;
let nextPaidListenUsesFree = false;

export function authorizeNextPaidListenWithFree(): void {
  nextPaidListenUsesFree = true;
}

export function clearNextPaidListenFreeAuthorization(): void {
  nextPaidListenUsesFree = false;
}

function paidListenAuthorizationActive(): boolean {
  return nextPaidListenUsesFree;
}

function estimatedPaidProviderSuppressionMs(recognition: RecognitionResult): number {
  const durationSec = Number(recognition.durationSec);
  const offsetSec = Number(recognition.recognizedOffsetSec);
  if (Number.isFinite(durationSec) && durationSec > 0) {
    const estimatedRemainingSec = Number.isFinite(offsetSec) && offsetSec >= 0
      ? Math.max(0, durationSec - offsetSec)
      : Math.max(45, durationSec * 0.5);
    return Math.max(
      PAID_PROVIDER_MIN_GAP_MS,
      Math.min(MAX_RECOGNIZED_TRACK_REMAINING_MS, (estimatedRemainingSec + 5) * 1000),
    );
  }
  return DEFAULT_RECOGNIZED_TRACK_REMAINING_MS;
}

/**
 * Une reconnaissance confirmée ferme les fournisseurs payants jusqu'à la fin
 * estimée du titre. Les fast-paths gratuits (ShazamKit/mémoire/lien partagé)
 * restent actifs et peuvent donc détecter le morceau suivant sans coût.
 */
export function noteSuccessfulRecognitionForPaidSuppression(recognition: RecognitionResult): void {
  paidProviderSuppressedUntil = Math.max(
    paidProviderSuppressedUntil,
    Date.now() + estimatedPaidProviderSuppressionMs(recognition),
  );
}

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
}

// AJOUT (02/09/2026, demande Adel : "je suis dans la voiture, la musique est
// longue -- si l'écoute a déjà identifié le morceau, il ne faut pas qu'elle
// continue à nous faire payer pour la même chanson encore en train de jouer.
// Un système intelligent qui détecte que ce n'est pas une nouvelle musique.")
// Tant qu'un morceau vient d'être identifié (par n'importe quel palier), un
// raté de la mémoire gratuite ne relance plus tout de suite AudD/ACRCloud
// (payants) -- Loki suppose d'abord qu'il s'agit toujours de la même chanson
// (bruit de fond, silence entre deux passages, couplet différent) et attend
// un second raté consécutif avant de conclure que la musique a changé et de
// rouvrir la cascade payante. Le morceau reste affiché normalement dans la
// session pendant ce temps ; seule la dépense réseau est mise en pause.
const STICKY_MATCH_WINDOW_MS = 3 * 60 * 1000;
const STICKY_MEMORY_MISS_TOLERANCE = 2;
let stickyMatchUntil = 0;
let stickyMemoryMissStreak = 0;

function armStickyMatch() {
  stickyMatchUntil = Date.now() + STICKY_MATCH_WINDOW_MS;
  stickyMemoryMissStreak = 0;
}
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
        previewUrl: track.previewUrl,
        genres: track.genres ?? [],
        providerIds: track.providerIds ?? {},
        externalUrls: track.externalUrls ?? {},
        availableOn: track.availableOn ?? [],
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

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export interface PersistedKeepDecision {
  decisionId: string;
  visibility: KeepVisibility;
  createdAt: string;
  detectedAt: string;
  sessionId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
  originSource?: string;
  importedFrom?: 'spotify' | 'deezer' | 'apple_music' | 'youtube_music' | 'soundcloud' | 'tidal';
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

  // Source de vérité : la session Supabase courante. Ne jamais dépendre du
  // store UI pour retrouver la bibliothèque après un OTA/rechargement.
  let { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    if (refreshed?.data?.session) sessionData = refreshed.data;
  }
  const userId = sessionData.session?.user?.id;
  if (!userId) return [];

  // IMPORTANT : deux lectures simples au lieu d'un embed PostgREST
  // keep_decisions -> tracks -> profiles. L'ancien URL REST imbriqué pouvait
  // échouer entièrement si PostgREST ne résolvait plus une relation/permission,
  // puis MyMusicScreen avalait l'erreur et affichait une bibliothèque vide
  // alors que les données existaient encore. Ici une relation optionnelle ne
  // peut plus faire disparaître les morceaux d'un utilisateur.
  const { data: decisionRows, error: decisionError } = await supabase
    .from('keep_decisions')
    .select('id,profile_id,track_id,visibility,created_at,context,source_user_id,source_type')
    .eq('profile_id', userId)
    .eq('decision', 'KEPT')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 1000)));
  if (decisionError) throw decisionError;
  if (!decisionRows?.length) return [];

  const trackIds = [...new Set(decisionRows.map((row: any) => String(row.track_id || '')).filter(validUuid))];
  if (!trackIds.length) return [];

  const { data: trackRows, error: trackError } = await supabase
    .from('tracks')
    .select('id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,external_urls,available_on')
    .in('id', trackIds);
  if (trackError) throw trackError;

  const tracksById = new Map((trackRows ?? []).map((row: any) => [String(row.id), row]));
  const sourceIds = [...new Set(decisionRows.map((row: any) => String(row.source_user_id || '')).filter(validUuid))];
  const sourceNames = new Map<string, string>();
  if (sourceIds.length) {
    const { data: sourceRows } = await supabase.from('profiles').select('id,username').in('id', sourceIds);
    for (const row of sourceRows ?? []) {
      if (row?.id && row?.username) sourceNames.set(String(row.id), String(row.username));
    }
  }

  return decisionRows.flatMap((row: any): PersistedKeepDecision[] => {
    if (String(row?.profile_id || '') !== userId) return [];
    const track = tracksById.get(String(row?.track_id || '')) as any;
    if (!row?.id || !track?.id || !track?.title || !track?.artist) return [];

    const context = row?.context && typeof row.context === 'object' ? row.context : {};
    const createdAt = String(row.created_at || new Date().toISOString());
    const detectedAt = typeof context.detectedAt === 'string' && context.detectedAt ? context.detectedAt : createdAt;
    const sessionId = typeof context.sessionId === 'string' && context.sessionId ? context.sessionId : undefined;
    const visibility: KeepVisibility = row.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    const contextSourceProfileId = typeof context.sourceProfileId === 'string' && context.sourceProfileId.trim()
      ? context.sourceProfileId.trim()
      : undefined;
    const sourceProfileId = row.source_user_id ? String(row.source_user_id) : contextSourceProfileId;
    const sourceUsername = sourceProfileId
      ? sourceNames.get(sourceProfileId) || (typeof context.sourceUsername === 'string' && context.sourceUsername.trim() ? context.sourceUsername.trim() : undefined)
      : typeof context.sourceUsername === 'string' && context.sourceUsername.trim()
        ? context.sourceUsername.trim()
        : undefined;
    const creditPolicy: 'LISTEN_KEEP' | 'SOCIAL_ZERO_CREDIT' =
      context.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL_ZERO_CREDIT' : 'LISTEN_KEEP';
    const originSource = typeof context.source === 'string' && context.source.trim()
      ? context.source.trim()
      : row?.source_type
        ? String(row.source_type)
        : undefined;
    const importedFrom = ['spotify','deezer','apple_music','youtube_music','soundcloud','tidal'].includes(String(context.importedFrom || ''))
      ? String(context.importedFrom) as PersistedKeepDecision['importedFrom']
      : undefined;

    return [{
      decisionId: String(row.id),
      visibility,
      createdAt,
      detectedAt,
      sessionId,
      sourceProfileId,
      sourceUsername,
      originSource,
      importedFrom,
      creditPolicy,
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
  useFree = false,
): Promise<RecognitionAttempt> {
  const form = new FormData();
  form.append('audio', blob, `keep-sample.${audioExtension(blob)}`);
  try {
    // Expo SDK 54 recommande expo/fetch pour les uploads Blob/File natifs.
    // Le fetch React Native historique a été observé en production avec un
    // multipart de 255 octets malgré un enregistrement micro valide.
    const transportFetch: typeof fetch = Platform.OS === 'web' ? fetch : (expoFetch as unknown as typeof fetch);
    const response = await transportFetch(`${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'x-keep-device-id': deviceId,
        'x-keep-platform': Platform.OS,
        'x-keep-timezone': deviceTimeZone(),
        'x-keep-use-free': useFree ? '1' : '0',
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

/**
 * Fast path shared with the native provider. It lets iOS run ShazamKit and the
 * collective KEEP fingerprint memory concurrently instead of waiting for one
 * before starting the other. No paid provider is called here.
 */
export async function recognizeWithKeepMemoryFast(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return null;
  const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample], { type: 'audio/wav' });
  if (!blob.size || Date.now() < recognitionBackoffUntil) return null;
  const [accessToken, deviceId] = await Promise.all([getSupabaseAccessToken(), getDeviceId()]);
  const memory = await keepMemoryRecognition(blob, accessToken, deviceId);
  if (memory) {
    recognitionBackoffUntil = 0;
    fallbackUnavailableUntil = 0;
    armStickyMatch();
    noteSuccessfulRecognitionForPaidSuppression(memory);
  }
  return memory;
}

/**
 * Quand ShazamKit reconnait un titre sur iOS, on apprend aussi ce titre au
 * catalogue/memoire collective Loki via le resolver public Apple + Deezer.
 * L'appel est best-effort et n'allonge jamais la reconnaissance affichee.
 * Ainsi les succes natifs iPhone peuvent ensuite aider le web/Android via la
 * memoire Loki, meme si AudD/ACRCloud sont temporairement indisponibles.
 */
export async function learnRecognitionInBackground(recognition: RecognitionResult): Promise<void> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) return;
  const title = String(recognition?.title ?? '').trim();
  const artist = String(recognition?.artist ?? '').trim();
  if (!title || !artist) return;

  try {
    const [accessToken, deviceId] = await Promise.all([getSupabaseAccessToken(), getDeviceId()]);
    await fetch(`${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/keep-music-keyless-source`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `${artist} - ${title}`,
        rawText: `${artist} - ${title}`,
        platform: Platform.OS === 'ios' ? 'NATIVE_SHAZAM' : 'NATIVE_RECOGNITION',
        deviceId,
      }),
    });
  } catch {
    // Apprentissage opportuniste : aucun echec ne doit toucher l'UX Ecouter.
  }
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

function markFallbackUnavailable(durationMs = FALLBACK_RECHECK_MS) {
  fallbackUnavailableUntil = Date.now() + durationMs;
}

/**
 * Reconnaissance musicale en cascade :
 * 1. mémoire collective Loki,
 * 2. ACRCloud via `keep-music-fallback` (moteur serveur actif),
 * 3. AudD uniquement si sa clé est explicitement réactivée,
 * 4. sans clé : métadonnées publiques du partage social + catalogue iTunes.
 *
 * Spotify/YouTube/Deezer/Apple servent ensuite à enrichir le morceau reconnu ;
 * ils ne sont jamais présentés comme des moteurs d'empreinte audio eux-mêmes.
 */
export class KeepMusicCoreRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'keep-music-recognition-v2';

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    return this.recognizeInternal(audioSample, false);
  }

  async recognizeAfterMemory(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    return this.recognizeInternal(audioSample, true);
  }

  private async recognizeInternal(audioSample: ArrayBuffer | Blob, skipMemory: boolean): Promise<RecognitionResult | null> {
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
    if (!skipMemory) {
      const memory = await keepMemoryRecognition(blob, accessToken, deviceId);
      if (memory) {
        recognitionBackoffUntil = 0;
        fallbackUnavailableUntil = 0;
        armStickyMatch();
        return memory;
      }
    }

    // Musique probablement toujours la même qu'à l'instant : on laisse une
    // chance de plus à la mémoire gratuite avant de rouvrir AudD/ACRCloud.
    if (Date.now() < stickyMatchUntil) {
      stickyMemoryMissStreak += 1;
      if (stickyMemoryMissStreak < STICKY_MEMORY_MISS_TOLERANCE) return null;
      stickyMatchUntil = 0;
      stickyMemoryMissStreak = 0;
    }

    // ACRCloud est le moteur serveur principal tant qu'AudD n'a pas une clé
    // valide. Cela supprime les 409 AudD observés sur TestFlight/Web sans
    // désactiver la reconnaissance : le même échantillon part directement
    // vers le fournisseur réellement configuré.
    if (!fallbackKnownUnavailable() && Date.now() >= paidProviderSuppressedUntil && Date.now() - lastPaidProviderAttemptAt >= PAID_PROVIDER_MIN_GAP_MS) {
      const useFree = paidListenAuthorizationActive();
      lastPaidProviderAttemptAt = Date.now();
      const acr = await recognitionAttempt('keep-music-fallback', blob, accessToken, deviceId, useFree);

      const acrQuotaExhausted = acr.payload?.providerStatus === 3003
        || acr.payload?.providerUnavailable === 'quota_exhausted';
      if (acrQuotaExhausted) {
        markFallbackUnavailable(FALLBACK_QUOTA_RECHECK_MS);
        fallbackConsensus = null;
      }

      if (acr.ok && acr.payload?.recognition) {
        fallbackUnavailableUntil = 0;
        fallbackConsensus = null;
        recognitionBackoffUntil = 0;
        noteSuccessfulRecognitionForPaidSuppression(acr.payload.recognition as RecognitionResult);
        return acr.payload.recognition as RecognitionResult;
      }

      if (acr.ok && acr.payload?.candidateRecognition) {
        const decision = updateRecognitionConsensus(
          fallbackConsensus,
          acr.payload.candidateRecognition as RecognitionResult,
          Number(acr.payload.lowConfidenceScore ?? 0),
        );
        fallbackConsensus = decision.state;
        if (decision.accepted) {
          fallbackUnavailableUntil = 0;
          recognitionBackoffUntil = 0;
          noteSuccessfulRecognitionForPaidSuppression(decision.accepted);
          return decision.accepted;
        }
      }

      if (acr.status === 402 && acr.payload?.error === 'listen_free_required') {
        throw new Error('LISTEN_FREE_REQUIRED');
      }
      if (acr.status === 402 && acr.payload?.error === 'listen_free_insufficient') {
        clearNextPaidListenFreeAuthorization();
        throw new Error('LISTEN_FREE_INSUFFICIENT');
      }
      if (acr.status === 402 && acr.payload?.error === 'guest_listen_limit_reached') {
        throw new Error('GUEST_LISTEN_LIMIT_REACHED');
      }
      if (acr.status === 429 || acr.payload?.error === 'fallback_rate_limited') {
        recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
      }
      if (acr.status === 409 || acr.payload?.error === 'fallback_not_configured') {
        markFallbackUnavailable();
      }
    }

    // AudD reste disponible comme palier secondaire mais n'est plus appelé
    // tant qu'il n'est pas explicitement réactivé avec une clé valide.
    if (AUDD_PRIMARY_ENABLED) {
      const paidReady = Date.now() >= paidProviderSuppressedUntil && Date.now() - lastPaidProviderAttemptAt >= PAID_PROVIDER_MIN_GAP_MS;
      const audd = Date.now() < primaryUnavailableUntil || !paidReady
        ? { ok: false, status: 409, payload: { error: 'recognition_not_configured_cached' } }
        : await (async () => {
            const useFree = paidListenAuthorizationActive();
            lastPaidProviderAttemptAt = Date.now();
            return recognitionAttempt('keep-music-recognition-v2', blob, accessToken, deviceId, useFree);
          })();
      if (audd.ok && audd.payload?.recognition) {
        primaryUnavailableUntil = 0;
        fallbackConsensus = null;
        recognitionBackoffUntil = 0;
        noteSuccessfulRecognitionForPaidSuppression(audd.payload.recognition as RecognitionResult);
        return audd.payload.recognition as RecognitionResult;
      }
      if (audd.status === 402 && audd.payload?.error === 'listen_free_required') throw new Error('LISTEN_FREE_REQUIRED');
      if (audd.status === 402 && audd.payload?.error === 'listen_free_insufficient') { clearNextPaidListenFreeAuthorization(); throw new Error('LISTEN_FREE_INSUFFICIENT'); }
      if (audd.status === 402 && audd.payload?.error === 'guest_listen_limit_reached') throw new Error('GUEST_LISTEN_LIMIT_REACHED');
      if (audd.status === 409 || audd.payload?.error === 'recognition_not_configured') {
        primaryUnavailableUntil = Date.now() + PRIMARY_RECHECK_MS;
      }
    }

    const keyless = await keylessSourceRecognition(accessToken);
    if (keyless) {
      recognitionBackoffUntil = 0;
      noteSuccessfulRecognitionForPaidSuppression(keyless);
      return keyless;
    }

    // Avec ou sans fournisseur payant, une panne de reconnaissance ne coupe
    // jamais la session. Le micro continue et le moteur sans clé sera retenté
    // dès qu'un nouveau partage social fournit des métadonnées exploitables.
    return null;
  }
}

export const isSecureRecognitionConfigured = configured(SUPABASE_URL) && configured(SUPABASE_ANON_KEY);
