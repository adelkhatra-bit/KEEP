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

const WEB_LAST_REAL_USER_KEY = '__keep_last_real_user_v1';

function cachedWebRealUser(): User | null {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(WEB_LAST_REAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = String(parsed?.id || '').trim();
    const username = String(parsed?.username || '').trim().replace(/^@+/, '');
    if (!id || !username) return null;
    // Snapshot volontairement minimal et non sensible : il sert uniquement à
    // éviter le flash Onboarding/"Loki Music" pendant que Supabase restaure
    // sa session persistée après F5. Le vrai profil remplace ce placeholder
    // dès que handleSession charge Supabase.
    return {
      id,
      username,
      email: '',
      avatar: typeof parsed?.avatar === 'string' ? parsed.avatar : '',
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
  } catch {
    return null;
  }
}

function cacheWebRealUser(user: User | null) {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return;
    if (!user) {
      storage.removeItem(WEB_LAST_REAL_USER_KEY);
      return;
    }
    storage.setItem(WEB_LAST_REAL_USER_KEY, JSON.stringify({
      id: user.id,
      username: user.username,
      avatar: user.avatar || '',
    }));
  } catch {
    // Navigation/auth remain functional if browser storage is unavailable.
  }
}

function clearLocalMusicIdentity() {
  // Un changement EXPLICITE d'identité (déconnexion, autre vrai compte, démo)
  // repart sans la musique du compte précédent. En revanche, le bootstrap
  // d'authentification d'un même compte ne doit jamais vider l'historique déjà
  // hydraté depuis AsyncStorage : c'était la cause de sessions qui semblaient
  // disparaître après un reload.
  // IMPORTANT: l'historique d'écoute appartient à l'utilisateur et ne doit
  // jamais être détruit par une transition d'authentification ou une mise à
  // jour. La séparation par compte doit se faire par stockage/synchronisation,
  // pas par effacement. Seule l'action explicite de suppression d'une session
  // peut retirer son affichage.
  usePlaylistStore.setState({ playlists: [], isLoading: false });
  musicEngine.resetLocalLibrary();
}

function clearAppleMusicIdentity(profileId?: string | null) {
  if (!profileId) return;
  void import('../services/appleMusicAuth')
    .then(({ clearSavedMusicUserToken }) => clearSavedMusicUserToken(profileId))
    .catch(() => {});
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
  // Ne jamais monter les écrans authentifiés à partir du snapshot web minimal.
  // Au refresh, Supabase restaure d'abord la vraie session puis hydrate le profil.
  // Sinon les écrans partent avec le bon UUID mais sans JWT prêt, chargent FREE/
  // musiques/profil à vide et ne relancent pas forcément leurs effets car l'UUID
  // reste identique après hydratation.
  user: null,
  isDemoMode: false,
  isAnonymous: false,
  isLocalGuest: false,
  setUser: (user) => set((s) => {
    cacheWebRealUser(user);
    if (s.user?.id && s.user.id !== user.id) {
      clearAppleMusicIdentity(s.user.id);
      clearLocalMusicIdentity();
    }
    // Invariant globale : setUser() n'est utilisé que pour un profil réel
    // hydraté depuis Supabase. Il est interdit de conserver un ancien état
    // invité/démo après le chargement d'un compte réel, sinon toutes les
    // fonctions gated (chat, Pépites, soirées, notifications...) peuvent
    // afficher à tort "connecte-toi" pour cet utilisateur.
    return { user, isDemoMode: false, isAnonymous: false, isLocalGuest: false };
  }),
  enterDemoMode: () => {
    cacheWebRealUser(null);
    clearAppleMusicIdentity(get().user?.id);
    clearLocalMusicIdentity();
    set({ user: DEMO_USER, isDemoMode: true, isAnonymous: false, isLocalGuest: false });
  },
  enterGuestMode: (guestId) => {
    cacheWebRealUser(null);
    const state = get();
    if (!state.isLocalGuest || state.user?.id !== guestId) {
      clearAppleMusicIdentity(state.user?.id);
      clearLocalMusicIdentity();
    }
    set({ user: localGuestUser(guestId), isDemoMode: false, isAnonymous: true, isLocalGuest: true });
  },
  logout: () => {
    cacheWebRealUser(null);
    clearAppleMusicIdentity(get().user?.id);
    clearLocalMusicIdentity();
    set({ user: null, isDemoMode: false, isAnonymous: false, isLocalGuest: false });
  },
  syncFromAuthSession: (session) => {
    const state = get();
    const currentIsReal = Boolean(state.user && !state.isDemoMode && !state.isLocalGuest);
    const currentRealId = currentIsReal ? state.user?.id ?? null : null;
    const nextRealId = session?.userId ?? null;

    // Ne jamais effacer au simple bootstrap null -> compte réel : le store
    // d'historique peut déjà avoir été hydraté et contient alors les sessions
    // du même utilisateur. On purge uniquement lorsqu'on sait qu'il s'agit
    // réellement d'une AUTRE identité, ou lorsqu'on quitte volontairement la
    // démo. Une conversion invité -> compte conserve également ses sessions,
    // conformément au parcours d'inscription Loki.
    const switchingRealAccount = Boolean(nextRealId && currentRealId && currentRealId !== nextRealId);
    const leavingDemoForReal = Boolean(nextRealId && state.isDemoMode);
    if (switchingRealAccount || leavingDemoForReal) {
      clearAppleMusicIdentity(state.user?.id);
      clearLocalMusicIdentity();
    }

    set((s) => {
      if (s.isDemoMode && !session) return s;
      if (s.isLocalGuest && !session) return s;
      if (!session) {
        cacheWebRealUser(null);
        return { user: null, isDemoMode: false, isAnonymous: false, isLocalGuest: false };
      }

      if (s.user && s.user.id === session.userId) {
        const sessionUsername = session.username?.trim().replace(/^@+/, '');
        const nextUser = {
          ...s.user,
          username: s.user.username || sessionUsername || s.user.username,
          email: session.email ?? s.user.email,
        };
        cacheWebRealUser(nextUser);
        return {
          user: nextUser,
          isDemoMode: false,
          isAnonymous: session.isAnonymous,
          isLocalGuest: false,
        };
      }

      const nextUser = userFromAuthSession(session);
      cacheWebRealUser(nextUser);
      return {
        user: nextUser,
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
