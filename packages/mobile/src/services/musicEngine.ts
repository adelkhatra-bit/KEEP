/**
 * Point d'assemblage unique du moteur musical KEEP côté mobile.
 *
 * Une seule instance de chaque brique (pas de doublon d'état) :
 * DemoMusicProvider = SOURCE UNIQUE des playlists en Mode Démo (usePlaylistStore
 * les lit ici plutôt que de maintenir sa propre liste, pour éviter toute
 * divergence entre écrans).
 *
 * EXPO_PUBLIC_DEMO_MODE contrôle explicitement le provider actif : en Mode
 * Réel (DEMO_MODE=false), l'usage de DemoMusicProvider/DemoRecognitionProvider
 * lève une erreur explicite plutôt que de simuler silencieusement un succès.
 */
import {
  DemoMusicProvider,
  DemoRecognitionProvider,
  InMemoryRoutingWeightsStore,
  MusicProviderAdapter,
  MusicRecognitionProvider,
  ProviderPlaylist,
  SmartPlaylistRouter,
  TrackResolver,
} from '@keep/music';

const IS_DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';

const SEED_PLAYLISTS: ProviderPlaylist[] = [
  { id: 'playlist-piscine', name: 'Piscine', description: 'Sons d’été, ambiance chill au bord de l’eau', trackCount: 32 },
  { id: 'playlist-afro', name: 'Afro House', description: 'Rythmes afro house, sets DJ', trackCount: 28 },
  { id: 'playlist-voiture', name: 'Voiture', description: 'Pour la route, énergie et rythme', trackCount: 45 },
  { id: 'playlist-chill', name: 'Chill Evening', description: 'Sons ambiants, soirée détente', trackCount: 19 },
];

function assertDemoAllowed() {
  if (!IS_DEMO_MODE) {
    throw new Error(
      'KEEP est en Mode Réel mais aucun provider musical réel n’est configuré. ' +
        'Connecte un provider (Spotify/Apple Music) et un service de reconnaissance ' +
        'avant de sortir du Mode Démo — voir docs/PROJECT_STATUS.md.'
    );
  }
}

class MusicEngine {
  readonly isDemoMode = IS_DEMO_MODE;
  readonly recognitionProvider: MusicRecognitionProvider;
  readonly musicProvider: MusicProviderAdapter;
  readonly trackResolver: TrackResolver;
  readonly router: SmartPlaylistRouter;
  private session: { provider: string; userId: string; accessToken: string } | null = null;

  constructor() {
    assertDemoAllowed();
    this.recognitionProvider = new DemoRecognitionProvider();
    this.musicProvider = new DemoMusicProvider(SEED_PLAYLISTS);
    this.trackResolver = new TrackResolver();
    this.router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
  }

  async getSession() {
    if (!this.session) {
      this.session = await this.musicProvider.connect('demo-auth-code');
    }
    return this.session;
  }
}

export const musicEngine = new MusicEngine();
