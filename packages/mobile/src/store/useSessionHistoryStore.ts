import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './safeStorage';
import { CanonicalTrack } from '@keep/music';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { commitKeep, CommitKeepResult } from '../services/keepTrackAction';
import { fetchMyKeeps, pushKeepDecision, patchKeepVisibility } from '../services/profileApi';
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
  /** Cf. useSessionStore.setTrackVisibility -- même correctif pour une session déjà archivée. */
  setTrackVisibilityInSession: (sessionId: string, entryId: string, visibility: 'PUBLIC' | 'PRIVATE') => Promise<boolean>;
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
  /**
   * BUG RÉEL corrigé le 24/08/2026 (Adel : "que son album reste
   * préenregistré, chaque mise à jour ne doit pas impacter les
   * utilisateurs") : `keep_decisions` est le vrai serveur de vérité
   * (`GET /api/social/me/keeps`) mais rien ne le lisait jamais côté client
   * -- un morceau gardé survivait au redémarrage de CET appareil
   * (AsyncStorage) mais pas à un changement d'appareil/stockage vidé, alors
   * que le serveur avait déjà la donnée. Fusionne les KEEP serveur absents
   * localement dans la pseudo-session EXTERNAL_KEEPS_SESSION_ID -- même
   * idempotence que addExternalKeep (jamais un doublon), jamais un nouvel
   * appel à commitKeep() ici (la décision existe déjà côté serveur, on
   * l'affiche, on ne la rejoue pas).
   */
  hydrateFromServer: () => Promise<void>;
}

function updateEntryStatus(
  sessions: KeepSession[],
  sessionId: string,
  entryId: string,
  status: SessionTrackStatus,
  keptPlaylistId?: string,
  syncState?: SessionTrackEntry['syncState'],
  keepId?: string
): KeepSession[] {
  return sessions.map((s) =>
    s.id !== sessionId
      ? s
      : {
          ...s,
          tracks: s.tracks.map((t) =>
            t.id === entryId
              ? { ...t, status, keptPlaylistId, syncState, ...(keepId ? { keepId, visibility: 'PUBLIC' as const } : {}) }
              : t
          ),
        }
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
        // Cf. useSessionStore.keepTrack -- même correctif, même besoin de keepId.
        const keepId = await pushKeepDecision(entry.track);
        if (keepId) set((s) => ({ sessions: updateEntryStatus(s.sessions, sessionId, entryId, 'kept', targetPlaylistId, syncState, keepId) }));
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

      setTrackVisibilityInSession: async (sessionId, entryId, visibility) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        const entry = session?.tracks.find((t) => t.id === entryId);
        if (!entry?.keepId) return false;
        const ok = await patchKeepVisibility(entry.keepId, visibility);
        if (ok) {
          set((s) => ({
            sessions: s.sessions.map((sess) =>
              sess.id !== sessionId
                ? sess
                : { ...sess, tracks: sess.tracks.map((t) => (t.id === entryId ? { ...t, visibility } : t)) }
            ),
          }));
        }
        return ok;
      },

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

        // Cf. useSessionStore.keepTrack -- même correctif : "Écoutés récemment"
        // n'écrivait, lui non plus, jamais côté serveur.
        const keepId = await pushKeepDecision(track);

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
          ...(keepId ? { keepId, visibility: 'PUBLIC' as const } : {}),
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

      hydrateFromServer: async () => {
        // BUG RÉEL corrigé le 24/08/2026 (page blanche signalée par Adel
        // juste après l'ajout de cette fonction) : `rk.tracks` accédé sans
        // garde -- une ligne `keep_decisions` dont le sous-select `tracks`
        // ne résout pas (RLS/donnée orpheline) faisait planter `.filter()`
        // en plein milieu, jetant hors de cette fonction async sans jamais
        // être attrapé (appelée fire-and-forget depuis App.tsx). Toute
        // cette fonction est maintenant défensive : une ligne malformée est
        // ignorée, jamais un crash qui prive l'utilisateur de tout l'écran.
        try {
          const remoteKeeps = await fetchMyKeeps();
          if (!remoteKeeps) return; // hors-ligne/pas de session -- l'historique local reste tel quel.

          const allLocalTracks = get().sessions.flatMap((s) => s.tracks.map((t) => t.track));
          const newEntries: SessionTrackEntry[] = [];
          // Cf. audit du 24/08/2026 (Adel -- "vérifie que backend/stockage/
          // affichage utilisent le même identifiant de keep") : un morceau
          // déjà présent localement (créé avant que le KEEP soit poussé au
          // serveur, ou avant ce correctif) n'avait jamais son `keepId`
          // rattrapé -- juste ignoré silencieusement. On le complète
          // maintenant si le serveur a bien la ligne correspondante.
          const keepIdBackfills: { keepId: string; track: CanonicalTrack; visibility: SessionTrackEntry['visibility'] }[] = [];
          for (const rk of remoteKeeps) {
            if (rk.decision !== 'KEPT' || !rk.tracks) continue;
            const track: CanonicalTrack = {
              id: rk.tracks.id,
              isrc: rk.tracks.isrc ?? undefined,
              title: rk.tracks.title,
              artist: rk.tracks.artist,
              album: rk.tracks.album ?? undefined,
              artworkUrl: rk.tracks.artwork_url ?? undefined,
              providerIds: rk.tracks.provider_ids ?? {},
            };
            if (!track.id || !track.title || !track.artist) continue; // ligne incomplète -- ignorée, jamais affichée à moitié.
            if (allLocalTracks.some((local) => sameTrack(local, track))) {
              keepIdBackfills.push({ keepId: rk.id, track, visibility: rk.visibility });
              continue; // déjà présent localement -- jamais un doublon, seul keepId est rattrapé.
            }
            newEntries.push({
              id: newId(),
              track,
              recommendations: [],
              status: 'kept' as SessionTrackStatus,
              detectedAt: rk.created_at,
              discoverySource: 'server_sync' as const,
              keepId: rk.id,
              visibility: rk.visibility,
            });
          }

          if (keepIdBackfills.length > 0) {
            set((s) => ({
              sessions: s.sessions.map((sess) => ({
                ...sess,
                tracks: sess.tracks.map((t) => {
                  if (t.keepId) return t; // déjà rattrapé, jamais écraser un id existant.
                  const match = keepIdBackfills.find((b) => sameTrack(b.track, t.track));
                  return match ? { ...t, keepId: match.keepId, visibility: match.visibility } : t;
                }),
              })),
            }));
          }

          if (newEntries.length === 0) return;

          set((s) => {
            const existing = s.sessions.find((sess) => sess.id === EXTERNAL_KEEPS_SESSION_ID);
            if (existing) {
              return {
                sessions: s.sessions.map((sess) =>
                  sess.id === EXTERNAL_KEEPS_SESSION_ID ? { ...sess, tracks: [...newEntries, ...sess.tracks] } : sess
                ),
              };
            }
            const newSession: KeepSession = {
              id: EXTERNAL_KEEPS_SESSION_ID,
              startedAt: new Date().toISOString(),
              endedAt: null,
              title: 'Écoutés récemment',
              tracks: newEntries,
            };
            return { sessions: [newSession, ...s.sessions] };
          });
        } catch (e: any) {
          console.warn('[KEEP][session-history-sync] hydrateFromServer échoué (état local conservé):', e?.message);
        }
      },
    }),
    {
      name: 'keep-session-history',
      storage: createSafeStorage(),
    }
  )
);
