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
  AppleMusicProvider,
  AudDRecognitionProvider,
  DemoMusicProvider,
  DemoRecognitionProvider,
  DeveloperTokenProvider,
  InMemoryRoutingWeightsStore,
  MusicProviderAdapter,
  MusicRecognitionProvider,
  ProviderPlaylist,
  SmartPlaylistRouter,
  SpotifyProvider,
  TrackResolver,
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
const HAS_REAL_AUDD_KEY = !isPlaceholder(AUDD_API_KEY);

function createBackendDeveloperTokenProviderIfConfigured(): DeveloperTokenProvider | null {
  if (isPlaceholder(API_URL)) return null;
  return createBackendDeveloperTokenProvider(API_URL!);
}

class MusicEngine {
  readonly isDemoMode = IS_DEMO_MODE;
  /** true dès qu'une vraie clé AudD est configurée -- pilote la capture micro réelle (voir useSessionStore.ts). */
  readonly isRealRecognition = HAS_REAL_AUDD_KEY;
  readonly recognitionProvider: MusicRecognitionProvider;
  readonly trackResolver: TrackResolver;
  readonly router: SmartPlaylistRouter;

  private readonly demoMusicProvider = new DemoMusicProvider(SEED_PLAYLISTS);
  private readonly realProviders = new Map<MusicServiceId, MusicProviderAdapter>();
  private session: { provider: string; userId: string; accessToken: string; refreshToken?: string; expiresAt?: number } | null = null;

  constructor() {
    this.recognitionProvider = HAS_REAL_AUDD_KEY
      ? new AudDRecognitionProvider({ apiToken: AUDD_API_KEY! })
      : new DemoRecognitionProvider();
    this.trackResolver = new TrackResolver();
    this.router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
  }

  /**
   * Provider musical actif -- source unique des playlists (cf. règle "une
   * donnée créée une seule fois puis réutilisée partout"). En Mode Démo,
   * toujours DemoMusicProvider. En Mode Réel, résolu depuis le service
   * connecté via useMusicServiceStore (Apple Music / Spotify) -- jette une
   * erreur explicite si aucun service n'est connecté plutôt que de deviner.
   */
  get musicProvider(): MusicProviderAdapter {
    if (IS_DEMO_MODE) return this.demoMusicProvider;

    const connected = useMusicServiceStore.getState().connectedService;
    if (!connected) {
      throw new Error('Aucun service musical connecté -- va dans Profil pour en connecter un.');
    }
    const cached = this.realProviders.get(connected);
    if (cached) return cached;

    const provider = this.buildRealProvider(connected);
    this.realProviders.set(connected, provider);
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
    throw new Error(`"${service}" n'a pas encore d'intégration réelle côté KEEP.`);
  }

  async getSession(): Promise<{ provider: string; userId: string; accessToken: string; refreshToken?: string; expiresAt?: number }> {
    if (this.session) return this.session;

    if (IS_DEMO_MODE) {
      const session = await this.musicProvider.connect('demo-auth-code');
      this.session = session;
      return session;
    }

    const connected = useMusicServiceStore.getState().connectedService;
    let session: { provider: string; userId: string; accessToken: string; refreshToken?: string; expiresAt?: number };
    if (connected === 'apple_music') {
      // Mode Réel : le Music User Token vient du flux WebView MusicKit JS
      // (voir screens/auth/AppleMusicAuthScreen.tsx), stocké via
      // expo-secure-store -- jamais un "auth-code" inventé.
      const { getSavedMusicUserToken } = await import('./appleMusicAuth');
      const musicUserToken = await getSavedMusicUserToken();
      if (!musicUserToken) {
        throw new Error('Apple Music non connecté -- va dans Profil pour lancer la connexion Apple Music.');
      }
      session = await this.musicProvider.connect(musicUserToken);
    } else if (connected === 'spotify') {
      // Mode Réel : jeton obtenu via le flux PKCE (voir services/spotifyAuth.ts).
      const { getSavedSpotifyTokens } = await import('./spotifyAuth');
      const tokens = await getSavedSpotifyTokens();
      if (!tokens) {
        throw new Error('Spotify non connecté -- va dans Profil pour lancer la connexion Spotify.');
      }
      const base = await this.musicProvider.connect(tokens.accessToken);
      session = { ...base, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt };
    } else {
      throw new Error('Aucun service musical connecté -- va dans Profil pour en connecter un.');
    }
    this.session = session;
    return session;
  }

  /** Réinitialise la session en cache -- utilisé après (re)connexion à un service musical. */
  resetSession() {
    this.session = null;
  }
}

export const musicEngine = new MusicEngine();
