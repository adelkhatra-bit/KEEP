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
  /** Genres/tags disponibles légalement (métadonnées provider), utilisés par le SmartPlaylistRouter. */
  genres?: string[];
  providerIds: ProviderTrackIds;
  /**
   * Lien universel (ex. AudD "song_link", lis.tn) qui redirige vers les
   * plateformes où le morceau est disponible -- KEEP est un miroir, jamais
   * un hébergeur (cf. demande explicite du 22/08/2026) : ce lien PERMET
   * d'ouvrir la vraie plateforme sans que KEEP ait besoin de résoudre un ID
   * par provider un par un.
   */
  songLink?: string;
}

export interface RecognitionResult {
  /** Confiance de reconnaissance, 0-1. */
  confidence: number;
  title: string;
  artist: string;
  album?: string;
  isrc?: string;
  artworkUrl?: string;
  /** Durée en secondes, quand le provider de reconnaissance la fournit -- utilisée par TrackResolver pour distinguer deux versions du même titre/artiste (cf. TrackResolver.findExisting). */
  durationSec?: number;
  /** Identifiant du morceau chez le provider de reconnaissance (pas encore résolu en CanonicalTrack). */
  recognitionProviderTrackId?: string;
  /** Lien universel vers les plateformes (voir CanonicalTrack.songLink). */
  songLink?: string;
  /**
   * Moteur RÉEL ayant produit ce résultat côté backend (ex. 'keep_local' |
   * 'acoustid') -- distinct de `RecognitionAttempt.providerId` (l'étape du
   * RecognitionRouter côté mobile, ex. "acoustid" pointe toujours vers le
   * MÊME endpoint backend qui essaie lui-même plusieurs moteurs en interne,
   * voir routes/recognition.ts). Sans ce champ, impossible de prouver depuis
   * l'UI si l'index local a réellement répondu ou si on est retombé sur
   * AcoustID -- gap diagnostiqué le 23/08/2026 ("PROVIDER: acoustid" affiché
   * alors que le backend avait en fait répondu keep_local).
   */
  engine?: string;
  /**
   * Identifiant unique de la requête backend (cf. demande explicite du
   * 23/08/2026 -- traçage E2E iPhone bout en bout). Permet de confirmer
   * "résultat réellement affiché" après coup (voir useSessionStore.ts,
   * appel à /api/dev/trace/:id/confirm-display) -- absent si le provider
   * ne fournit pas de traçage (ex. AudD).
   */
  requestId?: string;
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
