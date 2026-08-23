/**
 * Point d'assemblage unique du moteur musical KEEP côté mobile.
 *
 * Une seule instance de chaque brique (pas de doublon d'état) :
 * DemoMusicProvider = SOURCE UNIQUE des playlists en Mode Démo (usePlaylistStore
 * les lit ici plutôt que de maintenir sa propre liste, pour éviter toute
 * divergence entre écrans).
 *
 * EXPO_PUBLIC_DEMO_MODE contrôle explicitement le provider actif : en Mode
 * Réel (DEMO_MODE=false), les providers réels (AudD + Apple Music) sont
 * instanciés ici -- s'il manque une variable d'env requise, l'erreur est
 * levée immédiatement au démarrage avec un message exact sur ce qui manque,
 * jamais un repli silencieux vers le Mode Démo (cf. règle "jamais de faux
 * résultat").
 */
import {
  AcoustIdRecognitionProvider,
  AppleMusicProvider,
  AudDRecognitionProvider,
  ConnectedProvider,
  DemoMusicProvider,
  DemoRecognitionProvider,
  DeveloperTokenProvider,
  InMemoryRoutingWeightsStore,
  MusicProviderAdapter,
  ProviderPlaylist,
  ProviderSession,
  RecognitionRouter,
  SmartPlaylistRouter,
  SpotifyProvider,
  TrackResolver,
  UniversalTrackResolver,
  YouTubeProvider,
} from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';
import { useMusicServiceStore, MusicServiceId } from '../store/useMusicServiceStore';

const IS_DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUDD_API_KEY = process.env.EXPO_PUBLIC_AUDD_API_KEY;

const SEED_PLAYLISTS: ProviderPlaylist[] = [
  { id: 'playlist-piscine', name: 'Piscine', description: 'Sons d’été, ambiance chill au bord de l’eau', trackCount: 32 },
  { id: 'playlist-afro', name: 'Afro House', description: 'Rythmes afro house, sets DJ', trackCount: 28 },
  { id: 'playlist-voiture', name: 'Voiture', description: 'Pour la route, énergie et rythme', trackCount: 45 },
  { id: 'playlist-chill', name: 'Chill Evening', description: 'Sons ambiants, soirée détente', trackCount: 19 },
];

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

/**
 * Le developer token Apple Music ne doit JAMAIS vivre dans l'app mobile
 * (voir packages/music/src/providers/AppleMusicProvider.ts) -- ce provider
 * appelle le backend KEEP, qui le signe côté serveur avec la clé MusicKit.
 * L'appel backend est protégé par une session KEEP réelle (voir
 * packages/backend/src/routes/music.ts), d'où la dépendance à
 * getSupabaseAccessToken() ici : sans utilisateur connecté, cet appel
 * échoue honnêtement (401), pas de contournement.
 */
