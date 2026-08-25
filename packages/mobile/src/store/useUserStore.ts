import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './safeStorage';
import { User, SocialLink, ProfilePrivateInfo, LinkVisibility } from '../types';
import { KeepAuthSession } from '../services/authService';
import { fetchRemoteProfile, pushProfilePatch, pushPrivateInfoPatch, pushSocialLinks, RemoteProfile } from '../services/profileApi';

/** Mappe les champs `User` (camelCase) réellement gérés par `profiles` vers le PATCH backend (snake_case) -- cf. routes/social.ts `allowed`. */
function toProfilePatch(patch: Partial<User>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('username' in patch) { out.username = patch.username; out.display_name = patch.username; }
  if ('bio' in patch) out.bio = patch.bio;
  if ('avatar' in patch) out.avatar_url = patch.avatar;
  if ('city' in patch) out.city = patch.city;
  if ('countryCode' in patch) out.country_code = patch.countryCode;
  if ('kind' in patch) out.kind = patch.kind;
  if ('isPublic' in patch) out.is_public = patch.isPublic;
  if ('locationOptIn' in patch) out.location_opt_in = patch.locationOptIn;
  return out;
}

function socialLinksForServer(links: SocialLink[]) {
  return links.map((l) => ({ platform: l.platform, url: l.url, visibility: l.visibility }));
}

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
  /** Session invitée Supabase (anonyme) vs vrai compte -- cf. bug réel du 24/08/2026 : jamais suivi côté client avant ce correctif, donc ProfileScreen ne pouvait pas proposer la création de compte à un invité (seule sortie possible : se déconnecter d'abord). */
  isAnonymous: boolean;
  /**
   * Morceaux RÉELLEMENT reconnus (pas des tentatives) -- BUG RÉEL corrigé le
   * 24/08/2026 : "la session affiche 0 morceaux détectés mais KEEP affiche
   * déjà Crée ton profil -- l'UI doit être pilotée par le nombre RÉEL de
   * morceaux reconnus, jamais par le fait qu'une session tourne". Stocké ici
   * (pas useSessionStore, non persisté) pour survivre aux rechargements --
   * lifetime, jamais remis à zéro par une nouvelle session (même esprit que
   * l'ancien compteur backend par uid, déplacé côté client car AudD répond
   * directement au client, voir musicEngine.ts). Incrémenté UNIQUEMENT sur
   * un morceau RÉELLEMENT NOUVEAU (jamais un doublon déjà vu, jamais une
   * tentative/no_match).
   */
  successCount: number;
  incrementSuccessCount: () => void;
  setUser: (user: User) => void;
  enterDemoMode: () => void;
  logout: () => void;
  /** Reflète une session Supabase réelle (voir services/authService.ts) -- `null` = déconnecté. */
  syncFromAuthSession: (session: KeepAuthSession | null) => void;
  /**
   * Récupère le VRAI profil serveur et l'applique en local (cf. demande
   * explicite du 24/08/2026 -- "profil → Supabase → fermeture/réouverture →
   * profil toujours présent"). Le serveur fait autorité pour les champs
   * qu'il gère une fois qu'il répond ; en cas d'échec réseau/pas encore de
   * ligne serveur, l'état local existant n'est jamais effacé (voir
   * fetchRemoteProfile -- renvoie `null` plutôt que jeter).
   */
  hydrateFromServer: () => Promise<void>;
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
  isAnonymous: false,
  successCount: 0,
  incrementSuccessCount: () => set((s) => ({ successCount: s.successCount + 1 })),
  setUser: (user) => set({ user, isDemoMode: false }),
  enterDemoMode: () => set({ user: DEMO_USER, isDemoMode: true, isAnonymous: false }),
  logout: () => set({ user: null, isDemoMode: false, isAnonymous: false, successCount: 0 }),
  syncFromAuthSession: (session) =>
    set((s) => {
      // Mode Démo protégé UNIQUEMENT contre un état "déconnecté" transitoire
      // (session=null) -- BUG RÉEL trouvé le 24/08/2026 en auditant pourquoi
      // la bannière "Créer mon compte" restait invisible pour Adel malgré le
      // fix vérifié en navigateur frais : cette garde s'appliquait à tort
      // même en présence d'une VRAIE session Supabase active (confirmé par
      // le diagnostic client -- guestUserId="demo-user-1", isDemoMode=true,
      // alors que le backend traite déjà une vraie session anonyme), un
      // isDemoMode resté bloqué à true depuis un test antérieur empêchait
      // alors CE store de refléter la vraie session indéfiniment (Profil
      // montrait le faux DEMO_USER). Une vraie session Supabase active doit
      // TOUJOURS gagner sur un flag isDemoMode périmé -- seul un session=null
      // (Supabase non configuré/injoignable) doit laisser le Mode Démo actif.
      if (s.isDemoMode && !session) return s;
      if (!session) return { user: null, isDemoMode: false, isAnonymous: false };

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
      // isAnonymous DOIT être réévalué ici -- c'est exactement ce moment
      // (même uid, invité -> compte réel après vérification du code) qui
      // doit faire disparaître le CTA "Crée ton compte" côté ProfileScreen.
      if (s.user && s.user.id === session.userId) {
        if (s.user.email === (session.email ?? '') && s.isAnonymous === session.isAnonymous) return s;
        return { user: { ...s.user, email: session.email ?? '' }, isAnonymous: session.isAnonymous };
      }
      return { user: userFromAuthSession(session), isDemoMode: false, isAnonymous: session.isAnonymous };
    }),

  hydrateFromServer: async () => {
    if (get().isDemoMode) return;
    const remote: RemoteProfile | null = await fetchRemoteProfile();
    if (!remote) return; // pas encore de ligne serveur (nouvel invité) ou hors-ligne -- état local conservé tel quel.
    set((s) => {
      if (!s.user) return s;
      return {
        user: {
          ...s.user,
          username: remote.username ?? s.user.username,
          bio: remote.bio ?? s.user.bio,
          avatar: remote.avatarUrl ?? s.user.avatar,
          city: remote.city ?? s.user.city,
          countryCode: remote.countryCode ?? s.user.countryCode,
          kind: (remote.kind as User['kind']) ?? s.user.kind,
          isPublic: remote.isPublic,
          followerCount: remote.followerCount,
          followingCount: remote.followingCount,
          socialLinks: remote.socialLinks.length > 0 ? (remote.socialLinks as SocialLink[]) : s.user.socialLinks,
          privateInfo: { birthDate: remote.birthDate ?? s.user.privateInfo.birthDate, gender: (remote.gender as ProfilePrivateInfo['gender']) ?? s.user.privateInfo.gender },
        },
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
      // Reste à 0 tant que provider musical réel n'est pas branché — pas de fausse complétion.
      false, // service musical connecté
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  },

  updateUser: (patch) => {
    if (!get().isDemoMode) {
      const serverPatch = toProfilePatch(patch);
      if (Object.keys(serverPatch).length > 0) pushProfilePatch(serverPatch);
    }
    set((s) => (s.user ? { user: { ...s.user, ...patch } } : s));
  },

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
      const socialLinks = [...withoutExisting, link];
      if (!s.isDemoMode) pushSocialLinks(socialLinksForServer(socialLinks));
      return { user: { ...s.user, socialLinks } };
    }),
  removeSocialLink: (platform) =>
    set((s) => {
      if (!s.user) return s;
      const socialLinks = s.user.socialLinks.filter((l) => l.platform !== platform);
      if (!s.isDemoMode) pushSocialLinks(socialLinksForServer(socialLinks));
      return { user: { ...s.user, socialLinks } };
    }),
  toggleSocialLinkVisibility: (platform) =>
    set((s) => {
      if (!s.user) return s;
      const socialLinks = s.user.socialLinks.map((l) =>
        l.platform === platform ? { ...l, visibility: (l.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC') as LinkVisibility } : l
      );
      if (!s.isDemoMode) pushSocialLinks(socialLinksForServer(socialLinks));
      return { user: { ...s.user, socialLinks } };
    }),

  setPrivateInfo: (patch) => {
    if (!get().isDemoMode) {
      const serverPatch: { birth_date?: string | null; gender?: string | null } = {};
      if ('birthDate' in patch) serverPatch.birth_date = patch.birthDate ?? null;
      if ('gender' in patch) serverPatch.gender = patch.gender ?? null;
      if (Object.keys(serverPatch).length > 0) pushPrivateInfoPatch(serverPatch);
    }
    set((s) => (s.user ? { user: { ...s.user, privateInfo: { ...s.user.privateInfo, ...patch } } } : s));
  },
    }),
    { name: 'keep-user', storage: createSafeStorage() }
  )
);
