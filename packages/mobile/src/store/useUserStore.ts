import { create } from 'zustand';
import { User } from '../types';

// DEMO uniquement — jamais utilisé en Mode Réel (voir docs/PROJECT_STATUS.md).
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
  isDemoMode: boolean;
  setUser: (user: User) => void;
  enterDemoMode: () => void;
  logout: () => void;
  /** Score de complétion de profil, 0-100 — utilisé par ProfileScreen. Calcul réel, pas une valeur fixe. */
  profileCompletion: () => number;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isDemoMode: false,
  setUser: (user) => set({ user, isDemoMode: false }),
  enterDemoMode: () => set({ user: DEMO_USER, isDemoMode: true }),
  logout: () => set({ user: null, isDemoMode: false }),
  profileCompletion: () => {
    const user = get().user;
    if (!user) return 0;
    const checks = [
      !!user.avatar,
      !!user.bio,
      user.playlistCount > 0,
      user.followerCount > 0,
      // Ces deux critères restent à 0 tant que provider musical / réseaux sociaux
      // ne sont pas réellement branchés — pas de fausse complétion.
      false, // service musical connecté
      false, // au moins un réseau social public ajouté
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  },
}));
