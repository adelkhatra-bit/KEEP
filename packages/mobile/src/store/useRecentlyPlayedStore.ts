import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './safeStorage';
import { CanonicalTrack, SpotifyProvider } from '@keep/music';
import { musicEngine } from '../services/musicEngine';
import { useMusicServiceStore } from './useMusicServiceStore';
import { useSessionHistoryStore } from './useSessionHistoryStore';

/**
 * Section "Écoutés récemment" du profil (cf. demande explicite du
 * 23/08/2026 -- GET /v1/me/player/recently-played, "sans aucune saisie
 * manuelle", "aucune donnée fictive"). Source unique : Spotify réellement
 * connecté (voir useMusicServiceStore) -- aucune autre plateforme n'a
 * d'équivalent "récemment écouté" câblé pour l'instant, ce store ne doit
 * donc JAMAIS être alimenté autrement qu'un vrai appel Spotify réussi.
 *
 * SYNC SANS DOUBLONS : `lastSyncedPlayedAtMs` mémorise l'écoute la plus
 * récente déjà connue -- une resynchronisation ne redemande que ce qui est
 * arrivé APRÈS (paramètre `after` de l'API Spotify), puis fusionne par clé
 * stable `${spotifyTrackId}-${playedAt}` (un même morceau peut légitimement
 * apparaître plusieurs fois avec des horodatages différents -- CE N'EST PAS
 * un doublon). Persisté (AsyncStorage) comme le reste de l'état KEEP local.
 */
export interface RecentlyPlayedEntry {
  key: string;
  track: CanonicalTrack;
  playedAt: string;
  /** KEEP déjà effectué pour cette écoute précise -- évite un double-ajout si l'utilisateur retape KEEP. */
  kept: boolean;
}

interface RecentlyPlayedStore {
  items: RecentlyPlayedEntry[];
  lastSyncedPlayedAtMs: number | null;
  syncing: boolean;
  error: string | null;
  sync: () => Promise<void>;
  /** `false` = crédit épuisé, morceau NON gardé (voir checkRecognitionCredit) -- l'appelant doit alors proposer inscription/upgrade. */
  keepTrack: (key: string) => Promise<boolean>;
}

const MAX_STORED_ITEMS = 100;

export const useRecentlyPlayedStore = create<RecentlyPlayedStore>()(
  persist(
    (set, get) => ({
      items: [],
      lastSyncedPlayedAtMs: null,
      syncing: false,
      error: null,

      sync: async () => {
        if (!useMusicServiceStore.getState().connectedServices.includes('spotify')) {
          // État normal (Spotify pas connecté), pas une erreur -- l'UI gère
          // déjà ce cas via l'écran (message "Connecter Spotify").
          return;
        }
        if (get().syncing) return;
        set({ syncing: true, error: null });
        try {
          const provider = musicEngine.getProvider('spotify') as SpotifyProvider;
          const session = await musicEngine.getSessionFor('spotify');
          const afterMs = get().lastSyncedPlayedAtMs ?? undefined;
          const fetched = await provider.getRecentlyPlayed(session, { afterMs });

          set((s) => {
            const byKey = new Map(s.items.map((e) => [e.key, e]));
            for (const { track, playedAt } of fetched) {
              const key = `${track.providerIds.spotify}-${playedAt}`;
              if (!byKey.has(key)) byKey.set(key, { key, track, playedAt, kept: false });
            }
            const merged = Array.from(byKey.values())
              .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
              .slice(0, MAX_STORED_ITEMS);
            const newest = merged[0] ? Date.parse(merged[0].playedAt) : s.lastSyncedPlayedAtMs;
            return { items: merged, lastSyncedPlayedAtMs: newest, syncing: false };
          });
        } catch (e: any) {
          // Détail technique en console uniquement -- l'UI affiche juste
          // "pas de nouvelles écoutes" plutôt qu'une erreur brute (même
          // philosophie que useSessionStore.ts pour la reconnaissance).
          console.warn('[KEEP][recently-played]', e?.message);
          set({ syncing: false, error: e?.message ?? 'Erreur de synchronisation Spotify' });
        }
      },

      keepTrack: async (key) => {
        const entry = get().items.find((e) => e.key === key);
        if (!entry || entry.kept) return true;
        // Réutilise EXACTEMENT le même chemin GARDER que la session live
        // (voir useSessionHistoryStore.addExternalKeep) -- une seule
        // implémentation de "où range-t-on un morceau", jamais un second
        // système parallèle pour "Écoutés récemment" (cf. règle anti-doublon
        // établie pour commitKeep).
        const result = await useSessionHistoryStore.getState().addExternalKeep(entry.track, 'recently_played');
        // BUG RÉEL trouvé le 24/08/2026 (en ajoutant le contrôle de quota au
        // vrai GARDER) : ce store marquait TOUJOURS `kept: true`, même si
        // addExternalKeep n'avait rien gardé du tout (crédit épuisé) --
        // mentait à l'utilisateur sur l'état réel.
        if (result.blocked) return false;
        set((s) => ({ items: s.items.map((e) => (e.key === key ? { ...e, kept: true } : e)) }));
        return true;
      },
    }),
    { name: 'keep-recently-played', storage: createSafeStorage() }
  )
);
