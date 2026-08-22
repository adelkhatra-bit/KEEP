import { create } from 'zustand';
import { User, SocialLink, ProfilePrivateInfo } from '../types';

// DEMO uniquement — jamais utilisé en Mode Réel (voir docs/PROJECT_STATUS.md).
const DEMO_USER: User = {
  id: 'demo-user-1',
  username: 'demouser',
  email: 'demo@keep.app',
  avatar: 'https://via.placeholder.com/100?text=Avatar',
  bio: 'Music lover 🎵',
  playlistCount: 12,
  followerCount: 342,
  followingCount: 128,
  kind: 'USER',
  favoriteGenres: [],
  favoriteArtists: [],
  socialLinks: [],
  isPublic: true,
  locationOptIn: false,
  privateInfo: {},
};

interface UserStore {
  user: User | null;
  isDemoMode: boolean;
  setUser: (user: User) => void;
  enterDemoMode: () => void;
  logout: () => void;
  /** Score de complétion de profil, 0-100 — utilisé par ProfileScreen. Calcul réel, pas une valeur fixe. */
  profileCompletion: () => number;

  updateUser: (patch: Partial<User>) => void;
  addFavoriteGenre: (genre: string) => void;
  removeFavoriteGenre: (genre: string) => void;
  addFavoriteArtist: (artist: string) => void;
  removeFavoriteArtist: (artist: string) => void;
  addSocialLink: (link: SocialLink) => void;
  removeSocialLink: (platform: SocialLink['platform']) => void;
  toggleSocialLinkVisibility: (platform: SocialLink['platform']) => void;
  setPrivateInfo: (patch: Partial<ProfilePrivateInfo>) => void;
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
      user.favoriteGenres.length > 0 || user.favoriteArtists.length > 0,
      user.socialLinks.some((l) => l.visibility === 'PUBLIC'),
      !!user.city || !!user.countryCode,
      // Reste à 0 tant que provider musical réel n'est pas branché — pas de fausse complétion.
      false, // service musical connecté
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  },

  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),

  addFavoriteGenre: (genre) =>
    set((s) => {
      const trimmed = genre.trim();
      if (!s.user || !trimmed || s.user.favoriteGenres.includes(trimmed)) return s;
      return { user: { ...s.user, favoriteGenres: [...s.user.favoriteGenres, trimmed] } };
    }),
  removeFavoriteGenre: (genre) =>
    set((s) => (s.user ? { user: { ...s.user, favoriteGenres: s.user.favoriteGenres.filter((g) => g !== genre) } } : s)),

  addFavoriteArtist: (artist) =>
    set((s) => {
      const trimmed = artist.trim();
      if (!s.user || !trimmed || s.user.favoriteArtists.includes(trimmed)) return s;
      return { user: { ...s.user, favoriteArtists: [...s.user.favoriteArtists, trimmed] } };
    }),
  removeFavoriteArtist: (artist) =>
    set((s) => (s.user ? { user: { ...s.user, favoriteArtists: s.user.favoriteArtists.filter((a) => a !== artist) } } : s)),

  addSocialLink: (link) =>
    set((s) => {
      if (!s.user) return s;
      const withoutExisting = s.user.socialLinks.filter((l) => l.platform !== link.platform);
      return { user: { ...s.user, socialLinks: [...withoutExisting, link] } };
    }),
  removeSocialLink: (platform) =>
    set((s) => (s.user ? { user: { ...s.user, socialLinks: s.user.socialLinks.filter((l) => l.platform !== platform) } } : s)),
  toggleSocialLinkVisibility: (platform) =>
    set((s) => {
      if (!s.user) return s;
      return {
        user: {
          ...s.user,
          socialLinks: s.user.socialLinks.map((l) =>
            l.platform === platform ? { ...l, visibility: l.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' } : l
          ),
        },
      };
    }),

  setPrivateInfo: (patch) =>
    set((s) => (s.user ? { user: { ...s.user, privateInfo: { ...s.user.privateInfo, ...patch } } } : s)),
}));
