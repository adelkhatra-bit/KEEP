import { create } from 'zustand';
import { ProviderPlaylist } from '@keep/music';
import { musicEngine } from '../services/musicEngine';
import { refreshOwnSmartAlbums, smartAlbumAsProviderPlaylist } from '../services/smartAlbumService';

/**
 * Source unique de la bibliothèque visible : services musicaux connectés +
 * collections intelligentes KEEP persistées dans Supabase. Les collections
 * KEEP sont recalculées automatiquement après chaque GARDER et à chaque focus
 * de la bibliothèque/profil ; aucune action de classement n'est imposée.
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
      const [providerPlaylists, smartAlbums] = await Promise.all([
        musicEngine.musicProvider.getPlaylists(session).catch(() => [] as ProviderPlaylist[]),
        refreshOwnSmartAlbums().catch(() => []),
      ]);
      const smartPlaylists = smartAlbums
        .filter((album) => album.trackCount > 0)
        .map(smartAlbumAsProviderPlaylist);
      set({ playlists: [...smartPlaylists, ...providerPlaylists], isLoading: false });
    } catch {
      set({ playlists: [], isLoading: false });
    }
  },
}));
