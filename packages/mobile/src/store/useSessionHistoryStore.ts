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
import { loadPendingFavoriteImports } from '../services/musicProviderSyncService';

export const CLOUD_PROFILE_RECOVERY_SESSION_ID = '__keep-cloud-profile-recovery__';
// Adel (02/09/2026) : "je like sur Spotify ... elle va dans les sessions
// extrait ... il decide s'il la partage ou pas" -- une seule session dédiée
// reçoit les nouveaux favoris détectés par la synchro auto Spotify/Deezer
// (jamais publiés tout seuls), pour qu'ils passent par le même geste
// GARDER/PASSER que le reste de Mes Sessions au lieu d'un écran séparé.
export const FAVORITES_IMPORT_SESSION_ID = '__keep-favorites-import__';

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
  keepAllPendingInSession: (sessionId: string, visibility?: KeepVisibility) => Promise<void>;
  syncUnsyncedKeeps: () => Promise<void>;
  syncPendingFavoriteImports: () => Promise<void>;
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

function buildRecoveredSession(sessionId: string, keeps: PersistedKeepDecision[]): KeepSession {
  const tracks = keeps.map(remoteEntry).sort((a, b) => safeTime(b.detectedAt) - safeTime(a.detectedAt));
  const earliest = tracks.reduce((min, entry) => {
    const value = safeTime(entry.detectedAt);
    return value > 0 && (min === 0 || value < min) ? value : min;
  }, 0);
  const latest = tracks.reduce((max, entry) => Math.max(max, safeTime(entry.detectedAt)), 0);
  const fallbackNow = Date.now();
  return {
    id: sessionId,
    startedAt: new Date(earliest || latest || fallbackNow).toISOString(),
    endedAt: new Date(latest || earliest || fallbackNow).toISOString(),
    title: 'Session récupérée',
    tracks,
  };
}

/**
 * Réconciliation serveur NON DESTRUCTIVE.
 *
 * Le serveur confirme/enrichit les morceaux gardés déjà synchronisés et restaure les morceaux gardés
 * absents du téléphone. Une absence dans une réponse distante n'est JAMAIS une
 * preuve suffisante pour supprimer l'historique local : réseau partiel, ancien
 * backfill, déduplication ou changement de version pouvaient auparavant vider
 * une session entière. Les changements de vrai compte sont traités séparément
 * dans useUserStore, au moment où l'identité est réellement connue.
 */
