import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeepSession, SessionTrackStatus } from '../types';
import { commitKeep } from '../services/keepTrackAction';

/**
 * "Mes Sessions" — mémoire des moments de vie où KEEP a écouté.
 *
 * Persisté en local (AsyncStorage) : l'utilisateur garde la main sur cet
 * historique et peut supprimer une session devenue inutile. Les morceaux déjà
 * envoyés dans Spotify/Apple Music ne sont jamais supprimés de ces services par
 * cette action : seule la session KEEP locale est retirée.
 */
interface SessionHistoryStore {
  sessions: KeepSession[];
  addSession: (session: KeepSession) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  keepTrackInSession: (sessionId: string, entryId: string, playlistId?: string) => Promise<void>;
  passTrackInSession: (sessionId: string, entryId: string) => void;
  keepAllPendingInSession: (sessionId: string) => Promise<void>;
  getSession: (sessionId: string) => KeepSession | undefined;
}

function updateEntryStatus(
  sessions: KeepSession[],
  sessionId: string,
  entryId: string,
  status: SessionTrackStatus,
  keptPlaylistId?: string
): KeepSession[] {
  return sessions.map((s) =>
    s.id !== sessionId
      ? s
      : { ...s, tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, status, keptPlaylistId } : t)) }
  );
}

export const useSessionHistoryStore = create<SessionHistoryStore>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),

      deleteSession: (sessionId) =>
        set((s) => ({ sessions: s.sessions.filter((session) => session.id !== sessionId) })),

      renameSession: (sessionId, title) =>
        set((s) => ({ sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, title } : sess)) })),

      keepTrackInSession: async (sessionId, entryId, playlistId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!session || !entry) return;

        const { targetPlaylistId } = await commitKeep(entry.track, entry.recommendations, playlistId);
        set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'kept', targetPlaylistId) }));
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
    }),
    {
      name: 'keep-session-history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
