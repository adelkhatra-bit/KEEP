import { UniversalTrackResolver, ConnectedProvider, ResolvedAvailability } from './UniversalTrackResolver';
import { MusicProviderAdapter } from './providers/MusicProviderAdapter';
import { CanonicalTrack, ProviderSession } from './types';

/**
 * PlatformAvailabilityResolver -- MODULE RÉUTILISABLE (cf. demande explicite
 * du 23/08/2026 : scénario "j'entends un titre sur TikTok, où existe-t-il
 * réellement ailleurs ?").
 * UTILISABLE DANS : fiche morceau Découvrir, ReleaseRequestEngine (compter
 * les demandes seulement pour les plateformes où 'not_found'), profil
 * artiste, Super Admin (statistiques de couverture catalogue).
 * STATUT : partial -- voir le détail par plateforme dans getPublicSession().
 *
 * NE DUPLIQUE PAS UniversalTrackResolver.resolveAvailability -- même moteur
 * de résolution (recherche + fusion ISRC/titre-artiste), SEULE différence :
 * la source du jeton. UniversalTrackResolver interroge les comptes de
 * L'UTILISATEUR (ses playlists à lui) ; PlatformAvailabilityResolver
 * interroge le CATALOGUE PUBLIC de chaque plateforme avec un jeton
 * applicatif (Client Credentials ou équivalent) -- disponible même si
 * l'utilisateur qui regarde n'a JAMAIS connecté Spotify/Apple Music.
 * Composition, pas réimplémentation (cf. règle anti-doublon établie pour
 * commitKeep/UniversalTrackResolver).
 */
export interface PublicSearchAdapter {
  adapter: MusicProviderAdapter;
  /** Jeton APPLICATIF en lecture seule (jamais un jeton utilisateur) -- null si pas encore configuré/implémenté pour cette plateforme (voir statut par provider ci-dessous). */
  getPublicSession: () => Promise<ProviderSession | null>;
}

export class PlatformAvailabilityResolver {
  constructor(
    private readonly universalResolver: UniversalTrackResolver,
    private readonly publicAdapters: PublicSearchAdapter[]
  ) {}

  /**
   * Disponibilité publique d'un morceau, indépendamment de tout compte
   * connecté par l'utilisateur courant. Une plateforme dont le jeton
   * applicatif n'est pas encore configuré (getPublicSession() -> null) est
   * simplement absente du résultat -- jamais un faux 'not_found' pour une
   * plateforme qu'on n'a en réalité pas interrogée (même règle honnête que
   * UniversalTrackResolver).
   */
  async resolvePublicAvailability(track: CanonicalTrack): Promise<ResolvedAvailability> {
    const settled = await Promise.allSettled(
      this.publicAdapters.map(async (p): Promise<ConnectedProvider | null> => {
        const session = await p.getPublicSession();
        return session ? { adapter: p.adapter, session } : null;
      })
    );
    const connected: ConnectedProvider[] = settled
      .filter((r): r is PromiseFulfilledResult<ConnectedProvider | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((v): v is ConnectedProvider => v !== null);

    return this.universalResolver.resolveAvailability(track, connected);
  }
}

/**
 * STATUT PAR PLATEFORME (cf. demande explicite du 23/08/2026 -- indiquer
 * REAL/PARTIAL/NOT IMPLEMENTED + APIs externes nécessaires) :
 *
 * - Apple Music : REAL techniquement possible dès maintenant -- l'endpoint
 *   backend existe déjà (fetchAppleMusicDeveloperToken, routes/music.ts) et
 *   l'API Apple Music autorise la recherche catalogue avec un simple
 *   developer token, SANS Music User Token (pas besoin que l'utilisateur ait
 *   connecté Apple Music). Reste à écrire : un getPublicSession() qui
 *   réutilise ce developer token comme ProviderSession en lecture seule.
 *
 * - YouTube : REAL -- YouTubeProvider.connect() n'a déjà besoin que d'une
 *   clé API Google (EXPO_PUBLIC_YOUTUBE_API_KEY), pas d'OAuth utilisateur.
 *   getPublicSession() peut réutiliser directement ce flux existant.
 *
 * - Spotify : NOT IMPLEMENTED -- nécessite le flux OAuth "Client
 *   Credentials" (jeton APPLICATIF, différent du PKCE utilisateur déjà
 *   câblé) : POST https://accounts.spotify.com/api/token avec
 *   grant_type=client_credentials. Nécessite un client_secret, donc DOIT
 *   vivre côté backend (jamais dans l'app mobile) -- endpoint à créer,
 *   analogue à fetchAppleMusicDeveloperToken. Même blocage que la section
 *   "Écoutés récemment" : nécessite un vrai Client ID Spotify (+ ici, un
 *   Client Secret, obtenu sur le même dashboard développeur).
 *
 * - TikTok : NOT IMPLEMENTED -- aucune API publique officielle permettant
 *   "un morceau X existe-t-il sur TikTok" par requête programmatique
 *   généraliste n'a été identifiée. Nécessite recherche dédiée (voir
 *   ReleaseRequestEngine.ts pour la même limite côté contact créateur).
 */
