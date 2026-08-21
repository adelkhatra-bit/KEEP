import { create } from 'zustand';
import { Playlist } from '../types';

// DEMO: Mock playlists
const DEMO_PLAYLISTS: Playlist[] = [
  {
    id: 'demo-pl-1',
    name: 'My Favorites',
    description: 'Songs I love',
    songCount: 47,
    cover: 'https://via.placeholder.com/150?text=Favorites',
    isSmartPlaylist: false,
  },
  {
    id: 'demo-pl-2',
    name: 'Workout Mix',
    description: 'High energy tracks',
    songCount: 23,
    cover: 'https://via.placeholder.com/150?text=Workout',
    isSmartPlaylist: false,
  },
  {
    id: 'demo-pl-3',
    name: '🎵 Auto-Sorted by Mood',
    description: 'SmartPlaylistRouter - automatically organized',
    songCount: 156,
    cover: 'https://via.placeholder.com/150?text=Smart+Router',
    isSmartPlaylist: true,
  },
];

interface PlaylistStore {
  playlists: Playlist[];
  addPlaylist: (playlist: Playlist) => void;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: DEMO_PLAYLISTS,
  addPlaylist: (playlist) =>
    set((state) => ({ playlists: [...state.playlists, playlist] })),
}));
