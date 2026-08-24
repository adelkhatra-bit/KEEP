/**
 * Types locaux à l'app mobile (profil affiché, etc.).
 * Les types musicaux (morceau, playlist, recommandation) viennent de
 * @keep/music — pas de duplication ici (cf. règle anti-doublon).
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';

/** Miroir de `profile_kind` (supabase/migrations/0001_core_identity.sql). */
export type ProfileKind = 'USER' | 'CREATOR' | 'DJ' | 'ARTIST' | 'PRODUCER' | 'VENUE';

/** Miroir de `gender_option` (supabase/migrations/0001_core_identity.sql). */
export type GenderOption = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

/** Miroir de `link_visibility` (supabase/migrations/0001_core_identity.sql). */
export type LinkVisibility = 'PUBLIC' | 'PRIVATE';

export interface SocialLink {
  platform: 'instagram' | 'tiktok' | 'facebook' | 'snapchat' | 'youtube' | 'x' | 'website' | 'other';
  url: string;
  visibility: LinkVisibility;
}

/**
 * Données sensibles facultatives — jamais exposées publiquement.
 * Miroir de `profile_private_info`, gardé séparé du reste de `User` pour
 * ne jamais les faire fuiter par erreur dans un rendu "profil public".
 */
export interface ProfilePrivateInfo {
  birthDate?: string; // ISO date, facultatif
  gender?: GenderOption;
}

/**
 * Miroir de `plan_code` (supabase/migrations/0003_commerce.sql). Détermine
 * le badge de certification affiché à côté du pseudo (voir
 * components/VerifiedBadge.tsx) -- reflète un abonnement PAYÉ, jamais
 * attribué manuellement côté client (le paiement réel reste à brancher,
 * voir docs/PRICING_STRATEGY.md ; en Mode Démo, changeable depuis Profil
 * pour prévisualiser chaque palier).
 */
export type PlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  playlistCount: number;
  followerCount: number;
  followingCount: number;
  kind: ProfileKind;
  plan: PlanCode;
  city?: string;
  countryCode?: string;
  website?: string;
  favoriteGenres: string[];
  favoriteArtists: string[];
  socialLinks: SocialLink[];
  isPublic: boolean;
  /** Consentement explicite — condition pour toute localisation, même approximative. */
  locationOptIn: boolean;
  privateInfo: ProfilePrivateInfo;
}

/** `already_owned` = détecté mais déjà présent dans une session ARCHIVÉE (pas juste celle-ci, voir SESSION_ANTI_REPEAT dans useSessionStore.ts) -- cf. demande explicite du 24/08/2026 : "dit juste qu'il l'a trouvé et que je l'ai déjà", jamais reproposer GARDER/PASSER pour un morceau déjà rangé. */
export type SessionTrackStatus = 'pending' | 'kept' | 'passed' | 'already_owned';

/**
 * `synced` = réellement ajouté à un service musical connecté.
 * `waiting_sync` = gardé dans KEEP mais aucun service n'était connecté au
 * moment du GARDER -- jamais perdu, synchronisable plus tard via "Sync Now"
 * (voir store/useMusicServiceStore.ts, services/keepTrackAction.ts).
 */
export type TrackSyncState = 'synced' | 'waiting_sync';

/** Un morceau détecté pendant une session KEEP, avec sa décision GARDER/PASSER. */
export interface SessionTrackEntry {
  id: string;
  track: CanonicalTrack;
  recommendations: RoutingRecommendation[];
  status: SessionTrackStatus;
  detectedAt: string;
  keptPlaylistId?: string;
  syncState?: TrackSyncState;
  /**
   * `keep_decisions.id` réel côté serveur (jamais le même que `id`
   * ci-dessus, qui reste un identifiant LOCAL pour les listes React -- cf.
   * audit du 24/08/2026 : `hydrateFromServer` lisait déjà cet id serveur
   * puis le jetait). Absent tant que le GARDER n'a pas encore été confirmé
   * poussé au serveur -- toute action qui modifie l'état serveur (visibilité
   * partagé/masqué, etc.) DOIT vérifier sa présence avant d'agir, jamais
   * agir sur `id` à sa place.
   */
  keepId?: string;
  /** Visibilité SUR LE PROFIL de ce KEEP précis (voir keep_decisions.visibility) -- absent = pas encore synchronisé, traité comme PUBLIC (défaut serveur, voir POST /me/keeps). FOLLOWERS existe côté serveur mais n'a pas d'UI ici (hors scope, cf. social.ts). */
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  /** Nom personnalisé donné par l'utilisateur pour CE morceau dans CETTE session -- jamais imposé, l'utilisateur garde le titre détecté par défaut (cf. demande explicite du 23/08/2026 : "je puisse renommer un fichier musical"). */
  customTitle?: string;
  /**
   * D'où KEEP a appris l'existence de ce morceau -- à ne JAMAIS confondre
   * avec l'identité du morceau (CanonicalTrack) ni ses destinations
   * disponibles (UniversalTrackResolver.resolveAvailability) -- trois
   * notions distinctes (cf. demande explicite du 23/08/2026 : "Ne mélange
   * surtout pas les trois").
   */
  discoverySource: 'mic' | 'recently_played' | 'server_sync';
  /**
   * Résultat réel de UniversalTrackResolver.resolveAvailability -- une
   * entrée par plateforme CONNECTÉE au moment de la détection (found /
   * not_found / unknown). Absent = pas encore résolu ou aucune plateforme
   * connectée à ce moment-là ; jamais une liste inventée.
   */
  availability?: import('@keep/music').AvailabilityEntry[];
}

/**
 * Une session KEEP = un moment de vie ("chez Paul", "Ibiza 14 août"...) pendant
 * lequel KEEP identifie successivement les morceaux entendus.
 * `locationLabel`/`lat`/`lng` restent vides tant que `locationOptIn` n'est pas
 * accordé pour cette session précise (permission demandée à chaque session,
 * pas une fois pour toutes).
 */
export interface KeepSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  title: string | null;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  tracks: SessionTrackEntry[];
}