export function mergePersistedKeeps(sessions: KeepSession[], remoteKeeps: PersistedKeepDecision[]): KeepSession[] {
  const remoteByDecision = new Map(remoteKeeps.map((item) => [item.decisionId, item]));

  let next = sessions.map((session) => ({
    ...session,
    tracks: session.tracks.map((entry): SessionTrackEntry => {
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

  // Si un vrai historique local contient déjà le morceau gardé, ne pas le dupliquer
  // dans la session générique de récupération cloud.
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

  // Les décisions récentes transportent le vrai sessionId dans leur contexte.
  // On reconstruit donc LA session correspondante au lieu de jeter tous les
  // morceaux dans un dossier générique. C'est ce qui permet de restaurer une
  // session visible après reload, nouvel appareil ou ancienne perte locale.
  const missingBySession = new Map<string, PersistedKeepDecision[]>();
  const legacyMissing: PersistedKeepDecision[] = [];
  for (const item of missing) {
    if (item.sessionId && item.sessionId !== CLOUD_PROFILE_RECOVERY_SESSION_ID) {
      const group = missingBySession.get(item.sessionId) ?? [];
      group.push(item);
      missingBySession.set(item.sessionId, group);
    } else {
      legacyMissing.push(item);
    }
  }

  for (const [sessionId, keeps] of missingBySession.entries()) {
    const index = next.findIndex((session) => session.id === sessionId);
    if (index >= 0) {
      const existing = next[index];
      const currentIds = new Set(existing.tracks.map((entry) => entry.keepDecisionId).filter(Boolean));
      const additions = keeps.filter((item) => !currentIds.has(item.decisionId)).map(remoteEntry);
      if (additions.length) {
        const tracks = [...existing.tracks, ...additions].sort((a, b) => safeTime(b.detectedAt) - safeTime(a.detectedAt));
        next[index] = {
          ...existing,
          tracks,
          startedAt: existing.startedAt || buildRecoveredSession(sessionId, keeps).startedAt,
          endedAt: existing.endedAt ?? buildRecoveredSession(sessionId, keeps).endedAt,
        };
      }
    } else {
      next.push(buildRecoveredSession(sessionId, keeps));
    }
  }

  // Les anciens morceaux gardés n'ont pas de sessionId : ils restent accessibles dans une
  // seule session de récupération, sans jamais effacer les sessions réelles.
  const existingCloudIndex = next.findIndex(isCloudProfileRecoverySession);
  if (legacyMissing.length) {
    const existingCloud = existingCloudIndex >= 0 ? next[existingCloudIndex] : undefined;
    const known = new Set((existingCloud?.tracks ?? []).map((entry) => entry.keepDecisionId).filter(Boolean));
    const cloudTracks = [
      ...(existingCloud?.tracks ?? []),
      ...legacyMissing.filter((item) => !known.has(item.decisionId)).map(remoteEntry),
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
      title: 'Morceaux sauvegardés',
      tracks: cloudTracks,
    };
    if (existingCloudIndex >= 0) next[existingCloudIndex] = cloudSession;
    else next.push(cloudSession);
  }

  next = next.filter((session) => !isCloudProfileRecoverySession(session) || session.tracks.length > 0);
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

      keepAllPendingInSession: async (sessionId, visibility = 'PRIVATE') => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const pending = session.tracks.filter((t) => t.status === 'pending');
        for (const entry of pending) {
          await get().keepTrackInSession(sessionId, entry.id, undefined, visibility);
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
          // Le serveur enrichit et restaure. Il ne supprime jamais une session
          // locale sur la seule base d'une absence dans cette lecture distante.
          set((state) => ({ sessions: mergePersistedKeeps(state.sessions, remoteKeeps) }));
        } catch {
          // Offline / serveur indisponible : conserver exactement les données locales.
        }
      },

      syncPendingFavoriteImports: async () => {
        let pending: Awaited<ReturnType<typeof loadPendingFavoriteImports>>;
        try {
          pending = await loadPendingFavoriteImports();
        } catch {
          return; // Hors ligne / non connecté : rien à ajouter cette fois-ci.
        }
        if (!pending.length) return;

        set((state) => {
          const existing = state.sessions.find((s) => s.id === FAVORITES_IMPORT_SESSION_ID);
          const knownProviderIds = new Set((existing?.tracks ?? []).map((t) => t.id));
          const now = new Date().toISOString();
          const additions: SessionTrackEntry[] = pending
            .filter((item) => !knownProviderIds.has(`favimport-${item.id}`))
            .map((item) => ({
              id: `favimport-${item.id}`,
              track: {
                id: item.track_id || item.id,
                isrc: item.isrc || undefined,
                title: item.title,
                artist: item.artist,
                album: item.album || undefined,
                artworkUrl: item.artwork_url || undefined,
                providerIds: {},
              },
              recommendations: [],
              status: 'pending' as SessionTrackStatus,
              detectedAt: item.imported_at || now,
              importedFrom: item.provider,
            }));
          if (!additions.length) return state;

          const session: KeepSession = existing
            ? { ...existing, tracks: [...additions, ...existing.tracks] }
            : {
                id: FAVORITES_IMPORT_SESSION_ID,
                startedAt: now,
                endedAt: null,
                title: 'Favoris importés (Spotify/Deezer)',
                tracks: additions,
              };
          const sessions = existing
            ? state.sessions.map((s) => s.id === FAVORITES_IMPORT_SESSION_ID ? session : s)
            : [session, ...state.sessions];
          return { sessions };
        });
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