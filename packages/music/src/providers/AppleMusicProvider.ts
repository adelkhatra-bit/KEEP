import { MusicProviderAdapter } from './MusicProviderAdapter';
import { CanonicalTrack, ProviderPlaylist, ProviderSession } from '../types';

/**
 * Implémentation RÉELLE (REST) du MusicProviderAdapter pour Apple Music.
 *
 * Sources vérifiées le 21/08/2026 (recherche + lecture directe de la doc
 * officielle Apple, pas une supposition) :
 * - developer.apple.com/documentation/applemusicapi/get-all-library-playlists
 * - developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit
 * - developer.apple.com/forums/thread/707759 (suppression de morceaux)
 *
 * Contraintes réelles de la plateforme qui façonnent ce fichier :
 *
 * 1. Authentification à deux jetons, jamais un seul :
 *    - "developer token" (JWT ES256 signé avec la clé privée MusicKit du
 *      compte développeur) — NE DOIT JAMAIS vivre dans l'app mobile, un
 *      secret de cette nature ne doit exister que côté backend. Ce provider
 *      ne le lit jamais lui-même : il délègue à un `DeveloperTokenProvider`
 *      injecté, qui appelle le backend KEEP (`GET /api/music/apple/developer-token`).
 *    - "Music User Token" — obtenu côté app via MusicKit JS dans une WebView
 *      (voir packages/mobile/src/services/appleMusicAuth.ts), PAS via un
 *      échange OAuth code->token côté serveur comme Spotify. Il est transmis
 *      ici en tant que `session.accessToken`.
 *    Les deux headers sont distincts et obligatoires ensemble :
 *    `Authorization: Bearer <developer token>` + `Music-User-Token: <user token>`.
 *
 * 2. Apple Music n'expose AUCUN endpoint de profil utilisateur (pas de nom,
 *    pas d'email, pas d'ID persistant lisible) — choix de confidentialité
 *    d'Apple, pas une limitation de KEEP. `getProfile()` reflète cela
 *    honnêtement plutôt que d'inventer un nom.
 *
 * 3. Pas de refresh token. Le Music User Token est longue durée (plusieurs
 *    mois) et révocable par l'utilisateur depuis Réglages iOS à tout moment
 *    — `refreshAuthorization()` ne fait donc que revalider le jeton actuel.
 *
 * 4. `removeTrackFromPlaylist` : l'API REST Apple Music NE SUPPORTE PAS la
 *    suppression d'un morceau d'une playlist de bibliothèque (confirmé sur
 *    les forums développeurs Apple, demandé depuis des années, jamais
 *    implémenté). Cette méthode lève une erreur explicite plutôt que de
 *    prétendre réussir — conforme à la règle "jamais de faux succès". La
 *    fonctionnalité "Ranger ma musique" doit donc, pour Apple Music,
 *    seulement PROPOSER les doublons à l'utilisateur (qui les supprime
 *    lui-même dans l'app Musique), jamais les supprimer automatiquement.
 *
 * 5. L'ISRC des morceaux de bibliothèque n'est pas garanti par l'API
 *    (relations `catalog` parfois vides, signalé sur les forums Apple) —
 *    traité comme best-effort ici. C'est précisément pour cette raison que
 *    `TrackResolver` sait déjà résoudre par titre+artiste quand l'ISRC
 *    manque (voir packages/music/src/TrackResolver.ts).
 */

export interface DeveloperTokenProvider {
  getDeveloperToken(): Promise<string>;
}

/** Levée quand une opération n'existe simplement pas côté API Apple Music. */
export class AppleMusicUnsupportedOperationError extends Error {
  constructor(operation: string) {
    super(
      `Apple Music API : "${operation}" n'est pas supporté par l'API REST publique ` +
        `(confirmé sur les forums développeurs Apple, pas une limitation KEEP). ` +
        `Proposer l'action à l'utilisateur dans l'app Musique plutôt que de simuler un succès.`
    );
    this.name = 'AppleMusicUnsupportedOperationError';
  }
}

interface AppleLibraryPlaylistResource {
  id: string;
  attributes?: {
    name: string;
    description?: { standard?: string };
    artwork?: { url?: string };
  };
}

