import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeepSession, KeepVisibility, SessionTrackStatus } from '../types';
import { commitKeep } from '../services/keepTrackAction';
import { recordKeepDecision, updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';

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
  clearSessions: () => void;
  renameSession: (sessionId: string, title: string) => void;
  keepTrackInSession: (sessionId: string, entryId: string, playlistId?: string, visibility?: KeepVisibility) => Promise<void>;
  passTrackInSession: (sessionId: string, entryId: string) => void;
  setTrackVisibilityInSession: (sessionId: string, entryId: string, visibility: KeepVisibility) => Promise<void>;
  keepAllPendingInSession: (sessionId: string) => Promise<void>;
  syncUnsyncedKeeps: () => Promise<void>;
  getSession: (sessionId: string) => KeepSession | undefined;
}

function updateEntryStatus(
  sessions: KeepSession[],
  sessionId: string,
  entryId: string,
  status: SessionTrackStatus,
  keptPlaylistId?: string,
  visibility?: KeepVisibility,
  keepDecisionId?: string,
): KeepSession[] {
  return sessions.map((s) =>
    s.id !== sessionId
      ? s
      : {
          ...s,
          tracks: s.tracks.map((t) =>
            t.id === entryId ? { ...t, status, keptPlaylistId, visibility, keepDecisionId } : t
          ),
        }
  );
}

export const useSessionHistoryStore = create<SessionHistoryStore>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),

      deleteSession: (sessionId) =>
        set((s) => ({ sessions: s.sessions.filter((session) => session.id !== sessionId) })),

      clearSessions: () => set({ sessions: [] }),

      renameSession: (sessionId, title) =>
        set((s) => ({ sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, title } : sess)) })),

      keepTrackInSession: async (sessionId, entryId, playlistId, visibility = 'PRIVATE') => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!session || !entry || entry.status !== 'pending') return;

        const { targetPlaylistId, keepDecisionId } = await commitKeep(
          entry.track,
          entry.recommendations,
          playlistId,
          {
            visibility,
            context: { sessionId, detectedAt: entry.detectedAt, source: 'session_history' },
          },
        );
        set((s) => ({
          sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'kept', targetPlaylistId, visibility, keepDecisionId),
        }));
      },

      passTrackInSession: (sessionId, entryId) => {
        set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'passed') }));
      },

      setTrackVisibilityInSession: async (sessionId, entryId, visibility) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!entry || entry.status !== 'kept') return;
        if (entry.keepDecisionId) await updateKeepDecisionVisibility(entry.keepDecisionId, visibility);
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId
              ? sess
              : { ...sess, tracks: sess.tracks.map((track) => (track.id === entryId ? { ...track, visibility } : track)) }
          ),
        }));
      },

      keepAllPendingInSession: async (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const pending = session.tracks.filter((t) => t.status === 'pending');
        for (const entry of pending) {
          await get().keepTrackInSession(sessionId, entry.id, undefined, 'PRIVATE');
        }
      },

      syncUnsyncedKeeps: async () => {
        const snapshot = get().sessions;
        for (const session of snapshot) {
          for (const entry of session.tracks) {
            if (entry.status !== 'kept' || entry.keepDecisionId) continue;
            try {
              const recorded = await recordKeepDecision(
                entry.track,
                entry.visibility ?? 'PRIVATE',
                { sessionId: session.id, detectedAt: entry.detectedAt, source: 'guest_upgrade' },
              );
              if (!recorded?.decisionId) continue;
              set((state) => ({
                sessions: state.sessions.map((sess) =>
                  sess.id !== session.id
                    ? sess
                    : {
                        ...sess,
                        tracks: sess.tracks.map((track) =>
                          track.id === entry.id ? { ...track, keepDecisionId: recorded.decisionId } : track
                        ),
                      }
                ),
              }));
            } catch {
              // Une synchro interrompue n'efface jamais l'historique local.
            }
          }
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
