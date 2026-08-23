import { MusicProviderAdapter } from './MusicProviderAdapter';
import { CanonicalTrack, ProviderPlaylist, ProviderSession } from '../types';

/**
 * Implémentation RÉELLE (REST, OAuth 2.0 Authorization Code + PKCE) du
 * MusicProviderAdapter pour Spotify.
 *
 * Endpoints Spotify Web API utilisés (developer.spotify.com/documentation/web-api) :
 * GET /v1/me, GET /v1/me/playlists, GET /v1/playlists/{id}/tracks,
 * GET /v1/search, POST /v1/users/{id}/playlists,
 * POST/DELETE /v1/playlists/{id}/tracks, POST https://accounts.spotify.com/api/token.
 *
 * Contrairement à Apple Music, PKCE ne demande AUCUN secret côté backend --
 * `connect()` reçoit directement un access_token déjà obtenu côté app (voir
 * packages/mobile/src/services/spotifyAuth.ts, flux expo-auth-session), et
 * Spotify fournit un vrai refresh_token (Apple Music n'en a pas).
 *
 * STATUT HONNÊTE : écrit contre la doc officielle, jamais exécuté (nécessite
 * un Client ID Spotify réel — app développeur gratuite sur
 * developer.spotify.com/dashboard -- pour être testé de bout en bout).
 */
export class SpotifyProvider implements MusicProviderAdapter {
  readonly providerId = 'spotify';
  readonly displayName = 'Spotify';

  constructor(
    // .bind(globalThis) -- Safari refuse `fetch` appelé avec un `this` autre
    // que `window` ; voir le même correctif détaillé dans AudDRecognitionProvider.ts.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
    private readonly baseUrl = 'https://api.spotify.com/v1'
  ) {}

