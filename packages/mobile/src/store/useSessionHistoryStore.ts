import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeepSession, KeepVisibility, SessionTrackStatus } from '../types';
import { commitKeep } from '../services/keepTrackAction';
import { getDownloadCreditStatus } from '../services/creditService';
import { recordKeepDecision, updateKeepDecisionVisibility } from '../services/keepMusicCoreRecognition';

interface SessionHistoryStore {
  sessions: KeepSession[];
  addSession: (session: KeepSession) => void;
  upsertSession: (session: KeepSession) => void;
  deleteSession: (sessionId: string) => void;
  clearSessions: () => void;
  renameSession: (sessionId: string, title: string) => void;
  keepTrackInSession: (sessionId: string, entryId: string, playlistId?: string, visibility?: KeepVisibility) => Promise<void>;
  passTrackInSession: (sessionId: string, entryId: string) => void;
  setTrackVisibilityInSession: (sessionId: string, entryId: string, visibility: KeepVisibility) => Promise<void>;
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
              ? { ...track, creditLocked: true, visibility: 'PRIVATE' as KeepVisibility }
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
