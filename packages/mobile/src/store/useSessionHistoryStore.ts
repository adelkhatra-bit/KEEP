import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeepSession, KeepVisibility, SessionTrackEntry, SessionTrackStatus } from '../types';
import { commitKeep } from '../services/keepTrackAction';
import { getDownloadCreditStatus } from '../services/creditService';
import { setAllOwnKeepVisibility } from '../services/keepLibraryService';
import {
  loadOwnPersistedKeeps,
  PersistedKeepDecision,
  recordKeepDecision,
  updateKeepDecisionVisibility,
} from '../services/keepMusicCoreRecognition';

export const CLOUD_PROFILE_RECOVERY_SESSION_ID = '__keep-cloud-profile-recovery__';

export function isCloudProfileRecoverySession(session: KeepSession): boolean {
  return session.id === CLOUD_PROFILE_RECOVERY_SESSION_ID;
}

interface SessionHistoryStore {
  sessions: KeepSession[];
  addSession: (session: KeepSession) => void;
  upsertSession: (session: KeepSession) => void;
  deleteSession: (sessionId: string) => void;
  clearSessions: () => void;
  renameSession: (sessionId: string, title: string) => void;
  reconcileOrphanedLiveSessions: (activeSessionId?: string | null) => void;
  keepTrackInSession: (sessionId: string, entryId: string, playlistId?: string, visibility?: KeepVisibility) => Promise<void>;
  passTrackInSession: (sessionId: string, entryId: string) => void;
  setTrackVisibilityInSession: (sessionId: string, entryId: string, visibility: KeepVisibility) => Promise<void>;
  setAllKeptVisibility: (visibility: KeepVisibility) => Promise<number>;
  keepAllPendingInSession: (sessionId: string) => Promise<void>;
  syncUnsyncedKeeps: () => Promise<void>;
  refreshCreditLocks: () => Promise<void>;
  getSession: (sessionId: string) => KeepSession | undefined;
}

function isCreditsExhausted(error: unknown): boolean {
  return error instanceof Error && error.message === 'CREDITS_EXHAUSTED';
}

function updateEntryStatus(
  sessions: KeepSession[],
  sessionId: string,
  entryId: string,
  status: SessionTrackStatus,
  keptPlaylistId?: string,
  visibility?: KeepVisibility,
  keepDecisionId?: string,
  creditLocked?: boolean,
): KeepSession[] {
  return sessions.map((s) =>
    s.id !== sessionId
      ? s
      : { ...s, tracks: s.tracks.map((t) => t.id === entryId ? { ...t, status, keptPlaylistId, visibility, keepDecisionId, creditLocked } : t) }
  );
}

function lockPendingFrom(sessions: KeepSession[], sessionId: string, entryId?: string): KeepSession[] {
  return sessions.map((session) =>
    session.id !== sessionId
      ? session
      : {
          ...session,
          tracks: session.tracks.map((track) =>
            track.status === 'pending' && (!entryId || track.id === entryId)
              ? { ...track, creditLocked: true }
              : track,
          ),
        }
  );
}

function unlockPending(sessions: KeepSession[]): KeepSession[] {
  return sessions.map((session) => ({
    ...session,
    tracks: session.tracks.map((track) =>
      track.status === 'pending' && track.creditLocked
        ? { ...track, creditLocked: false }
        : track,
    ),
  }));
}

function orphanedSessionEndAt(session: KeepSession): string {
  const startedAt = new Date(session.startedAt).getTime();
  const latestDetection = session.tracks.reduce((latest, track) => {
    const detectedAt = new Date(track.detectedAt).getTime();
    return Number.isFinite(detectedAt) ? Math.max(latest, detectedAt) : latest;
  }, Number.isFinite(startedAt) ? startedAt : 0);
  const safeEnd = latestDetection > 0 ? latestDetection : Date.now();
  return new Date(safeEnd).toISOString();
}

