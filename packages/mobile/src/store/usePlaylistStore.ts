import { create } from 'zustand';
import { ProviderPlaylist } from '@keep/music';
import { musicEngine } from '../services/musicEngine';

/**
 * Source des playlists du fournisseur musical connecté.
 *
 * Les Vibes intelligentes Loki sont gérées séparément par les écrans qui les
 * affichent (`MyMusicScreen` et `ProfilePublicScreen`) via `smartAlbumService`.
 * Les injecter aussi ici créait exactement le même smart album deux fois :
 * une fois via ce store, puis une seconde fois via `smartAlbums` dans l'écran.
 * Résultat visible : Vibes/Albums mélangés et listes qui semblaient rester
 * affichées après un changement d'onglet.
 */
interface PlaylistStore {
  playlists: ProviderPlaylist[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: [],
  isLoading: false,
  refresh: async () => {
    set({ isLoading: true });
    try {
      const session = await musicEngine.getSession();
      const providerPlaylists = await musicEngine.musicProvider.getPlaylists(session).catch(() => [] as ProviderPlaylist[]);
      set({ playlists: providerPlaylists, isLoading: false });
    } catch {
      set({ playlists: [], isLoading: false });
    }
  },
}));
