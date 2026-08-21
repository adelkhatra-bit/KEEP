import { CanonicalTrack, ProviderPlaylist, ProviderSession } from '../types';

/**
 * Interface commune à tous les providers musicaux (Spotify, Apple Music, ...).
 * KEEP route vers ces plateformes, il ne les remplace pas.
 *
 * Toute nouvelle intégration doit implémenter cette interface en entier.
 * Ne jamais présenter un provider comme "connecté" tant que connect() n'a pas
 * réellement réussi une authentification OAuth réelle.
 */
export interface MusicProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;

  connect(authCode: string): Promise<ProviderSession>;
  disconnect(session: ProviderSession): Promise<void>;
  refreshAuthorization(session: ProviderSession): Promise<ProviderSession>;

  getProfile(session: ProviderSession): Promise<{ id: string; displayName: string; email?: string }>;
  getPlaylists(session: ProviderSession): Promise<ProviderPlaylist[]>;
  getPlaylistTracks(session: ProviderSession, playlistId: string): Promise<CanonicalTrack[]>;

  searchTrack(session: ProviderSession, query: { title: string; artist: string; isrc?: string }): Promise<CanonicalTrack | null>;

  createPlaylist(session: ProviderSession, name: string, description?: string): Promise<ProviderPlaylist>;
  addTrackToPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<void>;
  removeTrackFromPlaylist(session: ProviderSession, playlistId: string, trackId: string): Promise<void>;
  isTrackInPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<boolean>;
}
