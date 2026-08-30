import { create } from 'zustand';
import { CanonicalTrack, RecognitionResult } from '@keep/music';
import { KeepSession, KeepVisibility, SessionTrackEntry, SessionTrackStatus } from '../types';
import { musicEngine } from '../services/musicEngine';
import { commitKeep } from '../services/keepTrackAction';
import { markDirectRediscovery, searchTrackByText, updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';
import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError, prepareAudioCaptureFromUserGesture } from '../services/micCapture';
import { checkConnectedLibraries } from '../services/connectedMusicLibrary';
import { clearSharedMusicSource, getSharedMusicSource } from '../services/sharedMusicSourceService';
import { prepareRecognitionNotifications } from '../services/recognitionNotificationService';
import { useSessionHistoryStore } from './useSessionHistoryStore';

const RECOGNITION_TICK_MS = 700;
// Le serveur autorise 12 fingerprints/minute par identité. Un départ toutes les
// 5 secondes exploite cette fenêtre sans la dépasser et retire le trou de 8 s
// qui faisait rater les changements rapides de morceau.
const MIN_RECOGNITION_ATTEMPT_GAP_MS = 5000;
const NEW_MATCH_COOLDOWN_MS = 6000;
const SAME_TRACK_COOLDOWN_MS = 7000;
const SILENCE_CHECK_INTERVAL_MS = 15000;
export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 15;
const SILENCE_PROMPT_GRACE_MS = 60 * 1000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalize(value: string | undefined): string {
  return (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function sameTrack(a: CanonicalTrack, b: CanonicalTrack): boolean {
  if (a.isrc && b.isrc) return a.isrc.toUpperCase() === b.isrc.toUpperCase();
  return normalize(a.title) === normalize(b.title) && normalize(a.artist) === normalize(b.artist);
}

function isCreditsExhausted(error: unknown): boolean {
  return error instanceof Error && error.message === 'CREDITS_EXHAUSTED';
}

async function withSoftTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function findExistingTrack(track: CanonicalTrack) {
  const [connected, session] = await Promise.all([
    withSoftTimeout(checkConnectedLibraries(track), 900),
    musicEngine.getSession(),
  ]);
  const playlists = await withSoftTimeout(musicEngine.musicProvider.getPlaylists(session), 1000) ?? [];
  if (connected?.exists && connected.match) {
    return {
      session,
      playlists,
      match: {
        playlistId: connected.match.playlistId,
        playlistName: connected.match.playlistName,
        provider: connected.match.provider,
        decisionId: connected.match.decisionId,
        trackId: connected.match.trackId,
      },
    };
  }
  if (!musicEngine.usesDemoMusicProvider) return { session, playlists, match: undefined };
  for (const playlist of playlists) {
    const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
    if (tracks.some((candidate) => sameTrack(candidate, track))) {
      return { session, playlists, match: { playlistId: playlist.id, playlistName: playlist.name, provider: session.provider } };
    }
  }
  return { session, playlists, match: undefined };
}

interface SessionStore {
  isActive: boolean;
  sessionId: string | null;
  startedAt: string | null;
  tracks: SessionTrackEntry[];
  silenceTimeoutMin: number;
  showEndPrompt: boolean;
  recognizing: boolean;
  micLevel: number;
  error: string | null;
  signalHint: string | null;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  startSession: () => void;
  requestEndSession: (title?: string) => string | null;
  dismissEndPrompt: () => void;
  keepTrack: (entryId: string, playlistId?: string, visibility?: KeepVisibility) => Promise<void>;
  passTrack: (entryId: string) => void;
  setTrackVisibility: (entryId: string, visibility: KeepVisibility) => Promise<void>;
  keepAllPending: () => Promise<void>;
  setSilenceTimeoutMin: (minutes: number) => void;
  attachLocation: (label: string, lat?: number, lng?: number) => void;
  submitManualSearch: (query: string) => Promise<'added' | 'duplicate' | 'not_found'>;
}

function persistLiveSession(state: SessionStore) {
  if (!state.isActive || !state.sessionId || !state.startedAt || state.tracks.length === 0) return;
  useSessionHistoryStore.getState().upsertSession({
    id: state.sessionId,
    startedAt: state.startedAt,
    endedAt: null,
    title: null,
    locationLabel: state.locationLabel,
    lat: state.lat,
    lng: state.lng,
    tracks: state.tracks,
  });
}

function applyTrackEnrichment(
  sessionId: string,
  entryId: string,
  patch: Pick<SessionTrackEntry, 'recommendations' | 'status' | 'existingMatch'>,
) {
  const enrich = (entry: SessionTrackEntry): SessionTrackEntry => {
    if (entry.id !== entryId) return entry;
    if (entry.status !== 'pending') {
      return { ...entry, recommendations: patch.recommendations };
    }
    return { ...entry, ...patch };
  };

  const live = useSessionStore.getState();
  if (live.isActive && live.sessionId === sessionId) {
    useSessionStore.setState((state) => ({ tracks: state.tracks.map(enrich) }));
    persistLiveSession(useSessionStore.getState());
  }

  useSessionHistoryStore.setState((state) => ({
    sessions: state.sessions.map((session) => session.id !== sessionId
      ? session
      : { ...session, tracks: session.tracks.map(enrich) }),
  }));
}

type SetFn = (partial: SessionStore | Partial<SessionStore> | ((state: SessionStore) => SessionStore | Partial<SessionStore>)) => void;
type GetFn = () => SessionStore;

// Chemin commun à une détection micro/onglet réussie ET à une recherche
// manuelle (texte tapé par l'utilisateur quand l'empreinte audio ne
// reconnaît pas le morceau) -- les deux doivent produire exactement la même
// carte GARDER/PASSER, avec le même enrichissement playlists/liens.
async function applyDetectedTrack(
  set: SetFn,
  get: GetFn,
  recognition: RecognitionResult,
  source: 'listen' | 'manual-search',
): Promise<'added' | 'duplicate' | 'inactive'> {
  const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
  const last = get().tracks[0];
  if (last && sameTrack(last.track, track)) {
    lastDetectionAt = Date.now();
    nextRecognitionAllowedAt = Date.now() + SAME_TRACK_COOLDOWN_MS;
    set({ recognizing: false, micLevel: 0, showEndPrompt: false, error: null, signalHint: null });
    return 'duplicate';
  }

  const sessionIdAtDetection = get().sessionId;
  if (!sessionIdAtDetection) {
    set({ recognizing: false, micLevel: 0, error: null });
    return 'inactive';
  }

  const entry: SessionTrackEntry = {
    id: newId(),
    track,
    recommendations: [],
    status: 'pending',
    detectedAt: new Date().toISOString(),
  };
  lastDetectionAt = Date.now();
  nextRecognitionAllowedAt = Date.now() + NEW_MATCH_COOLDOWN_MS;
  set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, micLevel: 0, showEndPrompt: false, error: null, signalHint: null }));
  persistLiveSession(get());

  void (async () => {
    try {
      const { session, playlists, match } = await findExistingTrack(track);
      const sharedSource = await getSharedMusicSource().catch(() => null);
      if (!sharedSource && match?.decisionId && match?.trackId) {
        await markDirectRediscovery(match.trackId, {
          source,
          sessionId: sessionIdAtDetection,
          detectedAt: entry.detectedAt,
        }).catch(() => false);
      }
      const recommendations = match ? [] : await musicEngine.router.recommend(session.userId, track, playlists);
      applyTrackEnrichment(sessionIdAtDetection, entry.id, {
        recommendations,
        status: match ? 'already_saved' : 'pending',
        existingMatch: match,
      });
    } catch {
      // Le morceau reste pending et disponible dans la session.
    }
  })();
  return 'added';
}

