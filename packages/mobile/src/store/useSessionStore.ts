import { create } from 'zustand';
import { CanonicalTrack } from '@keep/music';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { musicEngine } from '../services/musicEngine';
import { commitKeep } from '../services/keepTrackAction';
import { captureAudioSample } from '../services/micCapture';
import { useSessionHistoryStore } from './useSessionHistoryStore';

/**
 * Moteur de session KEEP (cahier des charges — concept corrigé du 21/08/2026) :
 * KEEP n'est pas un lecteur ("Écouter"), c'est la mémoire musicale d'un
 * moment vécu. DÉMARRER UNE SESSION -> KEEP identifie successivement les
 * morceaux entendus -> GARDER/PASSER au fil de l'eau ou plus tard depuis le
 * récapitulatif -> fin automatique après une période sans musique.
 *
 * DÉMO : la cadence de reconnaissance simule un DJ qui enchaîne les
 * morceaux, en interrogeant recognitionProvider.recognize() à intervalle
 * régulier — pas de vrai buffer micro (voir docs/PROJECT_STATUS.md).
 * MODE RÉEL : chaque tick capture un vrai échantillon micro (voir
 * services/micCapture.ts) tant que KEEP est au premier plan. La continuité
 * en arrière-plan (écran verrouillé) est un chantier séparé, contraint par
 * l'OS — voir docs/PLATFORM_COMPLIANCE.md section "Continuité de la
 * reconnaissance en session" : ne jamais prétendre écouter en permanence
 * tant que ce n'est pas réellement câblé et vérifié sur un vrai appareil.
 */
const RECOGNITION_TICK_MS = 8000;
const SILENCE_CHECK_INTERVAL_MS = 15000;

/**
 * Valeur par défaut si le Super Admin n'a rien changé. Modifiable depuis
 * Super Admin -> Feature Flags -> Réglages session (packages/admin) ;
 * PAS ENCORE persistée côté Supabase (aucun projet KEEP déployé — voir
 * docs/PROJECT_STATUS.md), donc la valeur choisie en admin ne voyage pas
 * encore jusqu'ici. CODED, pas CONNECTED : ne pas annoncer plus que ça.
 */
export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 10;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sameTrack(a: CanonicalTrack, b: CanonicalTrack): boolean {
  if (a.isrc && b.isrc) return a.isrc === b.isrc;
  return a.title === b.title && a.artist === b.artist;
}

interface SessionStore {
  isActive: boolean;
  sessionId: string | null;
  startedAt: string | null;
  tracks: SessionTrackEntry[];
  silenceTimeoutMin: number;
  showEndPrompt: boolean;
  recognizing: boolean;
  /** Niveau micro réel 0-1 en direct (metering expo-av) -- 0 hors capture ou si le navigateur ne fournit pas de metering. */
  micLevel: number;
  error: string | null;
  locationLabel?: string;
  lat?: number;
  lng?: number;

  startSession: () => void;
  /** Déclenchée par le bouton manuel "Terminer" ou par la confirmation du prompt de fin. Archive et renvoie l'id pour naviguer vers le récap. */
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
    lastDetectionAt = Date.now();
    set({
      isActive: true,
      sessionId: newId(),
      startedAt: new Date().toISOString(),
      tracks: [],
      showEndPrompt: false,
      error: null,
      micLevel: 0,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
    });

    const tick = async () => {
      if (!get().isActive || get().recognizing) return;
      set({ recognizing: true });
      try {
        // Reconnaissance factice (pas de vraie clé AudD) : buffer vide,
        // DemoRecognitionProvider l'ignore. Reconnaissance réelle (vraie clé
        // AudD configurée, cf. musicEngine.isRealRecognition) : vrai
        // échantillon micro, indépendamment du reste de l'app (Mode Démo ou
        // non) -- cf. demande explicite du 22/08/2026.
        const audioSample = musicEngine.isRealRecognition
          ? await captureAudioSample((level) => set({ micLevel: level }))
          : new ArrayBuffer(0);
        const recognition = await musicEngine.recognitionProvider.recognize(audioSample);
        if (!recognition) {
          // Rien entendu ce tick -- normal (silence, morceau non reconnu),
          // pas une erreur : on efface une éventuelle erreur précédente.
          set({ recognizing: false, error: null });
          return;
        }

        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
        // Un morceau déjà vu CE SOIR (gardé, passé, ou encore en attente) ne
        // redemande jamais — PASS = fermé, pas question du même morceau tant
        // que la session n'est pas terminée (cf. demande explicite du
        // 22/08/2026 : "PASS ne doit jamais reproposer le même morceau").
        // La musique continue en revanche : repousse la détection de fin.
        const alreadySeen = get().tracks.find((t) => sameTrack(t.track, track));
        if (alreadySeen) {
          lastDetectionAt = Date.now();
          set({ recognizing: false, showEndPrompt: false, error: null });
          return;
        }

        const session = await musicEngine.getSession();
        const playlists = await musicEngine.musicProvider.getPlaylists(session);
        const recommendations = await musicEngine.router.recommend(session.userId, track, playlists);

        const entry: SessionTrackEntry = {
          id: newId(),
          track,
          recommendations,
          status: 'pending',
          detectedAt: new Date().toISOString(),
        };
        lastDetectionAt = Date.now();
        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, showEndPrompt: false, error: null }));
      } catch (e: any) {
        set({ recognizing: false, error: e?.message ?? 'Erreur de reconnaissance' });
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

    if (session.tracks.length > 0) {
      useSessionHistoryStore.getState().addSession(session);
    }

    set({
      isActive: false,
      sessionId: null,
      startedAt: null,
      tracks: [],
      showEndPrompt: false,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
    });

    return session.tracks.length > 0 ? session.id : null;
  },

  keepTrack: async (entryId, playlistId) => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry) return;
    try {
      const { targetPlaylistId, syncState } = await commitKeep(entry.track, entry.recommendations, playlistId);
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === entryId ? { ...t, status: 'kept' as SessionTrackStatus, keptPlaylistId: targetPlaylistId, syncState } : t
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
    for (const entry of pending) {
      await get().keepTrack(entry.id);
    }
  },

  setSilenceTimeoutMin: (minutes) => set({ silenceTimeoutMin: minutes }),

  attachLocation: (label, lat, lng) => set({ locationLabel: label, lat, lng }),
}));
