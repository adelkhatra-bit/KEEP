import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  // Session invitée (Supabase Auth anonyme, cf. demande explicite du
  // 23/08/2026) : email vide, pas juste absent -- ?? ne suffit pas
  // ('' n'est pas nullish), d'où le || explicite ci-dessous.
  const emailPrefix = session.email?.split('@')[0];
  return {
    id: session.userId,
    username: (emailPrefix || `invité-${session.userId.slice(0, 6)}`),
    email: session.email ?? '',
    avatar: '',
    bio: '',
    playlistCount: 0,
    followerCount: 0,
    followingCount: 0,
    kind: 'USER',
    plan: 'FREE', // Un vrai compte démarre toujours FREE -- aucun palier payant n'est jamais attribué sans paiement réel (pas encore branché, voir docs/PRICING_STRATEGY.md).
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
  plan: 'PREMIUM', // Mode Démo uniquement -- illustre le badge de certification, changeable depuis Profil.
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

/**
 * Persisté en local (AsyncStorage) -- cf. demande explicite du 23/08/2026 :
 * "si j'ai fait mon profil... arrête d'effacer des choses qui ont déjà été
 * faites". Avant ce correctif, useUserStore n'avait AUCUNE persistance : un
 * profil rempli (nom, bio, genres favoris...) disparaissait à chaque
 * rechargement de page -- un vrai bug, pas une impression. Même statut
 * honnête que useSessionHistoryStore : persistance locale tant qu'aucun
 * projet Supabase KEEP n'est déployé (voir docs/PROJECT_STATUS.md) --
 * survit à la fermeture de l'app, pas encore synchronisé entre appareils.
 */
export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
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
      if (!session) return { user: null, isDemoMode: false };

      // BUG RÉEL diagnostiqué le 23/08/2026 ("ça fait 10 fois que je fais
      // mon profil, ça s'efface") : cette fonction est appelée à CHAQUE
      // événement Supabase Auth, pas seulement à la connexion -- y compris
      // TOKEN_REFRESHED (rafraîchissement silencieux automatique en tâche de
      // fond, toutes les ~heures) et un refocus d'onglet. Reconstruire un
      // User vierge à chaque fois écrasait bio/genres/artistes/avatar/liens
      // sociaux même en pleine session continue, sans que l'utilisateur n'ait
      // rien fait de mal. Un User minimal n'est reconstruit QUE pour une
      // identité réellement nouvelle (id différent, ou d'abord null) --
      // même id = même personne qui se reconfirme, son profil ne bouge pas.
      // Profite aussi à la conversion invité -> compte réel (même auth.uid()
      // conservé par Supabase) : le profil rempli en tant qu'invité survit
      // désormais à l'inscription au lieu d'être remplacé par un profil vide.
      if (s.user && s.user.id === session.userId) {
        return s.user.email === (session.email ?? '') ? s : { user: { ...s.user, email: session.email ?? '' } };
      }
      return { user: userFromAuthSession(session), isDemoMode: false };
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
    }),
    { name: 'keep-user', storage: createJSONStorage(() => AsyncStorage) }
  )
);