let tickHandle: ReturnType<typeof setInterval> | null = null;
let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;
let silencePromptGraceHandle: ReturnType<typeof setTimeout> | null = null;
let lastDetectionAt = 0;
let nextRecognitionAllowedAt = 0;
let consecutiveNoMatches = 0;
let consecutiveWeakSamples = 0;
// Seuil sur le pic linéaire pré-gain (même échelle que le garde-fou silence
// à 0.004 dans micCapture.ts) : sous cette valeur, même après amplification
// x10, le signal est trop faible pour qu'une empreinte fiable en sorte --
// c'est distinct d'un vrai "aucune correspondance" catalogue.
const WEAK_SIGNAL_PEAK = 0.05;

function recognitionSampleDurationMs() {
  // Premier essai court = résultat plus vite. Après un no-match, KEEP donne au
  // fournisseur un extrait plus long pour améliorer la couverture sans rendre
  // chaque tentative lente par défaut.
  if (consecutiveNoMatches >= 3) return 7500;
  if (consecutiveNoMatches >= 1) return 6000;
  return 4500;
}

function clearTimers() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }
  if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  isActive: false,
  sessionId: null,
  startedAt: null,
  tracks: [],
  silenceTimeoutMin: DEFAULT_SESSION_SILENCE_TIMEOUT_MIN,
  showEndPrompt: false,
  recognizing: false,
  micLevel: 0,
  error: null,
  signalHint: null,
  locationLabel: undefined,
  lat: undefined,
  lng: undefined,

  startSession: () => {
    // Doit être appelé dans le geste tactile d'origine pour Samsung Internet /
    // Chrome Android, sinon WebAudio peut rester suspendu après le clic.
    prepareAudioCaptureFromUserGesture();
    clearTimers();
    void cancelAudioCapture();
    void prepareRecognitionNotifications();
    // Une écoute lancée normalement ne doit jamais reprendre une ancienne URL
    // TikTok/Instagram. Le handoff social pose sa nouvelle source juste après.
    void clearSharedMusicSource();
    useSessionHistoryStore.getState().reconcileOrphanedLiveSessions(null);
    lastDetectionAt = Date.now();
    nextRecognitionAllowedAt = 0;
    consecutiveNoMatches = 0;
    consecutiveWeakSamples = 0;
    set({ isActive: true, sessionId: newId(), startedAt: new Date().toISOString(), tracks: [], showEndPrompt: false, recognizing: false, micLevel: 0, error: null, signalHint: null, locationLabel: undefined, lat: undefined, lng: undefined });

    const tick = async () => {
      if (!get().isActive || get().recognizing) return;
      const now = Date.now();
      if (now < nextRecognitionAllowedAt) return;
      nextRecognitionAllowedAt = now + MIN_RECOGNITION_ATTEMPT_GAP_MS;
      set({ recognizing: true });
      let samplePeak: number | null = null;
      try {
        const sampleDuration = recognitionSampleDurationMs();
        const audioSample = musicEngine.isDemoMode
          ? new ArrayBuffer(0)
          : await captureAudioSample(
              (level) => { if (get().isActive) set({ micLevel: level }); },
              sampleDuration,
              (peak) => { samplePeak = peak; },
            );
        if (!get().isActive) { set({ recognizing: false, micLevel: 0, error: null }); return; }
        const recognition = await musicEngine.recognitionProvider.recognize(audioSample);
        if (!get().isActive) { set({ recognizing: false, micLevel: 0, error: null }); return; }
        if (!recognition) {
          consecutiveNoMatches = Math.min(5, consecutiveNoMatches + 1);
          consecutiveWeakSamples = samplePeak !== null && samplePeak < WEAK_SIGNAL_PEAK ? consecutiveWeakSamples + 1 : 0;
          const signalHint = consecutiveWeakSamples >= 2
            ? 'Son un peu faible pour l’instant -- rapproche le téléphone de la musique.'
            : null;
          set({ recognizing: false, micLevel: 0, error: null, signalHint });
          return;
        }
        consecutiveNoMatches = 0;
        consecutiveWeakSamples = 0;
        await applyDetectedTrack(set, get, recognition, 'listen');
      } catch (e: any) {
        if (e instanceof MicCaptureCancelledError || !get().isActive) { set({ recognizing: false, micLevel: 0, error: null }); return; }
        set({ recognizing: false, micLevel: 0, error: e?.message ?? 'Erreur de reconnaissance' });
      }
    };

    void tick();
    tickHandle = setInterval(() => { void tick(); }, RECOGNITION_TICK_MS);
    silenceCheckHandle = setInterval(() => {
      const { isActive, silenceTimeoutMin, showEndPrompt } = get();
      if (!isActive || showEndPrompt) return;
      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) {
        set({ showEndPrompt: true });
        if (silencePromptGraceHandle) clearTimeout(silencePromptGraceHandle);
        silencePromptGraceHandle = setTimeout(() => {
          silencePromptGraceHandle = null;
          const current = get();
          if (current.isActive && current.showEndPrompt) current.requestEndSession();
        }, SILENCE_PROMPT_GRACE_MS);
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  },

  dismissEndPrompt: () => {
    if (silencePromptGraceHandle) { clearTimeout(silencePromptGraceHandle); silencePromptGraceHandle = null; }
    lastDetectionAt = Date.now();
    set({ showEndPrompt: false });
  },

  requestEndSession: (title) => {
    clearTimers();
    void cancelAudioCapture();
    void clearSharedMusicSource();
    const s = get();
    if (!s.sessionId || !s.startedAt) return null;
    const session: KeepSession = { id: s.sessionId, startedAt: s.startedAt, endedAt: new Date().toISOString(), title: title ?? null, locationLabel: s.locationLabel, lat: s.lat, lng: s.lng, tracks: s.tracks };
    if (session.tracks.length > 0) useSessionHistoryStore.getState().upsertSession(session);
    set({ isActive: false, sessionId: null, startedAt: null, tracks: [], showEndPrompt: false, recognizing: false, micLevel: 0, error: null, signalHint: null, locationLabel: undefined, lat: undefined, lng: undefined });
    return session.tracks.length > 0 ? session.id : null;
  },

  keepTrack: async (entryId, playlistId, visibility = 'PRIVATE') => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry || entry.status === 'already_saved' || entry.status !== 'pending') return;
    try {
      const sharedSource = await getSharedMusicSource();
      const sourceContext = sharedSource ? {
        source: 'social-share',
        sourcePlatform: sharedSource.platform,
        sourceUrl: sharedSource.url,
        sourceTitle: sharedSource.title ?? null,
        sourceSharedAt: sharedSource.sharedAt,
      } : { source: 'listen' };
      const { targetPlaylistId, keepDecisionId, profileSyncFailed } = await commitKeep(entry.track, entry.recommendations, playlistId, {
        visibility,
        context: { sessionId: get().sessionId, detectedAt: entry.detectedAt, ...sourceContext },
      });
      set((s) => ({ tracks: s.tracks.map((t) => t.id === entryId ? { ...t, status: 'kept' as SessionTrackStatus, keptPlaylistId: targetPlaylistId, visibility, keepDecisionId, creditLocked: false } : t), error: profileSyncFailed ? 'Morceau gardé. La visibilité du profil sera resynchronisée à la prochaine connexion.' : null }));
      persistLiveSession(get());
    } catch (e: any) {
      if (isCreditsExhausted(e)) {
        set((s) => ({ tracks: s.tracks.map((t) => t.id === entryId ? { ...t, status: 'pending' as SessionTrackStatus, creditLocked: true } : t), error: 'Crédits gratuits utilisés : ce morceau reste en attente dans Mes Sessions. Tu peux continuer à écouter et le débloquer plus tard.' }));
        persistLiveSession(get());
        return;
      }
      set({ error: e?.message ?? 'Erreur lors du rangement' });
    }
  },

  passTrack: (entryId) => {
    set((s) => ({ tracks: s.tracks.map((t) => t.id === entryId ? { ...t, status: 'passed' as SessionTrackStatus, creditLocked: false } : t), error: null }));
    persistLiveSession(get());
  },

  setTrackVisibility: async (entryId, visibility) => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry || entry.status !== 'kept') return;
    try {
      if (entry.keepDecisionId) await updateKeepDecisionVisibility(entry.keepDecisionId, visibility);
      set((s) => ({ tracks: s.tracks.map((t) => t.id === entryId ? { ...t, visibility } : t), error: null }));
      persistLiveSession(get());
    } catch (e: any) { set({ error: e?.message ?? 'Impossible de modifier la visibilité de ce KEEP.' }); }
  },

  keepAllPending: async () => {
    const pending = get().tracks.filter((t) => t.status === 'pending');
    for (const entry of pending) {
      await get().keepTrack(entry.id, undefined, 'PRIVATE');
      const refreshed = get().tracks.find((t) => t.id === entry.id);
      if (refreshed?.creditLocked) {
        set((s) => ({ tracks: s.tracks.map((t) => t.status === 'pending' ? { ...t, creditLocked: true } : t) }));
        persistLiveSession(get());
        break;
      }
    }
  },

  setSilenceTimeoutMin: (minutes) => set({ silenceTimeoutMin: minutes }),
  attachLocation: (label, lat, lng) => { set({ locationLabel: label, lat, lng }); persistLiveSession(get()); },

  submitManualSearch: async (query) => {
    const trimmed = query.trim();
    if (!trimmed || !get().isActive) return 'not_found';
    const recognition = await searchTrackByText(trimmed).catch(() => null);
    if (!recognition) return 'not_found';
    const outcome = await applyDetectedTrack(set, get, recognition, 'manual-search');
    return outcome === 'inactive' ? 'not_found' : outcome;
  },
}));
