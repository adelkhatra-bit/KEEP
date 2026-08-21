import { create } from 'zustand';
import { User } from '../types';

// DEMO: Mock user
const DEMO_USER: User = {
  id: 'demo-user-1',
  username: 'demouser',
  email: 'demo@keep.app',
  avatar: 'https://via.placeholder.com/100?text=Avatar',
  bio: 'Music lover 🎵',
  playlistCount: 12,
  followerCount: 342,
};

interface UserStore {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  user: DEMO_USER,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
