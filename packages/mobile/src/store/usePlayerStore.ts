import { create } from 'zustand';
import { Song } from '../types';

// DEMO: Mock current song
const DEMO_CURRENT_SONG: Song = {
  id: 'demo-1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  album: 'After Hours',
  cover: 'https://via.placeholder.com/300?text=Blinding+Lights',
  duration: 200,
  isRecognized: true,
};

interface PlayerStore {
  currentSong: Song | null;
  isPlaying: boolean;
  playSong: (song: Song) => void;
  pauseSong: () => void;
  skipSong: () => void;
  keepSong: (song: Song) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  currentSong: DEMO_CURRENT_SONG,
  isPlaying: false,
  playSong: (song) => set({ currentSong: song, isPlaying: true }),
  pauseSong: () => set({ isPlaying: false }),
  skipSong: () => {
    // DEMO: Rotate through demo songs
    const demoSongs: Song[] = [
      DEMO_CURRENT_SONG,
      {
        id: 'demo-2',
        title: 'Heat Waves',
        artist: 'Glass Animals',
        album: 'Dreamland',
        cover: 'https://via.placeholder.com/300?text=Heat+Waves',
        duration: 239,
        isRecognized: true,
      },
      {
        id: 'demo-3',
        title: 'As It Was',
        artist: 'Harry Styles',
        album: 'Harry\'s House',
        cover: 'https://via.placeholder.com/300?text=As+It+Was',
        duration: 173,
        isRecognized: true,
      },
    ];
    const randomSong = demoSongs[Math.floor(Math.random() * demoSongs.length)];
    set({ currentSong: randomSong, isPlaying: true });
  },
  keepSong: (song) => {
    // DEMO: Log to console
    console.log('🎵 KEPT:', song.title, 'by', song.artist);
    set({ currentSong: null });
  },
}));
