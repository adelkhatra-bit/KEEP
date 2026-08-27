import { create } from 'zustand';
import { User, SocialLink, ProfilePrivateInfo } from '../types';
import { KeepAuthSession } from '../services/authService';
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

// La démo publique doit toujours commencer vierge : aucune musique, aucun faux
// compteur, aucune bio fictive. L'utilisateur construit lui-même ce qu'il voit.
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
  // L'historique d'écoute est volontairement local. Il ne doit jamais fuiter
  // d'un compte vers un autre ni apparaître dans une nouvelle démo.
  useSessionHistoryStore.getState().clearSessions();
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

    // Passage compte réel -> autre compte / déconnexion : aucune musique locale
    // du premier utilisateur ne doit pouvoir être affichée ou synchronisée au second.
    // L'upgrade essai local -> compte réel est l'exception voulue : les KEEP de
    // l'essai appartiennent précisément à la personne qui vient de créer le compte.
    if ((currentRealId && currentRealId !== nextRealId) || (state.isDemoMode && nextRealId)) {
      clearLocalMusicIdentity();
    }

    set((s) => {
      // Le mode démo reste actif seulement si aucune vraie session n'existe.
      if (s.isDemoMode && !session) return s;
      // Un invité local est volontairement indépendant de Supabase Auth :
      // un simple getSession() vide ne doit pas le renvoyer à l'onboarding.
      if (s.isLocalGuest && !session) return s;
      if (!session) return { user: null, isDemoMode: false, isAnonymous: false, isLocalGuest: false };

      // Même uid = même personne. Un refresh de token ne doit jamais écraser
      // le profil déjà chargé/modifié. Le pseudo des métadonnées KEEP peut en
      // revanche compléter une identité minimale si le profil est encore vide.
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
  setPrivateInfo: (patch) => set((s) => (s.user ? { user: { ...s.user, privateInfo: { ...s.user.privateInfo, ...patch } } : s)),
}));
