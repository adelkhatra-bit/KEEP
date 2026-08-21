/**
 * Flux d'obtention du Music User Token Apple Music côté mobile.
 *
 * Contrainte réelle (voir packages/music/src/providers/AppleMusicProvider.ts
 * pour les sources) : Apple ne propose la gestion automatique du Music User
 * Token que pour MusicKit natif (Swift) ou MusicKit JS (web). Sans écrire de
 * module natif Swift (hors de portée d'un projet Expo managé), la méthode
 * disponible est MusicKit JS chargée dans une WebView, qui gère
 * l'autorisation utilisateur et renvoie le token via `postMessage`.
 *
 * Statut : CODED, jamais exécuté (nécessite un vrai developer token backend
 * + un vrai compte Apple Music pour être testé -- voir
 * docs/DEPLOYMENT_TESTFLIGHT.md et docs/PROJECT_STATUS.md).
 *
 * Sécurité : le Music User Token est un jeton d'accès nominatif au compte
 * Apple Music de l'utilisateur -- stocké via expo-secure-store (Keychain
 * iOS / Keystore Android), jamais en AsyncStorage en clair.
 */
import * as SecureStore from 'expo-secure-store';

export { buildAppleMusicAuthHtml, parseAppleMusicAuthMessage } from './appleMusicAuthHtml';
export type { AppleMusicAuthMessage } from './appleMusicAuthHtml';

const SECURE_STORE_KEY = 'keep.appleMusic.musicUserToken';

export async function saveMusicUserToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getSavedMusicUserToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_STORE_KEY);
}

export async function clearSavedMusicUserToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
}