async function fetchAppleMusicDeveloperToken(apiUrl: string): Promise<string> {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error(
      'Apple Music : aucune session KEEP active. Connecte-toi (Supabase Auth) avant de pouvoir récupérer un developer token.'
    );
  }
  const res = await fetch(`${apiUrl}/api/music/apple/developer-token`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Apple Music : ${json?.message ?? `échec récupération developer token (HTTP ${res.status})`}`);
  }
  return json.token as string;
}

function createBackendDeveloperTokenProvider(apiUrl: string): DeveloperTokenProvider {
  return { getDeveloperToken: () => fetchAppleMusicDeveloperToken(apiUrl) };
}

/**
 * Utilisé par l'écran de connexion Apple Music (voir
 * screens/AppleMusicConnectScreen.tsx) pour obtenir le developer token à
 * injecter dans la WebView MusicKit JS -- indépendant de `getSession()`
 * puisque connecter Apple Music est justement ce qui manque pour qu'une
 * session existe (pas de dépendance circulaire).
 */
export async function getAppleMusicDeveloperToken(): Promise<string> {
  if (isPlaceholder(API_URL)) {
    throw new Error('EXPO_PUBLIC_API_URL manquant -- impossible de joindre le backend KEEP.');
  }
  return fetchAppleMusicDeveloperToken(API_URL!);
}

/**
 * Reconnaissance réelle dès qu'une vraie clé AudD est configurée, INDÉPENDAMMENT
 * du reste de l'app (playlists/auth peuvent rester en Mode Démo pour être
 * testables sans backend Supabase) -- cf. demande explicite du 22/08/2026 :
 * "je veux que le micro soit réel" sans devoir aussi monter tout le backend.
 */
// AudD = fallback_optional, jamais core_dependency (cf. demande explicite du
// 23/08/2026 : "si quota AudD = 0, KEEP doit continuer normalement avec ses
// autres moteurs"). C'était déjà vrai en pratique (RecognitionRouter essaie
// AcoustID/index local EN PREMIER, AudD ne bloque jamais la session -- prouvé
// en conditions réelles le 23/08/2026 : quota AudD épuisé, KEEP a continué à
// écouter normalement) -- ce flag le rend EXPLICITE et désactivable, plutôt
// que seulement implicite dans l'ordre des providers.
const AUDD_EXPLICITLY_DISABLED = process.env.EXPO_PUBLIC_AUDD_ENABLED === 'false';
const HAS_REAL_AUDD_KEY = !isPlaceholder(AUDD_API_KEY) && !AUDD_EXPLICITLY_DISABLED;
/**
 * AcoustID/Chromaprint -- GRATUIT, placé EN PREMIER dans la chaîne dès que
 * le backend KEEP est joignable (cf. recherche technique du 23/08/2026 :
 * "AudD devient un fallback, pas le moteur principal obligatoire"). Le
 * calcul d'empreinte se fait côté backend (voir routes/recognition.ts) --
 * ce provider mobile ne fait qu'y poster l'échantillon audio, d'où la seule
 * dépendance réelle ici : EXPO_PUBLIC_API_URL. La clé ACOUSTID_API_KEY et le
 * binaire `fpcalc` sont vérifiés côté serveur, pas ici.
 */
const HAS_BACKEND_URL = !isPlaceholder(API_URL);

function createBackendDeveloperTokenProviderIfConfigured(): DeveloperTokenProvider | null {
  if (isPlaceholder(API_URL)) return null;
  return createBackendDeveloperTokenProvider(API_URL!);
}

class MusicEngine {
  readonly isDemoMode = IS_DEMO_MODE;
  /** true dès qu'un vrai provider de reconnaissance (AcoustID et/ou AudD) est configuré -- pilote la capture micro réelle (voir useSessionStore.ts). */
  readonly isRealRecognition = HAS_REAL_AUDD_KEY || HAS_BACKEND_URL;
  /**
   * Chaîne de reconnaissance, dans l'ordre d'essai réel -- voir
   * RecognitionRouter.ts. AcoustID (gratuit) d'abord si le backend KEEP est
   * joignable, AudD en repli. En Mode Démo, DemoRecognitionProvider seul.
   */
  readonly recognitionRouter: RecognitionRouter;
  /** Statut réel d'AudD dans la chaîne -- jamais 'core_dependency' par design, voir audit du 23/08/2026. */
  readonly auddMode: 'fallback_optional' | 'disabled' = HAS_REAL_AUDD_KEY ? 'fallback_optional' : 'disabled';
  readonly trackResolver: TrackResolver;
  /**
   * Moteur central "où ce morceau existe-t-il ailleurs" (cf. demande
   * explicite du 23/08/2026 -- architecture Micro/URL -> TrackIdentity ->
   * UniversalTrackResolver -> plateformes -> KEEP). N'interroge que les
   * plateformes pour lesquelles une session réelle existe -- voir
   * UniversalTrackResolver.ts pour la limite honnête assumée.
   */
  readonly universalResolver: UniversalTrackResolver;
  readonly router: SmartPlaylistRouter;

  private readonly demoMusicProvider = new DemoMusicProvider(SEED_PLAYLISTS);
  private readonly realProviders = new Map<MusicServiceId, MusicProviderAdapter>();
  private readonly sessions = new Map<MusicServiceId, ProviderSession>();

  constructor() {
    const stages = [];
    if (HAS_BACKEND_URL) {
      stages.push(
        new AcoustIdRecognitionProvider({
          apiUrl: API_URL!,
          getAccessToken: getSupabaseAccessToken,
          // Cf. demande explicite du 23/08/2026 -- traçage E2E, voir requestTraces.ts.
          buildId: process.env.EXPO_PUBLIC_BUILD_ID,
        })
      );
    }
    if (HAS_REAL_AUDD_KEY) {
      stages.push(new AudDRecognitionProvider({ apiToken: AUDD_API_KEY! }));
    }
    this.recognitionRouter = new RecognitionRouter(stages.length > 0 ? stages : [new DemoRecognitionProvider()]);
    this.trackResolver = new TrackResolver();
    this.universalResolver = new UniversalTrackResolver(this.trackResolver);
    this.router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
  }

  /**
   * Provider musical PRIMAIRE -- en Mode Démo, toujours DemoMusicProvider.
   * En Mode Réel MULTI-SERVICE (cf. demande explicite du 23/08/2026 -- "KEEP
   * ne doit plus être mono-service"), c'est le PREMIER service connecté
   * (ordre de connexion), utilisé par les flux qui n'ont besoin que d'UNE
   * destination par défaut (créer une playlist, "Ranger par style"). Pour
   * interroger TOUTES les plateformes connectées, voir getConnectedProviders().
   * Jette une erreur explicite si aucun service n'est connecté plutôt que de deviner.
   */
  get musicProvider(): MusicProviderAdapter {
    if (IS_DEMO_MODE) return this.demoMusicProvider;

    const [primary] = useMusicServiceStore.getState().connectedServices;
    if (!primary) {
      throw new Error('Aucun service musical connecté -- va dans Profil pour en connecter un.');
    }
    return this.getProvider(primary);
  }

  /** Résout (et met en cache) l'adapter pour UN service précis -- indépendant de l'ordre de connexion. En Mode Démo, toujours le catalogue démo unique (voir musicProvider). */
  getProvider(service: MusicServiceId): MusicProviderAdapter {
    if (IS_DEMO_MODE) return this.demoMusicProvider;
    const cached = this.realProviders.get(service);
    if (cached) return cached;
    const provider = this.buildRealProvider(service);
    this.realProviders.set(service, provider);
    return provider;
  }

  private buildRealProvider(service: MusicServiceId): MusicProviderAdapter {
    if (service === 'apple_music') {
      const tokenProvider = createBackendDeveloperTokenProviderIfConfigured();
      if (!tokenProvider) {
        throw new Error('EXPO_PUBLIC_API_URL manquant -- renseigne l’URL du backend KEEP déployé dans packages/mobile/.env.');
      }
      return new AppleMusicProvider(tokenProvider);
    }
    if (service === 'spotify') {
      return new SpotifyProvider();
    }
    if (service === 'youtube') {
      return new YouTubeProvider({ apiKey: process.env.EXPO_PUBLIC_YOUTUBE_API_KEY });
    }
    throw new Error(`"${service}" n'a pas encore d'intégration réelle côté KEEP.`);
  }

  private demoSession: ProviderSession | null = null;

  /** Session pour le service PRIMAIRE (voir musicProvider) -- inchangé pour les appelants existants (créer une playlist, etc.). */
  async getSession(): Promise<ProviderSession> {
    if (IS_DEMO_MODE) {
      if (this.demoSession) return this.demoSession;
      this.demoSession = await this.demoMusicProvider.connect();
      return this.demoSession;
    }
    const [primary] = useMusicServiceStore.getState().connectedServices;
    if (!primary) throw new Error('Aucun service musical connecté -- va dans Profil pour en connecter un.');
    return this.getSessionFor(primary);
  }

  /**
   * Session pour UN service précis, quel que soit son rang de connexion --
   * base de UniversalTrackResolver.resolveAvailability, qui doit pouvoir
   * interroger TOUS les services connectés, pas seulement le premier.
   */
  async getSessionFor(service: MusicServiceId): Promise<ProviderSession> {
    if (IS_DEMO_MODE) return this.getSession();

    const cached = this.sessions.get(service);
    if (cached) return cached;

    let session: ProviderSession;
    if (service === 'apple_music') {
      // Mode Réel : le Music User Token vient du flux WebView MusicKit JS
      // (voir screens/auth/AppleMusicAuthScreen.tsx), stocké via
      // expo-secure-store -- jamais un "auth-code" inventé.
      const { getSavedMusicUserToken } = await import('./appleMusicAuth');
      const musicUserToken = await getSavedMusicUserToken();
      if (!musicUserToken) {
        throw new Error('Apple Music non connecté -- va dans Profil pour lancer la connexion Apple Music.');
      }
      session = await this.getProvider('apple_music').connect(musicUserToken);
    } else if (service === 'spotify') {
      // Mode Réel : jeton obtenu via le flux PKCE (voir services/spotifyAuth.ts).
      const { getSavedSpotifyTokens, saveSpotifyTokens } = await import('./spotifyAuth');
      let tokens = await getSavedSpotifyTokens();
      if (!tokens) {
        throw new Error('Spotify non connecté -- va dans Profil pour lancer la connexion Spotify.');
      }
      // Rafraîchissement proactif -- un access_token Spotify expire après 1h ;
      // sans ce correctif, `connect()` ci-dessous (qui appelle GET /me) échoue
      // simplement avec un 401 dès que le jeton stocké est périmé, alors que
      // `refreshAuthorization()` existe déjà côté SpotifyProvider mais n'était
      // JAMAIS appelé nulle part -- bug réel trouvé le 23/08/2026, corrigé ici.
      const EXPIRY_BUFFER_MS = 60_000;
      if (tokens.expiresAt <= Date.now() + EXPIRY_BUFFER_MS) {
        if (!tokens.refreshToken) {
          throw new Error('Spotify : jeton expiré et aucun refresh_token disponible -- reconnexion complète nécessaire depuis Profil.');
        }
        const refreshed = await this.getProvider('spotify').refreshAuthorization({
          provider: 'spotify', userId: 'spotify-pending', accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt,
        });
        tokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken ?? tokens.refreshToken, expiresAt: refreshed.expiresAt ?? Date.now() + 3600_000 };
        await saveSpotifyTokens(tokens);
      }
      const base = await this.getProvider('spotify').connect(tokens.accessToken);
      session = { ...base, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt };
    } else if (service === 'youtube') {
      // Recherche publique -- pas d'OAuth utilisateur nécessaire pour
      // chercher/retrouver une vidéo, seulement une clé API (Google Cloud
      // Console). Écrire dans une playlist YouTube PERSONNELLE nécessiterait
      // un vrai flux OAuth séparé, non construit ici (voir YouTubeProvider.ts).
      session = await this.getProvider('youtube').connect(process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '');
    } else {
      throw new Error(`"${service}" non connecté -- va dans Profil pour en connecter un.`);
    }
    this.sessions.set(service, session);
    return session;
  }

  /**
   * TOUTES les plateformes réellement connectées, prêtes pour
   * UniversalTrackResolver.resolveAvailability. Une connexion cassée
   * (jeton expiré, etc.) n'empêche jamais les autres de répondre -- voir
   * Promise.allSettled ici et dans UniversalTrackResolver lui-même.
   */
  async getConnectedProviders(): Promise<ConnectedProvider[]> {
    const services = useMusicServiceStore.getState().connectedServices;
    const settled = await Promise.allSettled(
      services.map(async (service) => ({
        adapter: this.getProvider(service),
        session: await this.getSessionFor(service),
      }))
    );
    return settled.filter((r): r is PromiseFulfilledResult<ConnectedProvider> => r.status === 'fulfilled').map((r) => r.value);
  }

  /** Réinitialise les sessions en cache -- utilisé après (re)connexion à un service musical. */
  resetSession() {
    this.sessions.clear();
    this.demoSession = null;
  }
}

export const musicEngine = new MusicEngine();