interface AppleLibrarySongResource {
  id: string;
  attributes?: {
    name: string;
    artistName: string;
    albumName?: string;
    durationInMillis?: number;
    genreNames?: string[];
    artwork?: { url?: string };
    isrc?: string;
    playParams?: { catalogId?: string };
  };
}

interface ApplePagedResponse<T> {
  data: T[];
  next?: string;
}

function artworkUrl(url?: string, size = 300): string | undefined {
  if (!url) return undefined;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

export class AppleMusicProvider implements MusicProviderAdapter {
  readonly providerId = 'apple-music';
  readonly displayName = 'Apple Music';

  private storefrontCache = new Map<string, string>();

  constructor(
    private readonly developerTokenProvider: DeveloperTokenProvider,
    // .bind(globalThis) -- Safari refuse `fetch` appelé avec un `this` autre
    // que `window` ; voir le même correctif détaillé dans AudDRecognitionProvider.ts.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
    private readonly baseUrl = 'https://api.music.apple.com'
  ) {}

  private async request<T>(
    session: ProviderSession,
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T | null> {
    const developerToken = await this.developerTokenProvider.getDeveloperToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${developerToken}`,
        'Music-User-Token': session.accessToken,
        'Content-Type': 'application/json',
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (res.status === 204) return null;

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const detail = json?.errors?.[0]?.detail ?? text;
      throw new Error(`Apple Music API ${init.method ?? 'GET'} ${path} -> HTTP ${res.status}: ${detail}`);
    }
    return json as T;
  }

  private async getStorefront(session: ProviderSession): Promise<string> {
    const cached = this.storefrontCache.get(session.userId);
    if (cached) return cached;
    const res = await this.request<ApplePagedResponse<{ id: string }>>(session, '/v1/me/storefront');
    const storefront = res?.data?.[0]?.id;
    if (!storefront) throw new Error('Apple Music API : impossible de déterminer le storefront (pays) du compte.');
    this.storefrontCache.set(session.userId, storefront);
    return storefront;
  }

  /**
   * @param authCode Le Music User Token obtenu via le flux MusicKit JS
   * (WebView) côté mobile — voir packages/mobile/src/services/appleMusicAuth.ts.
   * Ce n'est PAS un code d'autorisation OAuth au sens Spotify.
   */
  async connect(authCode: string): Promise<ProviderSession> {
    if (!authCode) {
      throw new Error('Apple Music : Music User Token manquant — le flux MusicKit JS a dû échouer avant connect().');
    }
    const provisionalSession: ProviderSession = {
      provider: this.providerId,
      userId: `apple-music-pending`,
      accessToken: authCode,
    };
    // On valide immédiatement le token (plutôt que de le considérer "connecté"
    // sans vérification) en résolvant le storefront, seul appel non destructif
    // disponible sans connaître déjà un ID utilisateur.
    const storefront = await this.getStorefront(provisionalSession);
    const userId = `apple-music:${storefront}:${hashToken(authCode)}`;
    const session: ProviderSession = { ...provisionalSession, userId };
    this.storefrontCache.set(userId, storefront);
    return session;
  }

  async disconnect(): Promise<void> {
    // Rien à révoquer côté API : l'utilisateur retire l'accès depuis
    // Réglages iOS → Confidentialité → Apple Music. On ne fait ici que
    // laisser useUserStore oublier la session côté KEEP.
  }

  async refreshAuthorization(session: ProviderSession): Promise<ProviderSession> {
    // Pas de refresh token côté Apple Music — on revalide juste le jeton actuel.
    await this.getStorefront(session);
    return session;
  }

  async getProfile(session: ProviderSession): Promise<{ id: string; displayName: string; email?: string }> {
    // Apple Music API n'expose aucun endpoint de profil (nom/email) — c'est
    // un choix de confidentialité d'Apple. Ne jamais inventer un nom ici.
    return { id: session.userId, displayName: 'Compte Apple Music connecté' };
  }

  async getPlaylists(session: ProviderSession): Promise<ProviderPlaylist[]> {
    const results: ProviderPlaylist[] = [];
    let path: string | undefined = '/v1/me/library/playlists?limit=100';
    while (path) {
      const res: ApplePagedResponse<AppleLibraryPlaylistResource> | null = await this.request(session, path);
      for (const p of res?.data ?? []) {
        results.push({
          id: p.id,
          name: p.attributes?.name ?? '(sans nom)',
          description: p.attributes?.description?.standard,
          trackCount: 0, // l'API liste ne renvoie pas le nombre de morceaux ; résolu à la demande via getPlaylistTracks
          coverUrl: artworkUrl(p.attributes?.artwork?.url),
        });
      }
      path = res?.next;
    }
    return results;
  }

  async getPlaylistTracks(session: ProviderSession, playlistId: string): Promise<CanonicalTrack[]> {
    const results: CanonicalTrack[] = [];
    let path: string | undefined = `/v1/me/library/playlists/${playlistId}/tracks?limit=100&include=catalog`;
    while (path) {
      const res: ApplePagedResponse<AppleLibrarySongResource> | null = await this.request(session, path);
      for (const s of res?.data ?? []) {
        results.push(this.toCanonicalTrack(s));
      }
      path = res?.next;
    }
    return results;
  }

  async searchTrack(
    session: ProviderSession,
    query: { title: string; artist: string; isrc?: string }
  ): Promise<CanonicalTrack | null> {
    const storefront = await this.getStorefront(session);
    const term = encodeURIComponent(`${query.title} ${query.artist}`.trim());
    const res = await this.request<{ results?: { songs?: { data: AppleLibrarySongResource[] } } }>(
      session,
      `/v1/catalog/${storefront}/search?term=${term}&types=songs&limit=5`
    );
    const candidates = res?.results?.songs?.data ?? [];
    if (candidates.length === 0) return null;

    // Préférence à une correspondance ISRC exacte si demandée, sinon le
    // premier résultat catalogue (déjà trié par pertinence par Apple).
    const isrcMatch = query.isrc ? candidates.find((c) => c.attributes?.isrc === query.isrc) : undefined;
    return this.toCanonicalTrack(isrcMatch ?? candidates[0]);
  }

  async createPlaylist(session: ProviderSession, name: string, description?: string): Promise<ProviderPlaylist> {
    const body = {
      attributes: {
        name,
        description: description ? { standard: description } : undefined,
      },
    };
    const res = await this.request<{ data: AppleLibraryPlaylistResource[] }>(
      session,
      '/v1/me/library/playlists',
      { method: 'POST', body }
    );
    const created = res?.data?.[0];
    if (!created) throw new Error('Apple Music API : création de playlist sans réponse exploitable.');
    return {
      id: created.id,
      name: created.attributes?.name ?? name,
      description,
      trackCount: 0,
    };
  }

  async addTrackToPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<void> {
    const catalogId = track.providerIds.appleMusic;
    if (!catalogId) {
      throw new Error(
        `Apple Music : impossible d'ajouter "${track.title}" — aucun ID catalogue Apple Music résolu ` +
          `(le morceau doit d'abord passer par searchTrack()).`
      );
    }
    await this.request(session, `/v1/me/library/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: { data: [{ id: catalogId, type: 'songs' }] },
    });
  }

  async removeTrackFromPlaylist(): Promise<void> {
    throw new AppleMusicUnsupportedOperationError('removeTrackFromPlaylist');
  }

  async isTrackInPlaylist(session: ProviderSession, playlistId: string, track: CanonicalTrack): Promise<boolean> {
    const tracks = await this.getPlaylistTracks(session, playlistId);
    if (track.isrc) {
      return tracks.some((t) => t.isrc && t.isrc === track.isrc);
    }
    return tracks.some(
      (t) => t.title.toLowerCase() === track.title.toLowerCase() && t.artist.toLowerCase() === track.artist.toLowerCase()
    );
  }

  private toCanonicalTrack(s: AppleLibrarySongResource): CanonicalTrack {
    const catalogId = s.attributes?.playParams?.catalogId ?? s.id;
    return {
      id: `apple-music:${s.id}`,
      isrc: s.attributes?.isrc,
      title: s.attributes?.name ?? '(titre inconnu)',
      artist: s.attributes?.artistName ?? '(artiste inconnu)',
      album: s.attributes?.albumName,
      durationSec: s.attributes?.durationInMillis ? Math.round(s.attributes.durationInMillis / 1000) : undefined,
      artworkUrl: artworkUrl(s.attributes?.artwork?.url),
      genres: s.attributes?.genreNames,
      providerIds: { appleMusic: catalogId },
    };
  }
}

/** Hash court non cryptographique, uniquement pour dériver un userId stable et non-secret côté logs/cache. */
function hashToken(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
