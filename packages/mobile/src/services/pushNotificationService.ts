import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { CanonicalTrack } from '@keep/music';
import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

/**
 * Enregistrement du token push réel + pont temps réel web.
 *
 * - iOS/Android natifs : token Expo Push, afin qu'une notification Loki puisse
 *   apparaître même lorsque l'utilisateur est dans TikTok, Snapchat, etc.
 * - Web : on écoute `notifications` via Supabase Realtime et on affiche un
 *   petit popup Loki tant que la page est ouverte.
 * - Détection musicale native : catégorie interactive GARDER / PASSER. Cela
 *   permet au système d'afficher les deux actions dans la notification sans
 *   modifier le design des écrans Loki.
 *
 * Aucune donnée audio n'est envoyée par ce mécanisme.
 */
const TRACK_CATEGORY = 'KEEP_TRACK';
export const TRACK_KEEP_ACTION = 'KEEP_TRACK_KEEP';
export const TRACK_PASS_ACTION = 'KEEP_TRACK_PASS';
let webRealtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let webToastTimer: ReturnType<typeof setTimeout> | null = null;
let trackActionSubscription: Notifications.EventSubscription | null = null;

function battleLike(type: unknown, title: unknown, data?: Record<string, unknown> | null) {
  const normalized = String(type || data?.type || data?.notificationType || '').toUpperCase();
  if (['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(normalized)) return true;
  if (data?.challengeId) return true;
  return String(title || '').toUpperCase().includes('BATTLE');
}


Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const content = notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    const inlineBattle = battleLike(data.type, content.title, data) && String(data.presentation || '') === 'battle_inline';
    return {
      shouldShowAlert: !inlineBattle,
      shouldPlaySound: !inlineBattle,
      shouldSetBadge: !inlineBattle,
      shouldShowBanner: !inlineBattle,
      shouldShowList: !inlineBattle,
    };
  },
});

function showWebKeepToast(title: string, body: string, row?: Record<string, unknown>) {
  const doc = (globalThis as any)?.document as Document | undefined;
  if (!doc?.body) return;

  const existing = doc.getElementById('keep-live-notification-toast');
  existing?.remove();
  if (webToastTimer) clearTimeout(webToastTimer);

  const toast = doc.createElement('button');
  toast.id = 'keep-live-notification-toast';
  toast.type = 'button';
  toast.setAttribute('aria-label', `${title}. ${body}`);
  Object.assign(toast.style, {
    position: 'fixed',
    top: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(92vw, 420px)',
    zIndex: '2147483647',
    border: '1px solid rgba(168,132,250,.55)',
    borderRadius: '16px',
    padding: '12px 14px',
    background: 'rgba(20,14,29,.97)',
    color: '#fff',
    boxShadow: '0 12px 32px rgba(0,0,0,.38)',
    textAlign: 'left',
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    cursor: 'pointer',
  });

  const brand = doc.createElement('div');
  brand.textContent = `${APP_NAME} · NOUVEAU`;
  Object.assign(brand.style, { fontSize: '10px', fontWeight: '900', letterSpacing: '1.1px', color: '#B79CFF', marginBottom: '4px' });
  const titleNode = doc.createElement('div');
  titleNode.textContent = title;
  Object.assign(titleNode.style, { fontSize: '14px', fontWeight: '800', lineHeight: '1.25' });
  const bodyNode = doc.createElement('div');
  bodyNode.textContent = body;
  Object.assign(bodyNode.style, { marginTop: '3px', fontSize: '12px', lineHeight: '1.35', color:'#FFFFFF' });

  toast.append(brand, titleNode, bodyNode);
  toast.onclick = () => {
    const base = `${globalThis.location?.origin ?? ''}/KEEP/notifications`;
    if (base.startsWith('http')) globalThis.location.href = base;
    else toast.remove();
  };
  doc.body.appendChild(toast);
  webToastTimer = setTimeout(() => toast.remove(), 6500);
}

async function startWebRealtimeNotificationBridge(): Promise<boolean> {
  if (Platform.OS !== 'web' || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  const profileId = data.session?.user?.id;
  if (!profileId) return false;

  if (webRealtimeChannel) {
    await supabase.removeChannel(webRealtimeChannel);
    webRealtimeChannel = null;
  }

  webRealtimeChannel = supabase
    .channel(`keep-live-notifications-${profileId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profileId}` },
      (payload) => {
        const row = (payload as any)?.new ?? {};
        if (String(row?.data?.presentation || '') === 'battle_inline') return;
        const title = String(row.title || `Nouveau sur ${APP_NAME}`);
        const body = String(row.body || `Ouvre ${APP_NAME} pour voir la nouveauté.`);
        showWebKeepToast(title, body, row);
      },
    )
    .subscribe();

  return true;
}


async function ensureDetectedTrackCategory(): Promise<void> {
  if (Platform.OS === 'web') return;
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

export async function registerForPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    const realtime = await startWebRealtimeNotificationBridge().catch(() => false);
    return { ok: realtime, reason: realtime ? 'web_realtime_enabled' : 'web_realtime_unavailable' };
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

  await ensureDetectedTrackCategory().catch(() => {});

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: APP_NAME,
      description: 'Nouveaux abonnés, nouveaux morceaux gardés et événements',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  // Sans argument : expo-notifications résout automatiquement le projectId
  // depuis app.json (extra.eas.projectId) -- convention SDK 49+.
  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;

  if (!supabase) return { ok: false, reason: 'supabase_not_configured' };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) return { ok: false, reason: 'not_logged_in' };
    const { error } = await supabase.rpc('keep_push_token_register', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) return { ok: false, reason: `supabase_${String(error.code || 'rpc_error')}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice || !supabase) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) return;
    await supabase.rpc('keep_push_token_unregister', { p_token: token });
  } catch {
    // Best effort on logout; stale Expo tokens are also removed by receipt processing.
  }
}
