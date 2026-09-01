/**
 * Types locaux à l'app mobile (profil affiché, etc.).
 * Les types musicaux (morceau, playlist, recommandation) viennent de
 * @keep/music — pas de duplication ici (cf. règle anti-doublon).
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';

export type ProfileKind = 'USER' | 'CREATOR' | 'DJ' | 'ARTIST' | 'PRODUCER' | 'VENUE';
export type GenderOption = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type LinkVisibility = 'PUBLIC' | 'PRIVATE';
export type KeepVisibility = 'PUBLIC' | 'PRIVATE';

export interface SocialLink {
  platform: 'instagram' | 'tiktok' | 'facebook' | 'snapchat' | 'youtube' | 'x' | 'website' | 'other';
  url: string;
  visibility: LinkVisibility;
}

export interface ProfilePrivateInfo {
  birthDate?: string;
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
  locationOptIn: boolean;
  privateInfo: ProfilePrivateInfo;
}

export type SessionTrackStatus = 'pending' | 'kept' | 'passed' | 'already_saved';

export interface ExistingLibraryMatch {
  playlistId: string;
  playlistName: string;
  provider?: string;
}

/** Un morceau détecté pendant une session Loki, avec sa décision GARDER/PASSER. */
export interface SessionTrackEntry {
  id: string;
  track: CanonicalTrack;
  recommendations: RoutingRecommendation[];
  status: SessionTrackStatus;
  detectedAt: string;
  keptPlaylistId?: string;
  /** PUBLIC = visible sur le profil partagé ; PRIVATE = gardé uniquement pour soi. */
  visibility?: KeepVisibility;
  /** Identifiant Supabase de la décision, présent dès qu'un vrai compte est synchronisé. */
  keepDecisionId?: string;
  /** Attribution sociale : présent lorsque ce morceau gardé provient du profil d'un autre membre. */
  sourceProfileId?: string;
  sourceUsername?: string;
  creditSource?: 'FREE' | 'SOCIAL';
  /**
   * Le morceau reste intégralement dans Mes Sessions (métadonnées + extrait distant)
   * quand le quota gratuit est épuisé. Aucun audio n'est stocké par Loki et aucune
   * écriture vers le profil/playlist externe n'est effectuée tant qu'il est verrouillé.
   */
  creditLocked?: boolean;
  /** Défini lorsque Loki retrouve déjà le morceau dans une playlist connectée. */
  existingMatch?: ExistingLibraryMatch;
  /**
   * Adel (02/09/2026) : "il faut bien donner la provenance ... si ça vient de
   * Spotify bien dire que c'est Spotify, si ça vient de Deezer bien dire que
   * ça vient de Deezer." Présent uniquement pour un morceau détecté par la
   * synchro automatique des favoris (voir useSessionHistoryStore.
   * syncPendingFavoriteImports) -- jamais pour une détection micro classique.
   */
  importedFrom?: 'spotify' | 'deezer' | 'apple_music' | 'youtube_music' | 'soundcloud' | 'tidal';
}

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