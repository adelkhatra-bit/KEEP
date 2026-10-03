import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { CanonicalTrack } from '@keep/music';
import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';
import { navigateFromNotificationData } from '../navigation/navigationRef';

type NotificationsModule = typeof import('expo-notifications');
type NotificationEventSubscription = import('expo-notifications').EventSubscription;
type NotificationResponse = import('expo-notifications').NotificationResponse;

let nativeNotificationsModule: NotificationsModule | null = null;
function getNativeNotifications(): NotificationsModule {
  if (!nativeNotificationsModule) {
    // Important web: ne pas évaluer expo-notifications dans le bundle navigateur.
    // Son module web enregistre un listener de token non supporté et pollue la
    // console même si aucune notification push native n'est demandée.
    nativeNotificationsModule = require('expo-notifications') as NotificationsModule;
  }
  return nativeNotificationsModule;
}

/**
 * Enregistrement du token push natif.
 *
 * - iOS/Android natifs : token Expo Push, afin qu'une notification Loki puisse
 *   apparaître même lorsque l'utilisateur est dans TikTok, Snapchat, etc.
 * - Web : aucune deuxième écoute temps réel ici. GlobalNotificationBanner est
 *   l'unique présentateur des notifications in-app, pour empêcher tout doublon.
 * - Détection musicale native : catégorie interactive GARDER / PASSER. Cela
 *   permet au système d'afficher les deux actions dans la notification sans
 *   modifier le design des écrans Loki.
 *
 * Aucune donnée audio n'est envoyée par ce mécanisme.
 */
const TRACK_CATEGORY = 'KEEP_TRACK';
export const TRACK_KEEP_ACTION = 'KEEP_TRACK_KEEP';
export const TRACK_PASS_ACTION = 'KEEP_TRACK_PASS';
let trackActionSubscription: NotificationEventSubscription | null = null;
let notificationTapSubscription: NotificationEventSubscription | null = null;
let lastTapKey = '';
let lastTapAt = 0;

function battleLike(type: unknown, title: unknown, data?: Record<string, unknown> | null) {
  const normalized = String(type || data?.type || data?.notificationType || '').toUpperCase();
  if (['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(normalized)) return true;
  if (data?.challengeId) return true;
  return String(title || '').toUpperCase().includes('BATTLE');
}


if (Platform.OS !== 'web') {
  const Notifications = getNativeNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, unknown>;
      const inlineBattle = battleLike(data.type, content.title, data) && String(data.presentation || '') === 'battle_inline';
      // Adel (29/09/2026) : doublons. Ce gestionnaire ne s'exécute que quand
      // l'appli est AU PREMIER PLAN ; la bannière interne
      // (GlobalNotificationBanner) affiche déjà la même notification. Au
      // premier plan : pas de bannière ni de son système en plus (le badge
      // reste à jour). Appli en arrière-plan : le système affiche la push.
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: !inlineBattle,
        shouldShowBanner: false,
        shouldShowList: !inlineBattle,
      };
    },
  });
}

function routeNotificationTap(response: NotificationResponse | null | undefined) {
  if (!response) return;
  if (response.actionIdentifier === TRACK_KEEP_ACTION || response.actionIdentifier === TRACK_PASS_ACTION) return;
  const request = response.notification.request;
  const data = (request.content.data || {}) as Record<string, unknown>;
  const key = String(request.identifier || data.notificationId || data.id || JSON.stringify(data));
  const now = Date.now();
  if (key && key === lastTapKey && now - lastTapAt < 2500) return;
  lastTapKey = key;
  lastTapAt = now;
  navigateFromNotificationData(data);
}

function installNotificationTapRouter() {
  if (Platform.OS === 'web' || notificationTapSubscription) return;
  const Notifications = getNativeNotifications();
  notificationTapSubscription = Notifications.addNotificationResponseReceivedListener(routeNotificationTap);
  void Notifications.getLastNotificationResponseAsync().then(routeNotificationTap).catch(() => {});
}

// Le web est volontairement sans second toast DOM : GlobalNotificationBanner
// possède déjà l'abonnement Supabase Realtime, le dédoublonnage sémantique,
// l'animation depuis le haut et le swipe vers le haut. Un deuxième bridge ici
// affichait exactement la même notification deux fois.
async function ensureDetectedTrackCategory(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = getNativeNotifications();
  await Notifications.setNotificationCategoryAsync(TRACK_CATEGORY, [
    {
      identifier: TRACK_KEEP_ACTION,
      buttonTitle: 'GARDER',
      options: { opensAppToForeground: true, isAuthenticationRequired: false, isDestructive: false },
    },
    {
      identifier: TRACK_PASS_ACTION,
      buttonTitle: 'PASSER',
      options: { opensAppToForeground: true, isAuthenticationRequired: false, isDestructive: false },
    },
  ]);
}

export function listenForDetectedTrackActions(
  handler: (action: 'KEEP' | 'PASS', entryId: string) => void | Promise<void>,
): () => void {
  if (Platform.OS === 'web') return () => {};
  const Notifications = getNativeNotifications();
  trackActionSubscription?.remove();
  trackActionSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const action = response.actionIdentifier;
    if (action !== TRACK_KEEP_ACTION && action !== TRACK_PASS_ACTION) return;
    const entryId = String(response.notification.request.content.data?.entryId || '');
    if (!entryId) return;
    void handler(action === TRACK_KEEP_ACTION ? 'KEEP' : 'PASS', entryId);
  });
  return () => {
    trackActionSubscription?.remove();
    trackActionSubscription = null;
  };
}

/**
 * Notification locale lors d'une détection. Sur iOS/Android, elle peut être
 * visible au-dessus d'une autre application et expose directement GARDER / PASSER.
 * Le son n'est jamais joint à la notification, uniquement les métadonnées.
 */
