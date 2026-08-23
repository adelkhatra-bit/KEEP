/**
 * Flux OAuth 2.0 Authorization Code + PKCE pour Spotify, côté mobile.
 *
 * PKCE = pas de client_secret (client "public", adapté à une app mobile) --
 * contrairement à Apple Music, aucune signature backend n'est nécessaire ici,
 * tout se passe côté app avec `expo-auth-session` (ouvre le navigateur système
 * pour l'écran de connexion Spotify, revient via un deep link `keep://`).
 *
 * Endpoints réels (accounts.spotify.com, doc officielle Spotify) :
 * authorization: https://accounts.spotify.com/authorize
 * token exchange: https://accounts.spotify.com/api/token
 *
 * STATUT HONNÊTE : écrit contre la doc officielle, jamais exécuté --
 * nécessite EXPO_PUBLIC_SPOTIFY_CLIENT_ID (app développeur gratuite sur
 * developer.spotify.com/dashboard, avec le redirect URI `keep://spotify-auth`
 * enregistré dans les Settings de cette app).
 */
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const SCOPES = [
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  // Section "Écoutés récemment" du profil (cf. demande explicite du
  // 23/08/2026) -- GET /v1/me/player/recently-played, voir SpotifyProvider.getRecentlyPlayed.
  'user-read-recently-played',
];

const ACCESS_TOKEN_KEY = 'keep.spotify.accessToken';
const REFRESH_TOKEN_KEY = 'keep.spotify.refreshToken';
const EXPIRES_AT_KEY = 'keep.spotify.expiresAt';

export interface SpotifyTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export function isSpotifyConfigured(): boolean {
  return !isPlaceholder(process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID);
}

/**
 * Lance le flux PKCE complet (ouvre le navigateur système, attend le retour
 * utilisateur, échange le code contre un access_token + refresh_token réels).
 * Jette une erreur explicite si EXPO_PUBLIC_SPOTIFY_CLIENT_ID est absent --
 * jamais de connexion simulée.
 */
export async function connectSpotify(): Promise<SpotifyTokens> {
  const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  if (isPlaceholder(clientId)) {
    throw new Error(
      'EXPO_PUBLIC_SPOTIFY_CLIENT_ID manquant -- crée une app gratuite sur developer.spotify.com/dashboard et renseigne son Client ID dans packages/mobile/.env.'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'keep', path: 'spotify-auth' });
  const request = new AuthSession.AuthRequest({
    clientId: clientId!,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(`Connexion Spotify annulée ou refusée (${result.type}).`);
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: clientId!,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier! },
    },
    DISCOVERY
  );

  const tokens: SpotifyTokens = {
    accessToken: tokenRes.accessToken,
    refreshToken: tokenRes.refreshToken,
    expiresAt: tokenRes.expiresIn ? Date.now() + tokenRes.expiresIn * 1000 : Date.now() + 3600_000,
  };
  await saveSpotifyTokens(tokens);
  return tokens;
}

export async function saveSpotifyTokens(tokens: SpotifyTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  await SecureStore.setItemAsync(EXPIRES_AT_KEY, String(tokens.expiresAt));
}

export async function getSavedSpotifyTokens(): Promise<SpotifyTokens | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  const refreshToken = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) ?? undefined;
  const expiresAt = Number((await SecureStore.getItemAsync(EXPIRES_AT_KEY)) ?? 0);
  return { accessToken, refreshToken, expiresAt };
}

export async function clearSavedSpotifyTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}
