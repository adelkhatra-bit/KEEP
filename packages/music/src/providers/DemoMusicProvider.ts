import { MusicProviderAdapter } from './MusicProviderAdapter';
import { CanonicalTrack, ProviderPlaylist, ProviderSession } from '../types';

/**
 * Implémentation locale du MusicProviderAdapter utilisée pendant les tests
 * gratuits tant qu'aucun service musical externe n'est connecté.
 *
 * IMPORTANT : cette mémoire doit être isolée entre deux identités. Un nouvel
 * utilisateur ou le mode démo ne doit jamais hériter des playlists du compte
 * testé juste avant dans le même navigateur.
 */
export class DemoMusicProvider implements MusicProviderAdapter {
  readonly providerId = 'demo';
  readonly displayName = 'KEEP Local';

  private playlists: Map<string, ProviderPlaylist> = new Map();
  private playlistTracks: Map<string, CanonicalTrack[]> = new Map();

  constructor(seedPlaylists: ProviderPlaylist[] = []) {
    for (const p of seedPlaylists) {
      this.playlists.set(p.id, p);
      this.playlistTracks.set(p.id, []);
    }
  }

  resetLibrary(): void {
    this.playlists.clear();
    this.playlistTracks.clear();
  }

  async connect(): Promise<ProviderSession> {
    return { provider: this.providerId, userId: 'demo-user', accessToken: 'demo-token' };
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  async refreshAuthorization(session: ProviderSession): Promise<ProviderSession> {
    return session;
  }

  async getProfile() {
    return { id: 'demo-user', displayName: 'KEEP Local' };
  }

  async getPlaylists(): Promise<ProviderPlaylist[]> {
    return Array.from(this.playlists.values());
  }

  async getPlaylistTracks(_session: ProviderSession, playlistId: string): Promise<CanonicalTrack[]> {
    return this.playlistTracks.get(playlistId) ?? [];
  }

  async searchTrack(): Promise<CanonicalTrack | null> {
    return null;
  }

  async createPlaylist(_session: ProviderSession, name: string, description?: string): Promise<ProviderPlaylist> {
    const normalizedName = name.trim().toLowerCase();
    const isDefaultKeep = normalizedName === 'mes keep';
    const id = isDefaultKeep ? 'keep-local-history' : `demo-playlist-${Date.now()}`;
    const existing = this.playlists.get(id);
    if (existing) return existing;

    const playlist: ProviderPlaylist = { id, name, description, trackCount: 0, isKeepManaged: true };
    this.playlists.set(id, playlist);
    this.playlistTracks.set(id, []);
    return playlist;
  }

  async addTrackToPlaylist(_session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<void> {
    const tracks = this.playlistTracks.get(playlistId) ?? [];
    if (!tracks.some((t) => t.id === track.id)) {
      tracks.push(track);
      this.playlistTracks.set(playlistId, tracks);
      const playlist = this.playlists.get(playlistId);
      if (playlist) playlist.trackCount = tracks.length;
    }
  }

  async removeTrackFromPlaylist(_session: ProviderSession, playlistId: string, trackId: string): Promise<void> {
    const tracks = (this.playlistTracks.get(playlistId) ?? []).filter((t) => t.id !== trackId);
    this.playlistTracks.set(playlistId, tracks);
    const playlist = this.playlists.get(playlistId);
    if (playlist) playlist.trackCount = tracks.length;
  }

  async isTrackInPlaylist(_session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<boolean> {
    return (this.playlistTracks.get(playlistId) ?? []).some((t) => t.id === track.id);
  }
}