export async function notifyDetectedTrack(entryId: string, track: CanonicalTrack): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = getNativeNotifications();
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return;
  await ensureDetectedTrackCategory();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '♫ Musique détectée',
      body: `${track.title} — ${track.artist}`,
      data: { kind: 'detected_track', entryId, trackId: track.id },
      categoryIdentifier: TRACK_CATEGORY,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: null,
  });
}

const reportedPushFailures = new Set<string>();

// Trace (une fois par lancement et par raison) pourquoi l'appareil ne reçoit
// pas de notifications push. Lecture : table client_diagnostics, area
// 'push_registration'. N'affiche rien à l'utilisateur.
async function reportPushRegistrationFailure(code: string, message: string): Promise<void> {
  if (!supabase || reportedPushFailures.has(code)) return;
  reportedPushFailures.add(code);
  try {
    const { data } = await supabase.auth.getSession();
    const profileId = data.session?.user?.id;
    if (!profileId) return;
    await supabase.from('client_diagnostics').insert({
      profile_id: profileId,
      area: 'push_registration',
      code,
      message: message || code,
      platform: Platform.OS,
      context: { isDevice: Device.isDevice, osVersion: Device.osVersion ?? null, model: Device.modelName ?? null },
    });
  } catch {
    // Diagnostic best effort uniquement.
  }
}

function expoProjectId(): string | null {
  try {
    const constantsModule = require('expo-constants');
    const Constants = constantsModule?.default ?? constantsModule;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    return typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
  } catch {
    return null;
  }
}

function pushClientMetadata(): {
  appVersion: string | null;
  buildNumber: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  expoProjectId: string | null;
} {
  let appVersion: string | null = null;
  let buildNumber: string | null = null;
  try {
    const constantsModule = require('expo-constants');
    const Constants = constantsModule?.default ?? constantsModule;
    appVersion = typeof Constants?.nativeAppVersion === 'string' ? Constants.nativeAppVersion : null;
    buildNumber = typeof Constants?.nativeBuildVersion === 'string' ? Constants.nativeBuildVersion : null;
  } catch {}
  return {
    appVersion,
    buildNumber,
    deviceModel: Device.modelName ?? null,
    osVersion: Device.osVersion ?? null,
    expoProjectId: expoProjectId(),
  };
}

async function registerExpoTokenWithSupabase(token: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'supabase_not_configured' };
  if (!token) return { ok: false, reason: 'empty_token' };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) return { ok: false, reason: 'not_logged_in' };
    const meta = pushClientMetadata();
    const { error } = await supabase.rpc('keep_push_token_register_v2', {
      p_token: token,
      p_platform: Platform.OS,
      p_app_version: meta.appVersion,
      p_build_number: meta.buildNumber,
      p_device_model: meta.deviceModel,
      p_os_version: meta.osVersion,
      p_expo_project_id: meta.expoProjectId,
    });
    if (error) {
      void reportPushRegistrationFailure('register_rpc_error', String(error.message || error.code || 'rpc_error'));
      return { ok: false, reason: `supabase_${String(error.code || 'rpc_error')}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export function listenForExpoPushTokenChanges(): () => void {
  if (Platform.OS === 'web') return () => {};
  const Notifications = getNativeNotifications();
  const projectId = expoProjectId();
  if (!projectId) return () => {};
  const subscription = Notifications.addPushTokenListener((nextToken) => {
    // addPushTokenListener renvoie le token NATIF APNs/FCM. On le convertit
    // en ExpoPushToken avant l'enregistrement, puisque le serveur envoie via
    // l'Expo Push Service.
    void Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: nextToken })
      .then((expoToken) => registerExpoTokenWithSupabase(expoToken.data))
      .catch((error) => {
        void reportPushRegistrationFailure('expo_token_rotation_error', String((error as any)?.message || error || 'unknown').slice(0, 300));
      });
  });
  return () => subscription.remove();
}

export async function registerForPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: true, reason: 'web_in_app_banner_owned_by_global_notification_banner' };
  }
  const Notifications = getNativeNotifications();
  installNotificationTapRouter();
  if (!Device.isDevice) {
    return { ok: false, reason: 'simulator_no_push' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    void reportPushRegistrationFailure('permission_denied', String(finalStatus));
    return { ok: false, reason: 'permission_denied' };
  }

  await ensureDetectedTrackCategory().catch(() => {});

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: APP_NAME,
      description: 'Nouveaux abonnés, nouveaux morceaux gardés et événements',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('money', {
      name: `${APP_NAME} · Paiements reçus`,
      description: 'Ventes et paiements reçus par le propriétaire du profil',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'keep_money.wav',
      vibrationPattern: [0, 120, 70, 140],
    });
  }

  // Expo recommande de passer explicitement le EAS projectId.
  const projectId = expoProjectId();
  if (!projectId) {
    void reportPushRegistrationFailure('expo_project_id_missing', 'EAS projectId introuvable dans expo-constants');
    return { ok: false, reason: 'expo_project_id_missing' };
  }

  let token: string;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenResponse.data;
  } catch (error: any) {
    const detail = String(error?.message || error || 'unknown').slice(0, 300);
    void reportPushRegistrationFailure('expo_token_error', detail);
    return { ok: false, reason: 'expo_token_error' };
  }

  return registerExpoTokenWithSupabase(token);
}

export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice || !supabase) return;
  const Notifications = getNativeNotifications();
  try {
    const projectId = expoProjectId();
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;
    await supabase.rpc('keep_push_token_unregister', { p_token: token });
  } catch {
    // Best effort on logout; stale Expo tokens are also removed by receipt processing.
  }
}
