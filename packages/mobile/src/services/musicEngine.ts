/**
 * Point d'assemblage unique du moteur musical KEEP côté mobile.
 *
 * La reconnaissance et le service musical sont volontairement découplés :
 * KEEP peut identifier un morceau avec le micro même si l'utilisateur n'a
 * encore connecté ni Apple Music ni Spotify. La clé du fournisseur de
 * reconnaissance ne vit jamais dans l'application : elle reste dans
 * Supabase Vault et `keep-music-core` fait l'appel serveur.
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
import { KeepMusicCoreRecognitionProvider, isSecureRecognitionConfigured } from './keepMusicCoreRecognition';
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
      'Apple Music : aucune session KEEP active. Connecte-toi avant de pouvoir récupérer un developer token.'
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
    throw new Error('EXPO_PUBLIC_API_URL manquant -- impossible de joindre le backend KEEP.');
  }
  return fetchAppleMusicDeveloperToken(API_URL!);
}

function createRealMusicProvider(): MusicProviderAdapter {
  if (isPlaceholder(API_URL)) {
    throw new Error(
      'KEEP est en Mode Réel mais EXPO_PUBLIC_API_URL est manquant. ' +
        'Renseigne l’URL du backend KEEP déployé.'
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
    this.recognitionProvider = USE_REAL_RECOGNITION
      ? new KeepMusicCoreRecognitionProvider()
      : new DemoRecognitionProvider();

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
   * Isole strictement la bibliothèque locale quand l'identité KEEP change.
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
