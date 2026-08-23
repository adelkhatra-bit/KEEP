import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CanonicalTrack } from '@keep/music';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { commitKeep, CommitKeepResult } from '../services/keepTrackAction';
import { musicEngine } from '../services/musicEngine';
import { useMusicServiceStore } from './useMusicServiceStore';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sameTrack(a: CanonicalTrack, b: CanonicalTrack): boolean {
  if (a.isrc && b.isrc) return a.isrc === b.isrc;
  return a.title === b.title && a.artist === b.artist;
}

/**
 * Pseudo-session fixe qui regroupe tous les KEEP faits HORS d'une session
 * micro live (ex. "Écoutés récemment" Spotify, cf. demande explicite du
 * 23/08/2026) -- id stable pour retrouver/réutiliser toujours la même
 * plutôt que d'en créer une nouvelle à chaque KEEP, ce qui éparpillerait ces
 * morceaux dans "Mes Sessions" au lieu de les regrouper proprement. Un seul
 * chemin "Mes KEEP" au final (voir MyMusicScreen -- lit toutes les sessions
 * confondues), jamais une deuxième liste parallèle déconnectée.
 */
const EXTERNAL_KEEPS_SESSION_ID = 'keep-external-recently-played';

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
  /**
   * Les morceaux gardés eux-mêmes (pas juste leur compte) -- affiché
   * directement dans "Mes musiques" pour que l'utilisateur voie CE QU'IL A
   * gardé, jamais une liste figée déconnectée de ses vraies décisions (cf.
   * demande explicite du 23/08/2026 : "je ne veux rien de dur dans le
   * système").
   */
  getWaitingTracks: () => { sessionId: string; entry: SessionTrackEntry }[];
  /** Renomme un morceau pour l'utilisateur uniquement -- jamais renvoyé au provider, jamais imposé. */
  renameTrackInSession: (sessionId: string, entryId: string, customTitle: string) => void;
  /** Appelée une fois un service musical connecté (voir useMusicServiceStore) — rejoue GARDER pour chaque morceau en attente. */
  syncAllWaitingTracks: () => Promise<void>;
  /**
   * GARDER un morceau découvert HORS d'une session micro live (ex. bouton
   * KEEP sur "Écoutés récemment", voir useRecentlyPlayedStore.ts) -- même
   * chemin réel que keepTrackInSession (commitKeep + refresh "Mes musiques"),
   * regroupé dans la pseudo-session EXTERNAL_KEEPS_SESSION_ID pour rester
   * visible dans "Mes KEEP" sans polluer "Mes Sessions" d'une entrée par morceau.
   * Idempotent : un morceau déjà présent (même ISRC ou même titre+artiste)
   * n'est jamais ajouté une seconde fois (cf. demande explicite du
   * 23/08/2026 : "pagination/synchronisation sans doublons").
   */
  addExternalKeep: (track: CanonicalTrack, discoverySource: 'recently_played') => Promise<CommitKeepResult>;
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

      getWaitingTracks: () =>
        get().sessions.flatMap((s) =>
          s.tracks
            .filter((t) => t.status === 'kept' && t.syncState === 'waiting_sync')
            .map((entry) => ({ sessionId: s.id, entry }))
        ),

      renameTrackInSession: (sessionId, entryId, customTitle) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId
              ? sess
              : { ...sess, tracks: sess.tracks.map((t) => (t.id === entryId ? { ...t, customTitle } : t)) }
          ),
        })),

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

      addExternalKeep: async (track, discoverySource) => {
        const pseudoSession = get().sessions.find((s) => s.id === EXTERNAL_KEEPS_SESSION_ID);
        const already = pseudoSession?.tracks.find((t) => sameTrack(t.track, track));
        if (already) {
          return { syncState: already.syncState ?? 'synced', targetService: undefined, targetPlaylistId: already.keptPlaylistId };
        }

        // Mêmes recommandations "où ranger" que la session live (voir
        // useSessionStore.ts) -- aucun service connecté = liste vide,
        // commitKeep() gère déjà honnêtement ce cas (syncState 'waiting_sync').
        const hasService = useMusicServiceStore.getState().connectedServices.length > 0;
        const recommendations = hasService
          ? await (async () => {
              const session = await musicEngine.getSession();
              const playlists = await musicEngine.musicProvider.getPlaylists(session);
              return musicEngine.router.recommend(session.userId, track, playlists);
            })()
          : [];

        const result = await commitKeep(track, recommendations);

        const availability = await musicEngine
          .getConnectedProviders()
          .then((connected) => musicEngine.universalResolver.resolveAvailability(track, connected))
          .then((r) => r.perProvider)
          .catch(() => undefined);

        const entry: SessionTrackEntry = {
          id: newId(),
          track,
          recommendations,
          status: 'kept',
          detectedAt: new Date().toISOString(),
          keptPlaylistId: result.targetPlaylistId,
          syncState: result.syncState,
          discoverySource,
          availability,
        };

        set((s) => {
          const existing = s.sessions.find((sess) => sess.id === EXTERNAL_KEEPS_SESSION_ID);
          if (existing) {
            return {
              sessions: s.sessions.map((sess) =>
                sess.id === EXTERNAL_KEEPS_SESSION_ID ? { ...sess, tracks: [entry, ...sess.tracks] } : sess
              ),
            };
          }
          const newSession: KeepSession = {
            id: EXTERNAL_KEEPS_SESSION_ID,
            startedAt: new Date().toISOString(),
            endedAt: null,
            title: 'Écoutés récemment',
            tracks: [entry],
          };
          return { sessions: [newSession, ...s.sessions] };
        });

        return result;
      },
    }),
    {
      name: 'keep-session-history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
