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

export type SessionTrackStatus = 'pending' | 'kept' | 'passed';

/** Un morceau détecté pendant une session KEEP, avec sa décision GARDER/PASSER. */
export interface SessionTrackEntry {
  id: string;
  track: CanonicalTrack;
  recommendations: RoutingRecommendation[];
  status: SessionTrackStatus;
  detectedAt: string;
  keptPlaylistId?: string;
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
