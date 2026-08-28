import { create } from 'zustand';
import { CanonicalTrack } from '@keep/music';
import { KeepSession, KeepVisibility, SessionTrackEntry, SessionTrackStatus } from '../types';
import { musicEngine } from '../services/musicEngine';
import { commitKeep } from '../services/keepTrackAction';
import { updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';
import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError } from '../services/micCapture';
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
export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 10;

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
    return { session, playlists, match: { playlistId: connected.match.playlistId, playlistName: connected.match.playlistName, provider: connected.match.provider } };
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

let tickHandle: ReturnType<typeof setInterval> | null = null;
let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;
let lastDetectionAt = 0;
let nextRecognitionAllowedAt = 0;
let consecutiveNoMatches = 0;

function recognitionSampleDurationMs() {
  // Premier essai court = résultat plus vite. Après un no-match, KEEP donne au
  // fournisseur un extrait plus long pour améliorer la couverture sans rendre
  // chaque tentative lente par défaut.
  if (consecutiveNoMatches >= 3) return 7000;
  if (consecutiveNoMatches >= 1) return 4800;
  return 3000;
}

function clearTimers() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  if (silenceCheckHandle) { clearInterval(silenceCheckHandle); silenceCheckHandle = null; }
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
  locationLabel: undefined,
  lat: undefined,
  lng: undefined,

  startSession: () => {
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
    set({ isActive: true, sessionId: newId(), startedAt: new Date().toISOString(), tracks: [], showEndPrompt: false, recognizing: false, micLevel: 0, error: null, locationLabel: undefined, lat: undefined, lng: undefined });

    const tick = async () => {
      if (!get().isActive || get().recognizing) return;
      const now = Date.now();
      if (now < nextRecognitionAllowedAt) return;
      nextRecognitionAllowedAt = now + MIN_RECOGNITION_ATTEMPT_GAP_MS;
      set({ recognizing: true });
      try {
        const sampleDuration = recognitionSampleDurationMs();
        const audioSample = musicEngine.isDemoMode
          ? new ArrayBuffer(0)
          : await captureAudioSample((level) => { if (get().isActive) set({ micLevel: level }); }, sampleDuration);
        if (!get().isActive) { set({ recognizing: false, micLevel: 0, error: null }); return; }
        const recognition = await musicEngine.recognitionProvider.recognize(audioSample);
        if (!get().isActive) { set({ recognizing: false, micLevel: 0, error: null }); return; }
        if (!recognition) {
          consecutiveNoMatches = Math.min(5, consecutiveNoMatches + 1);
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }
        consecutiveNoMatches = 0;

        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
        const last = get().tracks[0];
        if (last && sameTrack(last.track, track)) {
          lastDetectionAt = Date.now();
          nextRecognitionAllowedAt = Date.now() + SAME_TRACK_COOLDOWN_MS;
          set({ recognizing: false, micLevel: 0, showEndPrompt: false, error: null });
          return;
        }

        const sessionIdAtDetection = get().sessionId;
        if (!sessionIdAtDetection) { set({ recognizing: false, micLevel: 0, error: null }); return; }

        const entry: SessionTrackEntry = {
          id: newId(),
          track,
          recommendations: [],
          status: 'pending',
          detectedAt: new Date().toISOString(),
        };
        lastDetectionAt = Date.now();
        nextRecognitionAllowedAt = Date.now() + NEW_MATCH_COOLDOWN_MS;
        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, micLevel: 0, showEndPrompt: false, error: null }));
        persistLiveSession(get());

        void (async () => {
          try {
            const { session, playlists, match } = await findExistingTrack(track);
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
      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) set({ showEndPrompt: true });
    }, SILENCE_CHECK_INTERVAL_MS);
  },

  dismissEndPrompt: () => { lastDetectionAt = Date.now(); set({ showEndPrompt: false }); },

  requestEndSession: (title) => {
    clearTimers();
    void cancelAudioCapture();
    void clearSharedMusicSource();
    const s = get();
    if (!s.sessionId || !s.startedAt) return null;
    const session: KeepSession = { id: s.sessionId, startedAt: s.startedAt, endedAt: new Date().toISOString(), title: title ?? null, locationLabel: s.locationLabel, lat: s.lat, lng: s.lng, tracks: s.tracks };
    if (session.tracks.length > 0) useSessionHistoryStore.getState().upsertSession(session);
    set({ isActive: false, sessionId: null, startedAt: null, tracks: [], showEndPrompt: false, recognizing: false, micLevel: 0, error: null, locationLabel: undefined, lat: undefined, lng: undefined });
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
}));
