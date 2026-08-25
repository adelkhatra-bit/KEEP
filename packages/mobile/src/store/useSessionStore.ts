import { create } from 'zustand';
import { CanonicalTrack } from '@keep/music';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { musicEngine } from '../services/musicEngine';
import { commitKeep } from '../services/keepTrackAction';
import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError } from '../services/micCapture';
import { checkConnectedLibraries } from '../services/connectedMusicLibrary';
import { useSessionHistoryStore } from './useSessionHistoryStore';

const RECOGNITION_TICK_MS = 8000;
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

async function findExistingTrack(track: CanonicalTrack) {
  const connected = await checkConnectedLibraries(track);
  const session = await musicEngine.getSession();
  const playlists = await musicEngine.musicProvider.getPlaylists(session);

  if (connected?.exists && connected.match) {
    return {
      session,
      playlists,
      match: {
        playlistId: connected.match.playlistId,
        playlistName: connected.match.playlistName,
        provider: connected.match.provider,
      },
    };
  }

  for (const playlist of playlists) {
    const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
    if (tracks.some((candidate) => sameTrack(candidate, track))) {
      return {
        session,
        playlists,
        match: {
          playlistId: playlist.id,
          playlistName: playlist.name,
          provider: session.provider,
        },
      };
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
  /** Niveau micro réel 0-1 en direct pendant une capture (cf. demande explicite
   * du 26/08/2026 -- "l'animation doit suivre le micro"). 0 hors capture. */
  micLevel: number;
  error: string | null;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  startSession: () => void;
  requestEndSession: (title?: string) => string | null;
  dismissEndPrompt: () => void;
  keepTrack: (entryId: string, playlistId?: string) => Promise<void>;
  passTrack: (entryId: string) => void;
  keepAllPending: () => Promise<void>;
  setSilenceTimeoutMin: (minutes: number) => void;
  attachLocation: (label: string, lat?: number, lng?: number) => void;
}

let tickHandle: ReturnType<typeof setInterval> | null = null;
let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;
let lastDetectionAt = 0;

function clearTimers() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
  if (silenceCheckHandle) {
    clearInterval(silenceCheckHandle);
    silenceCheckHandle = null;
  }
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
    lastDetectionAt = Date.now();
    set({
      isActive: true,
      sessionId: newId(),
      startedAt: new Date().toISOString(),
      tracks: [],
      showEndPrompt: false,
      recognizing: false,
      micLevel: 0,
      error: null,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
    });

    const tick = async () => {
      if (!get().isActive || get().recognizing) return;
      set({ recognizing: true });
      try {
        const audioSample = musicEngine.isDemoMode
          ? new ArrayBuffer(0)
          : await captureAudioSample((level) => { if (get().isActive) set({ micLevel: level }); });
        if (!get().isActive) {
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }

        const recognition = await musicEngine.recognitionProvider.recognize(audioSample);
        if (!get().isActive) {
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }
        if (!recognition) {
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }

        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
        const last = get().tracks[0];
        if (last && sameTrack(last.track, track)) {
          lastDetectionAt = Date.now();
          set({ recognizing: false, micLevel: 0, showEndPrompt: false, error: null });
          return;
        }

        const { session, playlists, match } = await findExistingTrack(track);
        if (!get().isActive) {
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }
        const recommendations = match ? [] : await musicEngine.router.recommend(session.userId, track, playlists);

        const entry: SessionTrackEntry = {
          id: newId(),
          track,
          recommendations,
          status: match ? 'already_saved' : 'pending',
          detectedAt: new Date().toISOString(),
          existingMatch: match,
        };
        lastDetectionAt = Date.now();
        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, micLevel: 0, showEndPrompt: false, error: null }));
      } catch (e: any) {
        if (e instanceof MicCaptureCancelledError || !get().isActive) {
          set({ recognizing: false, micLevel: 0, error: null });
          return;
        }
        set({ recognizing: false, micLevel: 0, error: e?.message ?? 'Erreur de reconnaissance' });
      }
    };

    tick();
    tickHandle = setInterval(tick, RECOGNITION_TICK_MS);
    silenceCheckHandle = setInterval(() => {
      const { isActive, silenceTimeoutMin, showEndPrompt } = get();
      if (!isActive || showEndPrompt) return;
      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) {
        set({ showEndPrompt: true });
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  },

  dismissEndPrompt: () => {
    lastDetectionAt = Date.now();
    set({ showEndPrompt: false });
  },

  requestEndSession: (title) => {
    clearTimers();
    void cancelAudioCapture();
    const s = get();
    if (!s.sessionId || !s.startedAt) return null;

    const session: KeepSession = {
      id: s.sessionId,
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      title: title ?? null,
      locationLabel: s.locationLabel,
      lat: s.lat,
      lng: s.lng,
      tracks: s.tracks,
    };

    if (session.tracks.length > 0) useSessionHistoryStore.getState().addSession(session);

    set({
      isActive: false,
      sessionId: null,
      startedAt: null,
      tracks: [],
      showEndPrompt: false,
      recognizing: false,
      error: null,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
    });

    return session.tracks.length > 0 ? session.id : null;
  },

  keepTrack: async (entryId, playlistId) => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry || entry.status === 'already_saved') return;
    try {
      const { targetPlaylistId } = await commitKeep(entry.track, entry.recommendations, playlistId);
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === entryId ? { ...t, status: 'kept' as SessionTrackStatus, keptPlaylistId: targetPlaylistId } : t
        ),
      }));
    } catch (e: any) {
      set({ error: e?.message ?? 'Erreur lors du rangement' });
    }
  },

  passTrack: (entryId) => {
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, status: 'passed' as SessionTrackStatus } : t)),
    }));
  },

  keepAllPending: async () => {
    const pending = get().tracks.filter((t) => t.status === 'pending');
    for (const entry of pending) await get().keepTrack(entry.id);
  },

  setSilenceTimeoutMin: (minutes) => set({ silenceTimeoutMin: minutes }),
  attachLocation: (label, lat, lng) => set({ locationLabel: label, lat, lng }),
}));