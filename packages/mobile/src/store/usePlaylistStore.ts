import { create } from 'zustand';
import { ProviderPlaylist } from '@keep/music';
import { musicEngine } from '../services/musicEngine';

/**
 * Les playlists affichées viennent TOUJOURS de musicEngine.musicProvider
 * (source unique — cf. règle "une donnée créée une seule fois puis
 * réutilisée partout"). Aucune liste mock parallèle ici.
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
    const session = await musicEngine.getSession();
    const playlists = await musicEngine.musicProvider.getPlaylists(session);
    set({ playlists, isLoading: false });
  },
}));
