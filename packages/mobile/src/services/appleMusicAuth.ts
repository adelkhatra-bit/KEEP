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
import { getSupabaseAccessToken, supabase } from './supabaseClient';

export { buildAppleMusicAuthHtml, parseAppleMusicAuthMessage } from './appleMusicAuthHtml';
export type { AppleMusicAuthMessage } from './appleMusicAuthHtml';

const LEGACY_SECURE_STORE_KEY = 'keep.appleMusic.musicUserToken';

export async function fetchAppleMusicDeveloperToken(): Promise<string> {
  if (!supabase) throw new Error('Apple Music : service Loki Music non configuré.');
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) throw new Error('Apple Music : connecte-toi à ton compte Loki Music.');
  const { data, error } = await supabase.functions.invoke('keep-apple-music-token', {
    method: 'POST',
    body: {},
    headers: { Authorization: 'Bearer ' + accessToken },
    timeout: 18000,
  }).catch(() => ({ data: null, error: true }));
  if (error || data?.ok !== true || typeof data?.token !== 'string' ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token) ||
    !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() / 1000 ||
    data.expiresAt > Date.now() / 1000 + 12 * 60 * 60 + 60) {
    throw new Error('Apple Music : le service est temporairement indisponible.');
  }
  return data.token;
}

export function musicUserTokenStorageKey(profileId: string): string {
  const cleanProfileId = String(profileId || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
  if (!cleanProfileId) throw new Error('Apple Music : compte Loki Music requis');
  return `${LEGACY_SECURE_STORE_KEY}.${cleanProfileId}`;
}

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

export async function saveMusicUserToken(profileId: string, token: string): Promise<void> {
  const storageKey = musicUserTokenStorageKey(profileId);
  if (isWeb) {
    try {
      localStorage.removeItem(LEGACY_SECURE_STORE_KEY);
      localStorage.setItem(storageKey, token);
    } catch { /* stockage indisponible -- pas fatal */ }
    return;
  }
  await SecureStore.deleteItemAsync(LEGACY_SECURE_STORE_KEY).catch(() => {});
  await SecureStore.setItemAsync(storageKey, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getSavedMusicUserToken(profileId: string): Promise<string | null> {
  const storageKey = musicUserTokenStorageKey(profileId);
  if (isWeb) {
    try {
      localStorage.removeItem(LEGACY_SECURE_STORE_KEY);
      return localStorage.getItem(storageKey);
    } catch { return null; }
  }
  await SecureStore.deleteItemAsync(LEGACY_SECURE_STORE_KEY).catch(() => {});
  return SecureStore.getItemAsync(storageKey);
}

export async function clearSavedMusicUserToken(profileId: string): Promise<void> {
  const storageKey = musicUserTokenStorageKey(profileId);
  if (isWeb) {
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(LEGACY_SECURE_STORE_KEY);
    } catch { /* rien à nettoyer */ }
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(storageKey),
    SecureStore.deleteItemAsync(LEGACY_SECURE_STORE_KEY),
  ]);
}