  private async request<T>(
    session: ProviderSession,
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T | null> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (res.status === 204) return null;
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const detail = json?.error?.message ?? text;
      throw new Error(`Spotify API ${init.method ?? 'GET'} ${path} -> HTTP ${res.status}: ${detail}`);
    }
    return json as T;
  }

  /** @param authCode Un access_token Spotify déjà obtenu via le flux PKCE côté app -- pas un code d'autorisation brut. */
  async connect(authCode: string): Promise<ProviderSession> {
    if (!authCode) {
      throw new Error('Spotify : access_token manquant -- le flux PKCE a dû échouer avant connect().');
    }
    const provisional: ProviderSession = { provider: this.providerId, userId: 'spotify-pending', accessToken: authCode };
    const profile = await this.getProfile(provisional);
    return { ...provisional, userId: `spotify:${profile.id}` };
  }

  async disconnect(): Promise<void> {
    // Spotify n'a pas d'endpoint de révocation côté API publique -- oublier
    // le jeton côté KEEP (secure-store) suffit ; l'utilisateur peut aussi
    // révoquer l'accès depuis spotify.com/account/apps.
  }

  /**
   * Spotify fournit un vrai refresh_token (contrairement à Apple Music) --
   * échange réel via POST /api/token, grant_type=refresh_token. Le client
   * étant public (PKCE, pas de client_secret), seul client_id est requis.
   */
  async refreshAuthorization(session: ProviderSession): Promise<ProviderSession> {
    if (!session.refreshToken) {
      throw new Error('Spotify : aucun refresh_token disponible -- reconnexion complète nécessaire.');
    }
    const clientId = getSpotifyClientId();
    const res = await this.fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: clientId,
      }).toString(),
    });
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok) {
      throw new Error(`Spotify : échec du rafraîchissement du jeton (HTTP ${res.status}: ${json?.error_description ?? json?.error}).`);
    }
    return {
      ...session,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
  }

  async getProfile(session: ProviderSession): Promise<{ id: string; displayName: string; email?: string }> {
    const me = await this.request<{ id: string; display_name?: string; email?: string }>(session, '/me');
    if (!me) throw new Error('Spotify API : profil introuvable.');
    return { id: me.id, displayName: me.display_name ?? me.id, email: me.email };
  }

  async getPlaylists(session: ProviderSession): Promise<ProviderPlaylist[]> {
    const results: ProviderPlaylist[] = [];
    let path: string | undefined = '/me/playlists?limit=50';
    while (path) {
      const res: SpotifyPagedResponse<SpotifyPlaylistResource> | null = await this.request(session, path);
      for (const p of res?.items ?? []) {
        results.push({
          id: p.id,
          name: p.name,
          description: p.description ?? undefined,
          trackCount: p.tracks?.total ?? 0,
          coverUrl: p.images?.[0]?.url,
        });
      }
      path = res?.next ? res.next.replace(this.baseUrl, '') : undefined;
    }
    return results;
  }

  async getPlaylistTracks(session: ProviderSession, playlistId: string): Promise<CanonicalTrack[]> {
    const results: CanonicalTrack[] = [];
    let path: string | undefined = `/playlists/${playlistId}/tracks?limit=100`;
    while (path) {
      const res: SpotifyPagedResponse<{ track: SpotifyTrackResource | null }> | null = await this.request(session, path);
      for (const item of res?.items ?? []) {
        if (item.track) results.push(this.toCanonicalTrack(item.track));
      }
      path = res?.next ? res.next.replace(this.baseUrl, '') : undefined;
    }
    return results;
  }

  async searchTrack(
    session: ProviderSession,
    query: { title: string; artist: string; isrc?: string }
  ): Promise<CanonicalTrack | null> {
    const q = query.isrc ? `isrc:${query.isrc}` : `track:${query.title} artist:${query.artist}`;
    const res = await this.request<{ tracks?: { items: SpotifyTrackResource[] } }>(
      session,
      `/search?q=${encodeURIComponent(q)}&type=track&limit=5`
    );
    const candidates = res?.tracks?.items ?? [];
    return candidates.length > 0 ? this.toCanonicalTrack(candidates[0]) : null;
  }

  async createPlaylist(session: ProviderSession, name: string, description?: string): Promise<ProviderPlaylist> {
    const profile = await this.getProfile(session);
    const created = await this.request<SpotifyPlaylistResource>(session, `/users/${profile.id}/playlists`, {
      method: 'POST',
      body: { name, description, public: false },
    });
    if (!created) throw new Error('Spotify API : création de playlist sans réponse exploitable.');
    return { id: created.id, name: created.name, description: created.description ?? undefined, trackCount: 0 };
  }

  async addTrackToPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<void> {
    const trackId = track.providerIds.spotify;
    if (!trackId) {
      throw new Error(`Spotify : impossible d'ajouter "${track.title}" — aucun ID Spotify résolu (doit d'abord passer par searchTrack()).`);
    }
    await this.request(session, `/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: { uris: [`spotify:track:${trackId}`] },
    });
  }

  async removeTrackFromPlaylist(session: ProviderSession, playlistId: string, trackId: string): Promise<void> {
    await this.request(session, `/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: { tracks: [{ uri: `spotify:track:${trackId}` }] },
    });
  }

  async isTrackInPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<boolean> {
    const tracks = await this.getPlaylistTracks(session, playlistId);
    if (track.isrc) return tracks.some((t) => t.isrc && t.isrc === track.isrc);
    return tracks.some(
      (t) => t.title.toLowerCase() === track.title.toLowerCase() && t.artist.toLowerCase() === track.artist.toLowerCase()
    );
  }

  /**
   * GET /v1/me/player/recently-played (scope `user-read-recently-played`,
   * voir spotifyAuth.ts) -- section "Écoutés récemment" du profil (cf.
   * demande explicite du 23/08/2026). Spotify ne conserve qu'une fenêtre
   * glissante d'environ 50 écoutes côté serveur (pas un historique complet
   * exposé par cette API) -- `afterMs` permet de ne récupérer que les
   * écoutes plus récentes qu'une synchronisation précédente (voir
   * useRecentlyPlayedStore.ts pour la logique de sync incrémentale
   * sans doublons), `undefined` récupère les plus récentes disponibles.
   * Pagination auto via `next` avec garde-fou `maxPages` (Spotify renvoie les
   * écoutes en ordre anté-chronologique quel que soit le curseur utilisé).
   */
  async getRecentlyPlayed(
    session: ProviderSession,
    options: { afterMs?: number; maxPages?: number } = {}
  ): Promise<SpotifyRecentlyPlayedTrack[]> {
    const results: SpotifyRecentlyPlayedTrack[] = [];
    let path: string | undefined = options.afterMs
      ? `/me/player/recently-played?limit=50&after=${options.afterMs}`
      : '/me/player/recently-played?limit=50';
    const maxPages = options.maxPages ?? 10;
    let pages = 0;
    while (path && pages < maxPages) {
      const res: SpotifyPagedResponse<{ track: SpotifyTrackResource | null; played_at: string }> | null = await this.request(
        session,
        path
      );
      for (const item of res?.items ?? []) {
        if (item.track) results.push({ track: this.toCanonicalTrack(item.track), playedAt: item.played_at });
      }
      path = res?.next ? res.next.replace(this.baseUrl, '') : undefined;
      pages++;
    }
    return results;
  }

  private toCanonicalTrack(t: SpotifyTrackResource): CanonicalTrack {
    return {
      id: `spotify:${t.id}`,
      isrc: t.external_ids?.isrc,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') ?? '(artiste inconnu)',
      album: t.album?.name,
      durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
      artworkUrl: t.album?.images?.[0]?.url,
      providerIds: { spotify: t.id },
    };
  }
}

interface SpotifyPagedResponse<T> {
  items: T[];
  next: string | null;
}

interface SpotifyPlaylistResource {
  id: string;
  name: string;
  description?: string | null;
  images?: { url: string }[];
  tracks?: { total: number };
}

interface SpotifyTrackResource {
  id: string;
  name: string;
  duration_ms?: number;
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string }[] };
  external_ids?: { isrc?: string };
}

/** Une écoute réelle -- `playedAt` (ISO 8601, fourni par Spotify) distingue deux écoutes du même morceau, voir getRecentlyPlayed. */
export interface SpotifyRecentlyPlayedTrack {
  track: CanonicalTrack;
  playedAt: string;
}

function getSpotifyClientId(): string {
  const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error('EXPO_PUBLIC_SPOTIFY_CLIENT_ID manquant -- crée une app sur developer.spotify.com/dashboard.');
  return clientId;
}
