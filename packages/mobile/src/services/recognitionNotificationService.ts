import { AppState, Platform } from 'react-native';
import type { RecognitionResult } from '@keep/music';

type NotificationsModule = typeof import('expo-notifications');
let nativeNotificationsModule: NotificationsModule | null = null;
function getNativeNotifications(): NotificationsModule {
  if (!nativeNotificationsModule) {
    nativeNotificationsModule = require('expo-notifications') as NotificationsModule;
  }
  return nativeNotificationsModule;
}

let permissionPrepared = false;
let notificationsAllowed = false;
let lastNotificationKey = '';
let lastNotificationAt = 0;

export async function prepareRecognitionNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (permissionPrepared) return notificationsAllowed;
  permissionPrepared = true;

  try {
    const Notifications = getNativeNotifications();
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    notificationsAllowed = granted;

    if (granted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('keep-recognition', {
        name: 'Musiques reconnues',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 100, 180],
      });
    }
    return granted;
  } catch {
    notificationsAllowed = false;
    return false;
  }
}

export async function notifyRecognitionOutsideKeep(result: RecognitionResult): Promise<void> {
  if (Platform.OS === 'web' || AppState.currentState === 'active') return;
  if (!notificationsAllowed && !(await prepareRecognitionNotifications())) return;

  const title = String(result.title || '').trim();
  const artist = String(result.artist || '').trim();
  if (!title || !artist) return;

  const now = Date.now();
  const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
  if (key === lastNotificationKey && now - lastNotificationAt < 60_000) return;
  lastNotificationKey = key;
  lastNotificationAt = now;

  const Notifications = getNativeNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Loki Music a trouvé la musique ✓',
      body: `${artist} — ${title}`,
      data: { type: 'music_detected', title, artist },
      sound: true,
    },
    trigger: null,
  });
}
