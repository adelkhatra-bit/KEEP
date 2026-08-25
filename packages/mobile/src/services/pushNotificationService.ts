import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { getSupabaseAccessToken } from './supabaseClient';

/**
 * Enregistrement du token push réel (demande explicite du 26/08/2026 -- boucle
 * notifications complète). Native uniquement -- le web KEEP (Expo web, notre
 * seule surface réellement testée cette session) n'a pas l'infrastructure
 * service worker/VAPID nécessaire à `expo-notifications` sur web ; plutôt que
 * de prétendre que ça marche, on le dit honnêtement et on ne tente rien sur
 * web (voir Platform.OS check ci-dessous). Les notifications in-app (centre,
 * voir notificationService.ts) restent, elles, réelles sur web comme natif --
 * seule la livraison push OS est concernée ici.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web_not_supported_yet' };
  }
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
    return { ok: false, reason: 'permission_denied' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Sans argument : expo-notifications résout automatiquement le projectId
  // depuis app.json (extra.eas.projectId) -- convention SDK 49+.
  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;

  if (!API_URL) return { ok: false, reason: 'api_url_missing' };
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) return { ok: false, reason: 'not_logged_in' };

  try {
    const res = await fetch(`${API_URL}/api/notifications/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    if (!res.ok) return { ok: false, reason: `server_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
