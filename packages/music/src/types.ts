/**
 * Types centraux du moteur musical KEEP.
 * KEEP ne stream pas : ces types représentent des métadonnées et des
 * identifiants provider, jamais des fichiers audio protégés.
 */

/** Identifiants d'un morceau chez les différentes plateformes musicales. */
export interface ProviderTrackIds {
  spotify?: string;
  appleMusic?: string;
  youtubeMusic?: string;
  deezer?: string;
  [providerId: string]: string | undefined;
}

/** Morceau canonique KEEP — résultat de la résolution cross-provider. */
export interface CanonicalTrack {
  /** ID interne KEEP (stable, indépendant du provider). */
  id: string;
  isrc?: string;
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  artworkUrl?: string;
  /** Extrait promotionnel court fourni par un catalogue public, jamais stocké par KEEP. */
  previewUrl?: string;
  /** Plateformes réellement confirmées par les métadonnées de reconnaissance/catalogue. */
  availableOn?: string[];
  /** Liens externes vers les plateformes ou recherches associées. */
  externalUrls?: Record<string, string>;
  /** Genres/tags disponibles légalement (métadonnées provider), utilisés par le SmartPlaylistRouter. */
  genres?: string[];
  providerIds: ProviderTrackIds;
}

export interface RecognitionResult {
  /** Confiance de reconnaissance, 0-1. */
  confidence: number;
  title: string;
  artist: string;
  album?: string;
  isrc?: string;
  artworkUrl?: string;
  previewUrl?: string;
  availableOn?: string[];
  externalUrls?: Record<string, string>;
  providerIds?: ProviderTrackIds;
  /** Identifiant du morceau chez le provider de reconnaissance (pas encore résolu en CanonicalTrack). */
  recognitionProviderTrackId?: string;
}

export interface ProviderSession {
  provider: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ProviderPlaylist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  coverUrl?: string;
  isKeepManaged?: boolean;
}

export interface RoutingContext {
  /** Heure locale 0-23, jour de semaine 0-6 — signaux faibles mais réels (ex. "Voiture" le matin). */
  hourOfDay?: number;
  dayOfWeek?: number;
}

export interface RoutingRecommendation {
  playlistId: string;
  playlistName: string;
  /** Score 0-1. */
  score: number;
  reason: string;
}

/** Une correction utilisateur : "KEEP a proposé X, j'ai choisi Y". Donnée d'apprentissage. */
export interface RoutingCorrection {
  trackId: string;
  artist: string;
  genres: string[];
  recommendedPlaylistId: string | null;
  chosenPlaylistId: string;
  context?: RoutingContext;
  createdAt: string;
}

/** Persistance des poids appris — implémentation par défaut en mémoire, backée par Supabase en production. */
export interface RoutingWeightsStore {
  getArtistWeights(userId: string): Promise<Record<string, Record<string, number>>>;
  incrementArtistWeight(userId: string, artist: string, playlistId: string, amount: number): Promise<void>;
  getGenreWeights(userId: string): Promise<Record<string, Record<string, number>>>;
  incrementGenreWeight(userId: string, genre: string, playlistId: string, amount: number): Promise<void>;
}
