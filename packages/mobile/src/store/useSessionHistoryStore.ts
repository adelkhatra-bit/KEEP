import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { commitKeep } from '../services/keepTrackAction';

/**
 * "Mes Sessions" — mémoire des moments de vie où KEEP a écouté.
 *
 * Persisté en local (AsyncStorage) : aucun projet Supabase KEEP n'existe
 * encore (voir docs/PROJECT_STATUS.md, table `sessions` PLANNED), donc
 * l'historique doit survivre au moins à la fermeture de l'app plutôt que de
 * dépendre d'un backend qui n'existe pas. Le type `KeepSession` mappe déjà
 * la forme prévue côté base pour que la bascule vers Supabase soit un
 * simple remplacement de la couche persistance, pas une refonte.
 */
interface SessionHistoryStore {
  sessions: KeepSession[];
  addSession: (session: KeepSession) => void;
  renameSession: (sessionId: string, title: string) => void;
  keepTrackInSession: (sessionId: string, entryId: string, playlistId?: string) => Promise<void>;
  passTrackInSession: (sessionId: string, entryId: string) => void;
  keepAllPendingInSession: (sessionId: string) => Promise<void>;
  getSession: (sessionId: string) => KeepSession | undefined;
  /** Nombre total de morceaux gardés mais pas encore synchronisés (aucun service connecté au moment du GARDER) — toutes sessions confondues. */
  countWaitingSync: () => number;
  /** Appelée une fois un service musical connecté (voir useMusicServiceStore) — rejoue GARDER pour chaque morceau en attente. */
  syncAllWaitingTracks: () => Promise<void>;
}

function updateEntryStatus(
  sessions: KeepSession[],
  sessionId: string,
  entryId: string,
  status: SessionTrackStatus,
  keptPlaylistId?: string,
  syncState?: SessionTrackEntry['syncState']
): KeepSession[] {
  return sessions.map((s) =>
    s.id !== sessionId
      ? s
      : { ...s, tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, status, keptPlaylistId, syncState } : t)) }
  );
}

export const useSessionHistoryStore = create<SessionHistoryStore>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),

      renameSession: (sessionId, title) =>
        set((s) => ({ sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, title } : sess)) })),

      keepTrackInSession: async (sessionId, entryId, playlistId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!session || !entry) return;

        const { targetPlaylistId, syncState } = await commitKeep(entry.track, entry.recommendations, playlistId);
        set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'kept', targetPlaylistId, syncState) }));
      },

      passTrackInSession: (sessionId, entryId) => {
        set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'passed') }));
      },

      keepAllPendingInSession: async (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const pending = session.tracks.filter((t) => t.status === 'pending');
        for (const entry of pending) {
          await get().keepTrackInSession(sessionId, entry.id);
        }
      },

      getSession: (sessionId) => get().sessions.find((s) => s.id === sessionId),

      countWaitingSync: () =>
        get().sessions.reduce(
          (total, s) => total + s.tracks.filter((t) => t.status === 'kept' && t.syncState === 'waiting_sync').length,
          0
        ),

      syncAllWaitingTracks: async () => {
        const sessions = get().sessions;
        for (const session of sessions) {
          for (const entry of session.tracks) {
            if (entry.status !== 'kept' || entry.syncState !== 'waiting_sync') continue;
            const { targetPlaylistId, syncState } = await commitKeep(entry.track, entry.recommendations);
            set((s) => ({
              sessions: updateEntryStatus(s.sessions, session.id, entry.id, 'kept', targetPlaylistId, syncState),
            }));
          }
        }
      },
    }),
    {
      name: 'keep-session-history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
