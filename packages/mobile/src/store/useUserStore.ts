import { create } from 'zustand';
import { User, SocialLink, ProfilePrivateInfo } from '../types';
import { KeepAuthSession } from '../services/authService';
import { musicEngine } from '../services/musicEngine';
import { usePlaylistStore } from './usePlaylistStore';
import { useSessionHistoryStore } from './useSessionHistoryStore';

function userFromAuthSession(session: KeepAuthSession): User {
  const authUsername = session.username?.trim().replace(/^@+/, '');
  const emailPrefix = session.email?.split('@')[0];
  return {
    id: session.userId,
    username: authUsername || emailPrefix || `invite-${session.userId.slice(0, 6)}`,
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

function localGuestUser(guestId: string): User {
  return {
    id: guestId,
    username: `invite-${guestId.replace(/-/g, '').slice(0, 6)}`,
    email: '',
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

const DEMO_USER: User = {
  id: 'demo-user-1',
  username: 'demouser',
  email: '',
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

function clearLocalMusicIdentity() {
  // L'historique, les playlists en mémoire et la session du provider local
  // appartiennent à UNE identité. Aucun de ces éléments ne doit fuiter vers
  // le compte suivant ni vers la démo. Supprimer aussi la copie persistée
  // évite qu'une hydratation AsyncStorage tardive réinjecte les morceaux du
  // compte précédent après le changement d'identité.
  useSessionHistoryStore.getState().clearSessions();
  void useSessionHistoryStore.persist.clearStorage();
  usePlaylistStore.setState({ playlists: [], isLoading: false });
  musicEngine.resetLocalLibrary();
}

interface UserStore {
  user: User | null;
  isDemoMode: boolean;
  isAnonymous: boolean;
  isLocalGuest: boolean;
  setUser: (user: User) => void;
  enterDemoMode: () => void;
  enterGuestMode: (guestId: string) => void;
  logout: () => void;
  syncFromAuthSession: (session: KeepAuthSession | null) => void;
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
  isAnonymous: false,
  isLocalGuest: false,
  setUser: (user) => set((s) => ({ user, isDemoMode: false, isAnonymous: s.isAnonymous, isLocalGuest: s.isLocalGuest })),
  enterDemoMode: () => {
    clearLocalMusicIdentity();
    set({ user: DEMO_USER, isDemoMode: true, isAnonymous: false, isLocalGuest: false });
  },
  enterGuestMode: (guestId) => {
    const state = get();
    if (!state.isLocalGuest || state.user?.id !== guestId) clearLocalMusicIdentity();
    set({ user: localGuestUser(guestId), isDemoMode: false, isAnonymous: true, isLocalGuest: true });
  },
  logout: () => {
    clearLocalMusicIdentity();
    set({ user: null, isDemoMode: false, isAnonymous: false, isLocalGuest: false });
  },
  syncFromAuthSession: (session) => {
    const state = get();
    const currentIsReal = Boolean(state.user && !state.isDemoMode && !state.isLocalGuest);
    const currentRealId = currentIsReal ? state.user?.id ?? null : null;
    const nextRealId = session?.userId ?? null;

    // Au bootstrap comme lors d'un changement invité/démo/compte, la musique
    // locale ne peut pas être supposée appartenir au prochain auth.uid(). On
    // repart donc du serveur pour le compte authentifié.
    if (nextRealId && (!currentRealId || currentRealId !== nextRealId || state.isDemoMode || state.isLocalGuest)) {
      clearLocalMusicIdentity();
    }

    set((s) => {
      if (s.isDemoMode && !session) return s;
      if (s.isLocalGuest && !session) return s;
      if (!session) return { user: null, isDemoMode: false, isAnonymous: false, isLocalGuest: false };

      if (s.user && s.user.id === session.userId) {
        const sessionUsername = session.username?.trim().replace(/^@+/, '');
        return {
          user: {
            ...s.user,
            username: s.user.username || sessionUsername || s.user.username,
            email: session.email ?? s.user.email,
          },
          isDemoMode: false,
          isAnonymous: session.isAnonymous,
          isLocalGuest: false,
        };
      }

      return {
        user: userFromAuthSession(session),
        isDemoMode: false,
        isAnonymous: session.isAnonymous,
        isLocalGuest: false,
      };
    });
  },
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
      false,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  },

  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  addFavoriteGenre: (genre) => set((s) => {
    const trimmed = genre.trim();
    if (!s.user || !trimmed || s.user.favoriteGenres.includes(trimmed)) return s;
    return { user: { ...s.user, favoriteGenres: [...s.user.favoriteGenres, trimmed] } };
  }),
  removeFavoriteGenre: (genre) => set((s) => (s.user ? { user: { ...s.user, favoriteGenres: s.user.favoriteGenres.filter((g) => g !== genre) } } : s)),
  addFavoriteArtist: (artist) => set((s) => {
    const trimmed = artist.trim();
    if (!s.user || !trimmed || s.user.favoriteArtists.includes(trimmed)) return s;
    return { user: { ...s.user, favoriteArtists: [...s.user.favoriteArtists, trimmed] } };
  }),
  removeFavoriteArtist: (artist) => set((s) => (s.user ? { user: { ...s.user, favoriteArtists: s.user.favoriteArtists.filter((a) => a !== artist) } } : s)),
  addSocialLink: (link) => set((s) => {
    if (!s.user) return s;
    const withoutExisting = s.user.socialLinks.filter((l) => l.platform !== link.platform);
    return { user: { ...s.user, socialLinks: [...withoutExisting, link] } };
  }),
  removeSocialLink: (platform) => set((s) => (s.user ? { user: { ...s.user, socialLinks: s.user.socialLinks.filter((l) => l.platform !== platform) } } : s)),
  toggleSocialLinkVisibility: (platform) => set((s) => {
    if (!s.user) return s;
    return {
      user: {
        ...s.user,
        socialLinks: s.user.socialLinks.map((l) => l.platform === platform ? { ...l, visibility: l.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' } : l),
      },
    };
  }),
  setPrivateInfo: (patch) => set((s) => (s.user ? { user: { ...s.user, privateInfo: { ...s.user.privateInfo, ...patch } } } : s)),
}));