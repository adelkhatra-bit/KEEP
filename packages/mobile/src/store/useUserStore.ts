import { create } from 'zustand';
import { User, SocialLink, ProfilePrivateInfo } from '../types';
import { KeepAuthSession } from '../services/authService';

/**
 * Construit un `User` minimal à partir d'une session Supabase réelle.
 * Les champs au-delà de id/email restent à leurs valeurs par défaut tant
 * que la table `profiles` n'est pas lue (aucun projet Supabase KEEP
 * déployé, voir docs/PROJECT_STATUS.md) -- pas de données de profil
 * inventées, juste une identité réelle minimale.
 */
function userFromAuthSession(session: KeepAuthSession): User {
  return {
    id: session.userId,
    username: session.email?.split('@')[0] ?? session.userId.slice(0, 8),
    email: session.email ?? '',
    avatar: '',
    bio: '',
    playlistCount: 0,
    followerCount: 0,
    followingCount: 0,
    kind: 'USER',
    favoriteGenres: [],
    favoriteArtists: [],
    socialLinks: [],
    isPublic: true,
    locationOptIn: false,
    privateInfo: {},
  };
}

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
  /** Reflète une session Supabase réelle (voir services/authService.ts) -- `null` = déconnecté. */
  syncFromAuthSession: (session: KeepAuthSession | null) => void;
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
  syncFromAuthSession: (session) =>
    set((s) => {
      // Une session Mode Démo active reste prioritaire (ne pas l'écraser
      // par un état "déconnecté" venant du client Supabase inutilisé).
      if (s.isDemoMode) return s;
      return { user: session ? userFromAuthSession(session) : null, isDemoMode: false };
    }),
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
