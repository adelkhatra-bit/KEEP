import { MusicProviderAdapter } from './MusicProviderAdapter';
import { CanonicalTrack, ProviderPlaylist, ProviderSession } from '../types';

/**
 * Implémentation RÉELLE (REST, YouTube Data API v3) du MusicProviderAdapter
 * pour YouTube -- écrite contre la doc officielle
 * (developers.google.com/youtube/v3/docs), le 23/08/2026.
 *
 * STATUT HONNÊTE, PAR CAPACITÉ (cf. demande explicite du 23/08/2026 --
 * "N'invente aucune API officielle qui n'existe pas") :
 *
 * - RECHERCHE (searchTrack) : clé API seule suffit (`GET /search`), aucun
 *   compte utilisateur nécessaire -- c'est une recherche PUBLIQUE.
 *   Jamais exécutée de bout en bout (aucune clé fournie, voir
 *   EXPO_PUBLIC_YOUTUBE_API_KEY) mais le code est réel.
 * - PLAYLISTS PERSONNELLES (getPlaylists/createPlaylist/addTrackToPlaylist/
 *   removeTrackFromPlaylist) : nécessitent un VRAI flux OAuth 2.0 utilisateur
 *   (scope youtube.force-ssl), PAS juste une clé API -- ce flux n'est pas
 *   construit ici (aucun écran YouTubeConnectScreen, aucun échange de
 *   jeton). Ces méthodes jettent une erreur explicite plutôt que de
 *   prétendre fonctionner avec une simple clé API.
 * - YouTube Music : AUCUNE API publique officielle n'existe pour la
 *   bibliothèque/recherche YouTube Music (contrairement à YouTube standard)
 *   -- les seules libs qui l'exposent (ytmusicapi et équivalents) sont des
 *   rétro-ingénieries non officielles du endpoint interne YouTube Music,
 *   fragiles et hors CGU Google. KEEP ne les utilise pas -- voir
 *   useMusicServiceStore.ts, 'youtube_music' reste NON connectable en Mode
 *   Réel, aucune fausse intégration.
 */

export interface YouTubeConfig {
  /** Clé API Google Cloud Console (YouTube Data API v3 activée) -- gratuite, quota journalier (10 000 unités/jour par défaut). */
  apiKey?: string;
}

export class YouTubeProviderError extends Error {}

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: { high?: { url: string }; default?: { url: string } };
  };
}
interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { message?: string };
}

export class YouTubeProvider implements MusicProviderAdapter {
  readonly providerId = 'youtube';
  readonly displayName = 'YouTube';

  constructor(
    private readonly config: YouTubeConfig,
    // .bind(globalThis) -- même correctif Safari que les autres providers, voir AudDRecognitionProvider.ts.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
    private readonly baseUrl = 'https://www.googleapis.com/youtube/v3'
  ) {}

  async connect(authCode: string): Promise<ProviderSession> {
    const apiKey = authCode || this.config.apiKey;
    if (!apiKey) {
      throw new YouTubeProviderError(
        'YouTube : clé API manquante -- créer un projet sur console.cloud.google.com, activer "YouTube Data API v3", générer une clé API (gratuite).'
      );
    }
    // Pas de compte utilisateur réel derrière une simple clé API -- la
    // recherche est publique/anonyme, pas question d'inventer un profil.
    return { provider: this.providerId, userId: 'youtube:search-only', accessToken: apiKey };
  }

  async disconnect(): Promise<void> {}

  async refreshAuthorization(session: ProviderSession): Promise<ProviderSession> {
    return session; // Clé API statique -- rien à rafraîchir (contrairement à un token OAuth).
  }

  async getProfile(): Promise<{ id: string; displayName: string; email?: string }> {
    throw new YouTubeProviderError(
      'YouTube : profil utilisateur indisponible sans OAuth -- KEEP n’a qu’un accès de recherche publique pour l’instant.'
    );
  }

  async getPlaylists(): Promise<ProviderPlaylist[]> {
    throw new YouTubeProviderError(
      'YouTube : lecture des playlists personnelles non disponible -- nécessite un flux OAuth utilisateur non construit côté KEEP (voir statut honnête en tête de fichier).'
    );
  }

  async getPlaylistTracks(): Promise<CanonicalTrack[]> {
    throw new YouTubeProviderError('YouTube : lecture de playlist personnelle non disponible sans OAuth.');
  }

  /**
   * Seule capacité RÉELLEMENT utilisable avec une clé API seule -- recherche
   * publique par titre+artiste (YouTube n'indexe pas par ISRC). Le premier
   * résultat vidéo est retenu comme correspondance la plus probable ; aucun
   * score de confiance fourni par l'API, donc pas de garantie d'exactitude
   * -- c'est un lien "probable", pas une certitude comme un match ISRC.
   */
  async searchTrack(session: ProviderSession, query: { title: string; artist: string; isrc?: string }): Promise<CanonicalTrack | null> {
    const q = `${query.artist} ${query.title}`;
    const url = `${this.baseUrl}/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(q)}&key=${session.accessToken}`;
    const res = await this.fetchImpl(url);
    const json = (await res.json()) as YouTubeSearchResponse;
    if (!res.ok) {
      throw new YouTubeProviderError(`YouTube API -> HTTP ${res.status}: ${json.error?.message ?? 'réponse inattendue'}`);
    }
    const item = json.items?.[0];
    const videoId = item?.id?.videoId;
    if (!item || !videoId) return null;

    return {
      id: `youtube:${videoId}`,
      title: query.title,
      artist: query.artist,
      artworkUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url,
      providerIds: { youtube: videoId },
      songLink: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  async createPlaylist(): Promise<ProviderPlaylist> {
    throw new YouTubeProviderError('YouTube : création de playlist non disponible sans OAuth utilisateur.');
  }

  async addTrackToPlaylist(): Promise<void> {
    throw new YouTubeProviderError('YouTube : ajout à une playlist non disponible sans OAuth utilisateur.');
  }

  async removeTrackFromPlaylist(): Promise<void> {
    throw new YouTubeProviderError('YouTube : retrait d’une playlist non disponible sans OAuth utilisateur.');
  }

  async isTrackInPlaylist(): Promise<boolean> {
    throw new YouTubeProviderError('YouTube : vérification de playlist non disponible sans OAuth utilisateur.');
  }
}
