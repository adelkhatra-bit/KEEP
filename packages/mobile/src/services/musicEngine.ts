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
  TrackResolver,
} from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';

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

function createRealRecognitionProvider(): MusicRecognitionProvider {
  if (isPlaceholder(AUDD_API_KEY)) {
    throw new Error(
      'KEEP est en Mode Réel mais EXPO_PUBLIC_AUDD_API_KEY est manquant ou factice. ' +
        'Crée un compte sur audd.io (free tier 300 requêtes) et renseigne la clé dans packages/mobile/.env.'
    );
  }
  return new AudDRecognitionProvider({ apiToken: AUDD_API_KEY! });
}

function createRealMusicProvider(): MusicProviderAdapter {
  if (isPlaceholder(API_URL)) {
    throw new Error(
      'KEEP est en Mode Réel mais EXPO_PUBLIC_API_URL est manquant. ' +
        'Renseigne l’URL du backend KEEP déployé dans packages/mobile/.env.'
    );
  }
  return new AppleMusicProvider(createBackendDeveloperTokenProvider(API_URL!));
}

class MusicEngine {
  readonly isDemoMode = IS_DEMO_MODE;
  readonly recognitionProvider: MusicRecognitionProvider;
  readonly musicProvider: MusicProviderAdapter;
  readonly trackResolver: TrackResolver;
  readonly router: SmartPlaylistRouter;
  private session: { provider: string; userId: string; accessToken: string } | null = null;

  constructor() {
    if (IS_DEMO_MODE) {
      this.recognitionProvider = new DemoRecognitionProvider();
      this.musicProvider = new DemoMusicProvider(SEED_PLAYLISTS);
    } else {
      this.recognitionProvider = createRealRecognitionProvider();
      this.musicProvider = createRealMusicProvider();
    }
    this.trackResolver = new TrackResolver();
    this.router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
  }

  async getSession() {
    if (!this.session) {
      if (IS_DEMO_MODE) {
        this.session = await this.musicProvider.connect('demo-auth-code');
      } else {
        // Mode Réel : le Music User Token vient du flux WebView MusicKit JS
        // (voir screens/auth/AppleMusicAuthScreen.tsx), stocké via
        // expo-secure-store -- jamais un "auth-code" inventé.
        const { getSavedMusicUserToken } = await import('./appleMusicAuth');
        const musicUserToken = await getSavedMusicUserToken();
        if (!musicUserToken) {
          throw new Error('Apple Music non connecté -- va dans Profil pour lancer la connexion Apple Music.');
        }
        this.session = await this.musicProvider.connect(musicUserToken);
      }
    }
    return this.session;
  }

  /** Réinitialise la session en cache -- utilisé après (re)connexion Apple Music. */
  resetSession() {
    this.session = null;
  }
}

export const musicEngine = new MusicEngine();
