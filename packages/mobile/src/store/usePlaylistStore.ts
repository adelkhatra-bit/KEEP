import { create } from 'zustand';
import { Playlist } from '../types';

// DEMO: Mock playlists
const DEMO_PLAYLISTS: Playlist[] = [
  {
    id: 'playlist-1',
    name: 'Summer Vibes',
    description: 'Feel-good summer tracks',
    songCount: 32,
    cover: 'https://via.placeholder.com/100?text=Summer',
    isSmartPlaylist: false,
  },
  {
    id: 'playlist-2',
    name: 'Workout Mix',
    description: 'High energy songs',
    songCount: 28,
    cover: 'https://via.placeholder.com/100?text=Workout',
    isSmartPlaylist: true,
  },
  {
    id: 'playlist-3',
    name: 'Chill Evening',
    description: 'Relaxing ambient sounds',
    songCount: 45,
    cover: 'https://via.placeholder.com/100?text=Chill',
    isSmartPlaylist: false,
  },
];

interface PlaylistStore {
  playlists: Playlist[];
  addPlaylist: (playlist: Playlist) => void;
  removePlaylist: (id: string) => void;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: DEMO_PLAYLISTS,
  addPlaylist: (playlist) =>
    set((state) => ({
      playlists: [...state.playlists, playlist],
    })),
  removePlaylist: (id) =>
    set((state) => ({
      playlists: state.playlists.filter((p) => p.id !== id),
    })),
}));