function safeTime(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeCanonicalTrack(local: SessionTrackEntry['track'], remote: PersistedKeepDecision['track']): SessionTrackEntry['track'] {
  return {
    ...local,
    id: remote.id || local.id,
    isrc: remote.isrc || local.isrc,
    title: remote.title || local.title,
    artist: remote.artist || local.artist,
    album: remote.album || local.album,
    durationSec: remote.durationSec ?? local.durationSec,
    artworkUrl: remote.artworkUrl || local.artworkUrl,
    genres: remote.genres?.length ? remote.genres : (local.genres ?? []),
    providerIds: { ...(local.providerIds ?? {}), ...(remote.providerIds ?? {}) },
    previewUrl: remote.previewUrl || local.previewUrl,
    externalUrls: { ...(local.externalUrls ?? {}), ...(remote.externalUrls ?? {}) },
    availableOn: remote.availableOn?.length ? remote.availableOn : (local.availableOn ?? []),
  };
}

function remoteEntry(remote: PersistedKeepDecision): SessionTrackEntry {
  return {
    id: `cloud-${remote.decisionId}`,
    track: remote.track,
    recommendations: [],
    status: 'kept',
    detectedAt: remote.detectedAt,
    visibility: remote.visibility,
    keepDecisionId: remote.decisionId,
    sourceProfileId: remote.sourceProfileId,
    sourceUsername: remote.sourceUsername,
    creditSource: remote.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL' : 'FREE',
    creditLocked: false,
  };
}

function mergePersistedKeeps(sessions: KeepSession[], remoteKeeps: PersistedKeepDecision[]): KeepSession[] {
  const remoteByDecision = new Map(remoteKeeps.map((item) => [item.decisionId, item]));
  const remoteDecisionIds = new Set(remoteByDecision.keys());

  // Toute entrée déjà synchronisée doit appartenir au compte actuellement
  // authentifié. Si son decisionId n'existe pas dans la lecture serveur de ce
  // compte, elle provient d'une ancienne identité locale (ou a été supprimée)
  // et ne doit jamais polluer son KEEP, ses compteurs ou son ADN musical.
  let next = sessions.map((session) => ({
    ...session,
    tracks: session.tracks
      .filter((entry) => !entry.keepDecisionId || remoteDecisionIds.has(entry.keepDecisionId))
      .map((entry) => {
        if (!entry.keepDecisionId) return entry;
        const remote = remoteByDecision.get(entry.keepDecisionId);
        if (!remote) return entry;
        return {
          ...entry,
          track: mergeCanonicalTrack(entry.track, remote.track),
          status: 'kept' as SessionTrackStatus,
          visibility: remote.visibility,
          sourceProfileId: remote.sourceProfileId,
          sourceUsername: remote.sourceUsername,
          creditSource: remote.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL' : 'FREE',
          creditLocked: false,
        };
      }),
  }));

  const visibleDecisionIds = new Set<string>();
  for (const session of next) {
    if (isCloudProfileRecoverySession(session)) continue;
    for (const entry of session.tracks) if (entry.keepDecisionId) visibleDecisionIds.add(entry.keepDecisionId);
  }
  next = next.map((session) => isCloudProfileRecoverySession(session)
    ? { ...session, tracks: session.tracks.filter((entry) => !entry.keepDecisionId || !visibleDecisionIds.has(entry.keepDecisionId)) }
    : session);

  const represented = new Set<string>();
  for (const session of next) {
    for (const entry of session.tracks) if (entry.keepDecisionId) represented.add(entry.keepDecisionId);
  }
  const missing = remoteKeeps.filter((item) => !represented.has(item.decisionId));

  const existingCloud = next.find(isCloudProfileRecoverySession);
  if (!missing.length) {
    return next.filter((session) => !isCloudProfileRecoverySession(session) || session.tracks.length > 0);
  }

  const cloudTracks = [
    ...(existingCloud?.tracks ?? []),
    ...missing.map(remoteEntry),
  ].sort((a, b) => safeTime(b.detectedAt) - safeTime(a.detectedAt));

  const earliest = cloudTracks.reduce((min, entry) => {
    const value = safeTime(entry.detectedAt);
    return value > 0 && (min === 0 || value < min) ? value : min;
  }, 0);
  const latest = cloudTracks.reduce((max, entry) => Math.max(max, safeTime(entry.detectedAt)), 0);
  const fallbackNow = Date.now();
  const cloudSession: KeepSession = {
    id: CLOUD_PROFILE_RECOVERY_SESSION_ID,
    startedAt: new Date(earliest || latest || fallbackNow).toISOString(),
    endedAt: new Date(latest || earliest || fallbackNow).toISOString(),
    title: 'KEEP sauvegardés',
    tracks: cloudTracks,
  };

  next = existingCloud
    ? next.map((session) => isCloudProfileRecoverySession(session) ? cloudSession : session)
    : [...next, cloudSession];

  return next.sort((a, b) => {
    if (isCloudProfileRecoverySession(a)) return 1;
    if (isCloudProfileRecoverySession(b)) return -1;
    return safeTime(b.startedAt) - safeTime(a.startedAt);
  });
}

export const useSessionHistoryStore = create<SessionHistoryStore>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
      upsertSession: (session) => set((s) => {
        const exists = s.sessions.some((item) => item.id === session.id);
        return { sessions: exists ? s.sessions.map((item) => item.id === session.id ? session : item) : [session, ...s.sessions] };
      }),
      deleteSession: (sessionId) => set((s) => ({ sessions: s.sessions.filter((session) => session.id !== sessionId) })),
      clearSessions: () => set({ sessions: [] }),
      renameSession: (sessionId, title) => set((s) => ({ sessions: s.sessions.map((sess) => sess.id === sessionId ? { ...sess, title } : sess) })),

      reconcileOrphanedLiveSessions: (activeSessionId = null) => set((state) => ({
        sessions: state.sessions.map((session) =>
          session.endedAt == null && session.id !== activeSessionId
            ? { ...session, endedAt: orphanedSessionEndAt(session) }
            : session
        ),
      })),

      keepTrackInSession: async (sessionId, entryId, playlistId, visibility = 'PRIVATE') => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!session || !entry || entry.status !== 'pending') return;
        try {
          const { targetPlaylistId, keepDecisionId } = await commitKeep(entry.track, entry.recommendations, playlistId, {
            visibility,
            context: { sessionId, detectedAt: entry.detectedAt, source: 'session_history' },
          });
          set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'kept', targetPlaylistId, visibility, keepDecisionId, false) }));
        } catch (error) {
          if (isCreditsExhausted(error)) {
            set((s) => ({ sessions: lockPendingFrom(s.sessions, sessionId, entryId) }));
            return;
          }
          throw error;
        }
      },

      passTrackInSession: (sessionId, entryId) => set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'passed', undefined, undefined, undefined, false) })),

      setTrackVisibilityInSession: async (sessionId, entryId, visibility) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!entry || entry.status !== 'kept') return;
        if (entry.keepDecisionId) await updateKeepDecisionVisibility(entry.keepDecisionId, visibility);
        set((s) => ({ sessions: s.sessions.map((sess) => sess.id !== sessionId ? sess : { ...sess, tracks: sess.tracks.map((track) => track.id === entryId ? { ...track, visibility } : track) }) }));
      },

      setAllKeptVisibility: async (visibility) => {
        const changed = await setAllOwnKeepVisibility(visibility);
        set((state) => ({
          sessions: state.sessions.map((session) => ({
            ...session,
            tracks: session.tracks.map((track) => track.status === 'kept' ? { ...track, visibility } : track),
          })),
        }));
        return changed;
      },

      keepAllPendingInSession: async (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const pending = session.tracks.filter((t) => t.status === 'pending');
        for (const entry of pending) {
          await get().keepTrackInSession(sessionId, entry.id, undefined, 'PRIVATE');
          const refreshed = get().sessions.find((s) => s.id === sessionId)?.tracks.find((t) => t.id === entry.id);
          if (refreshed?.creditLocked) {
            set((s) => ({ sessions: lockPendingFrom(s.sessions, sessionId) }));
            break;
          }
        }
      },

      syncUnsyncedKeeps: async () => {
        const snapshot = get().sessions;
        for (const session of snapshot) {
          if (isCloudProfileRecoverySession(session)) continue;
          for (const entry of session.tracks) {
            if (entry.status !== 'kept' || entry.keepDecisionId) continue;
            try {
              const recorded = await recordKeepDecision(entry.track, entry.visibility ?? 'PRIVATE', { sessionId: session.id, detectedAt: entry.detectedAt, source: 'guest_upgrade' });
              if (!recorded?.decisionId) continue;
              set((state) => ({ sessions: state.sessions.map((sess) => sess.id !== session.id ? sess : { ...sess, tracks: sess.tracks.map((track) => track.id === entry.id ? { ...track, keepDecisionId: recorded.decisionId } : track) }) }));
            } catch {
              // Une synchro interrompue n'efface jamais l'historique local.
            }
          }
        }

        try {
          const remoteKeeps = await loadOwnPersistedKeeps();
          // Une lecture serveur réussie, même vide, est la source de vérité du
          // compte actif. Elle purge les anciennes décisions synchronisées qui
          // appartenaient à un autre profil tout en conservant les entrées
          // locales encore non synchronisées.
          set((state) => ({ sessions: mergePersistedKeeps(state.sessions, remoteKeeps) }));
        } catch {
          // Offline / serveur indisponible : conserver exactement les données locales.
        }
      },

      refreshCreditLocks: async () => {
        const status = await getDownloadCreditStatus();
        const available = status.unlimited || (status.remaining ?? 0) > 0;
        if (available) set((state) => ({ sessions: unlockPending(state.sessions) }));
      },

      getSession: (sessionId) => get().sessions.find((s) => s.id === sessionId),
    }),
    { name: 'keep-session-history', storage: createJSONStorage(() => AsyncStorage) }
  )
);
