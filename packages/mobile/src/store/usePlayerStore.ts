import { create } from 'zustand';
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import { musicEngine } from '../services/musicEngine';
import { usePlaylistStore } from './usePlaylistStore';

/**
 * Pipeline GARDER réel (cahier des charges §14) :
 *  1. reconnaissance (recognitionProvider.recognize)
 *  2. résolution du morceau canonique (trackResolver)
 *  3. recommandation de destination (SmartPlaylistRouter)
 *  4. GARDER -> ajout réel via musicProvider.addTrackToPlaylist + apprentissage
 *
 * En Mode Démo, chaque brique est une implémentation Demo — mais le
 * CHEMIN est identique à celui qui sera utilisé avec un provider réel
 * (Spotify/Apple Music) : aucune logique séparée "démo" vs "réel" dans ce store.
 */
interface PlayerStore {
  isListening: boolean;
  currentTrack: CanonicalTrack | null;
  recommendations: RoutingRecommendation[];
  lastConfirmation: string | null;
  error: string | null;

  startListening: () => Promise<void>;
  passSong: () => void;
  keepSong: (chosenPlaylistId?: string) => Promise<void>;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  isListening: false,
  currentTrack: null,
  recommendations: [],
  lastConfirmation: null,
  error: null,

  startListening: async () => {
    set({ isListening: true, error: null, lastConfirmation: null, currentTrack: null, recommendations: [] });
    try {
      // DEMO : pas de vrai buffer micro. En Mode Réel, un vrai échantillon
      // audio microphone (expo-av) sera passé ici — voir docs/PROJECT_STATUS.md.
      const recognition = await musicEngine.recognitionProvider.recognize(new ArrayBuffer(0));
      if (!recognition) {
        set({ isListening: false, error: 'Aucune musique reconnue.' });
        return;
      }
      const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
      const session = await musicEngine.getSession();
      const playlists = await musicEngine.musicProvider.getPlaylists(session);
      const recommendations = await musicEngine.router.recommend(session.userId, track, playlists);
      set({ isListening: false, currentTrack: track, recommendations });
    } catch (e: any) {
      set({ isListening: false, error: e?.message ?? 'Erreur de reconnaissance' });
    }
  },

  passSong: () => {
    set({ currentTrack: null, recommendations: [], lastConfirmation: null });
  },

  keepSong: async (chosenPlaylistId) => {
    const { currentTrack, recommendations } = get();
    if (!currentTrack) return;

    const topRecommendation = recommendations[0]?.playlistId ?? null;
    const targetPlaylistId = chosenPlaylistId ?? topRecommendation;
    if (!targetPlaylistId) {
      set({ error: 'Aucune playlist disponible pour ranger ce morceau.' });
      return;
    }

    try {
      const session = await musicEngine.getSession();

      // Doublon ? on ne ré-ajoute pas.
      const alreadyThere = await musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId, currentTrack);
      if (!alreadyThere) {
        await musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId, currentTrack);
      }

      // Apprentissage : accepté tel quel vs. correction.
      if (targetPlaylistId === topRecommendation) {
        await musicEngine.router.recordAccepted(session.userId, currentTrack, targetPlaylistId);
      } else {
        await musicEngine.router.recordCorrection(session.userId, {
          trackId: currentTrack.id,
          artist: currentTrack.artist,
          genres: currentTrack.genres ?? [],
          recommendedPlaylistId: topRecommendation,
          chosenPlaylistId: targetPlaylistId,
          createdAt: new Date().toISOString(),
        });
      }

      const playlistName = recommendations.find((r) => r.playlistId === targetPlaylistId)?.playlistName ?? 'ta playlist';
      set({ currentTrack: null, recommendations: [], lastConfirmation: `Rangé dans ${playlistName}` });

      // Les compteurs de MesMusiques doivent refléter l'ajout réel.
      await usePlaylistStore.getState().refresh();
    } catch (e: any) {
      set({ error: e?.message ?? 'Erreur lors du rangement' });
    }
  },
}));
