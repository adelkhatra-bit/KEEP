/**
 * Point d'assemblage unique du moteur musical Loki côté mobile.
 *
 * La reconnaissance et le service musical sont volontairement découplés :
 * Loki peut identifier un morceau avec le micro même si l'utilisateur n'a
 * encore connecté ni Apple Music ni Spotify. Sur iOS, ShazamKit est tenté en
 * premier ; les clés AudD/ACRCloud restent uniquement dans Supabase Vault.
 */
import {
  AppleMusicProvider,
  DemoMusicProvider,
  DemoRecognitionProvider,
  DeveloperTokenProvider,
  InMemoryRoutingWeightsStore,
  MusicProviderAdapter,
  MusicRecognitionProvider,
  SmartPlaylistRouter,
  TrackResolver,
} from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';
import { APP_NAME } from '../config/brand';
import { KeepMusicCoreRecognitionProvider, isSecureRecognitionConfigured } from './keepMusicCoreRecognition';
import { NativeFirstRecognitionProvider } from './nativeFirstRecognitionProvider';
import { NotifyingRecognitionProvider } from './notifyingRecognitionProvider';
import { isSmartAlbumUiId, loadSmartAlbumTracks } from './smartAlbumService';

const USE_DEMO_MUSIC_PROVIDER = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';
const USE_REAL_RECOGNITION = isSecureRecognitionConfigured && process.env.EXPO_PUBLIC_KEEP_REAL_RECOGNITION !== 'false';
const API_URL = process.env.EXPO_PUBLIC_API_URL;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

async function fetchAppleMusicDeveloperToken(apiUrl: string): Promise<string> {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error(
      `Apple Music : aucune session ${APP_NAME} active. Connecte-toi avant de pouvoir récupérer un developer token.`
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

export async function getAppleMusicDeveloperToken(): Promise<string> {
  if (isPlaceholder(API_URL)) {
    throw new Error(`EXPO_PUBLIC_API_URL manquant -- impossible de joindre le backend ${APP_NAME}.`);
  }
  return fetchAppleMusicDeveloperToken(API_URL!);
}

function createRealMusicProvider(): MusicProviderAdapter {
  if (isPlaceholder(API_URL)) {
    throw new Error(
      `${APP_NAME} est en Mode Réel mais EXPO_PUBLIC_API_URL est manquant. ` +
        `Renseigne l’URL du backend ${APP_NAME} déployé.`
    );
  }
  return new AppleMusicProvider(createBackendDeveloperTokenProvider(API_URL!));
}

class MusicEngine {
  readonly isDemoMode = !USE_REAL_RECOGNITION;
  readonly usesRealRecognition = USE_REAL_RECOGNITION;
  readonly usesDemoMusicProvider = USE_DEMO_MUSIC_PROVIDER;
  readonly recognitionProvider: MusicRecognitionProvider;
  readonly musicProvider: MusicProviderAdapter;
  readonly trackResolver: TrackResolver;
  readonly router: SmartPlaylistRouter;
  private session: { provider: string; userId: string; accessToken: string } | null = null;

  constructor() {
    const serverRecognitionProvider: MusicRecognitionProvider = USE_REAL_RECOGNITION
      ? new KeepMusicCoreRecognitionProvider()
      : new DemoRecognitionProvider();
    // En Mode Réel, iOS tente ShazamKit avant de consommer AudD/ACRCloud.
    // Le module est optionnel : web et Android continuent directement vers le
    // provider serveur sans divergence de navigation ou d'interface.
    const baseRecognitionProvider: MusicRecognitionProvider = USE_REAL_RECOGNITION
      ? new NativeFirstRecognitionProvider(serverRecognitionProvider)
      : serverRecognitionProvider;
    this.recognitionProvider = new NotifyingRecognitionProvider(baseRecognitionProvider);

    this.musicProvider = USE_DEMO_MUSIC_PROVIDER
      ? new DemoMusicProvider()
      : createRealMusicProvider();

    // Les écrans existants continuent d'utiliser exactement le même contrat
    // MusicProviderAdapter. Seule l'ouverture d'un identifiant `keep-smart:*`
    // est interceptée : les morceaux viennent alors de Supabase, sans changer
    // la navigation, le design ni les flux Apple Music / démo.
    const providerGetPlaylistTracks = this.musicProvider.getPlaylistTracks.bind(this.musicProvider);
    this.musicProvider.getPlaylistTracks = async (session, playlistId) => {
      if (isSmartAlbumUiId(playlistId)) return loadSmartAlbumTracks(playlistId);
      return providerGetPlaylistTracks(session, playlistId);
    };

    this.trackResolver = new TrackResolver();
    this.router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
  }

  async getSession() {
    if (!this.session) {
      if (USE_DEMO_MUSIC_PROVIDER) {
        this.session = await this.musicProvider.connect('keep-local-library');
      } else {
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

  resetSession() {
    this.session = null;
  }

  /**
   * Isole strictement la bibliothèque locale quand l'identité Loki change.
   * Cette méthode ne touche jamais Spotify/Apple Music et n'efface aucune
   * donnée Supabase : elle vide uniquement la mémoire de test locale.
   */
  resetLocalLibrary() {
    this.resetSession();
    if (this.musicProvider instanceof DemoMusicProvider) {
      this.musicProvider.resetLibrary();
    }
  }
}

export const musicEngine = new MusicEngine();
