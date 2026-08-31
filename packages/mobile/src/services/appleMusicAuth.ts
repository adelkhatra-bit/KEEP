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
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export { buildAppleMusicAuthHtml, parseAppleMusicAuthMessage } from './appleMusicAuthHtml';
export type { AppleMusicAuthMessage } from './appleMusicAuthHtml';

const SECURE_STORE_KEY = 'keep.appleMusic.musicUserToken';

// BUG RÉEL trouvé le 26/08/2026, reproduit en direct (Adel : "'fetch' called
// on an object that does not implement interface Window", visible dès qu'une
// session tente `musicEngine.getSession()`) : `expo-secure-store` était
// utilisé sans jamais distinguer web/natif -- son shim web ne fournit pas
// `getValueWithKeyAsync`, jamais testé en pratique avant (voir commentaire
// d'en-tête "CODED, jamais exécuté"). Même catégorie de bug que
// micCapture.ts : une API native-only appelée sans garde sur web. SecureStore
// (Keychain/Keystore) reste utilisé sur natif, où c'est réellement sécurisé ;
// localStorage sur web -- moins fort, mais aucun vrai token n'y est stocké
// avant qu'un compte Apple Developer réel soit configuré (voir doc d'en-tête),
// donc pas de régression de sécurité réelle, juste plus de crash.
const isWeb = Platform.OS === 'web';

export async function saveMusicUserToken(token: string): Promise<void> {
  if (isWeb) {
    try { localStorage.setItem(SECURE_STORE_KEY, token); } catch { /* stockage indisponible -- pas fatal */ }
    return;
  }
  await SecureStore.setItemAsync(SECURE_STORE_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getSavedMusicUserToken(): Promise<string | null> {
  if (isWeb) {
    try { return localStorage.getItem(SECURE_STORE_KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(SECURE_STORE_KEY);
}

export async function clearSavedMusicUserToken(): Promise<void> {
  if (isWeb) {
    try { localStorage.removeItem(SECURE_STORE_KEY); } catch { /* rien à nettoyer */ }
    return;
  }
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
}
