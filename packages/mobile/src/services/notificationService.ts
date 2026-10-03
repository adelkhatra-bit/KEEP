import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

export type KeepNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  systemEnabled: boolean;
  djEnabled: boolean;
  socialEnabled: boolean;
  marketingEnabled: boolean;
  eventsEnabled: boolean;
  moneyEnabled: boolean;
  battleEnabled: boolean;
  musicEnabled: boolean;
  moneySound: 'MONEY' | 'DEFAULT' | 'SILENT';
  socialSound: 'DEFAULT' | 'SILENT';
  battleSound: 'DEFAULT' | 'SILENT';
  musicSound: 'DEFAULT' | 'SILENT';
  eventsSound: 'DEFAULT' | 'SILENT';
};

// Le contenu promotionnel est désactivé par défaut et nécessite un choix
// explicite de l'utilisateur. Les plans payants débloquent d'autres fonctions,
// jamais l'obligation de recevoir de la publicité.
const DEFAULT_PREFS: NotificationPreferences = {
  systemEnabled: true,
  djEnabled: true,
  socialEnabled: true,
  marketingEnabled: false,
  eventsEnabled: true,
  moneyEnabled: true,
  battleEnabled: true,
  musicEnabled: true,
  moneySound: 'MONEY', socialSound: 'DEFAULT', battleSound: 'DEFAULT', musicSound: 'DEFAULT', eventsSound: 'DEFAULT',
};

function decodeVisibleEntities(value: string): string {
  // Certains messages historiques arrivent doublement encodés
  // (&amp;#10084;). On décode d'abord les entités de transport, puis les
  // entités numériques / symboliques afin de ne jamais afficher le code brut.
  const transported = value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return transported
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&#([0-9]+);/g, (_match, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&hearts?;/gi, '♥');
}

export function normalizeNotificationVisibleText(value: unknown): string {
  return decodeVisibleEntities(String(value || ''))
    .replace(/\bKEEP\s+MUSIC\b/gi, APP_NAME)
    .replace(/\bKEEP\s+PAYPAL\b/gi, 'Loki PayPal')
    .replace(/\bKEEP\b/g, 'Loki');
}

function mapNotificationRow(row: any): KeepNotification {
  return {
    id: String(row.id),
    type: String(row.type || ''),
    title: normalizeNotificationVisibleText(row.title),
    body: normalizeNotificationVisibleText(row.body),
    data: row.data && typeof row.data === 'object' ? row.data : null,
    readAt: row.read_at ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

const NOTIFICATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

function notificationDataValue(item: KeepNotification, keys: string[]): string {
  for (const key of keys) {
    const value = item.data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

export function notificationSemanticKey(item: KeepNotification): string {
  const type = String(item.type || '').trim().toUpperCase();
  const arenaId = notificationDataValue(item, ['arenaId','arena_id']);
  const matchNo = notificationDataValue(item, ['matchNo','match_no']);
  if (['BATTLE_ARENA_WIN','BATTLE_ARENA_LOSS','BATTLE_ARENA_RESULT'].includes(type) && arenaId) {
    return `${type}|arena:${arenaId}|match:${matchNo}`;
  }
  if (['BATTLE_ARENA_REMATCH','BATTLE_REMATCH'].includes(type) && arenaId) return `${type}|arena:${arenaId}`;
  if (type === 'BATTLE_PLAYER_AVAILABLE') {
    const sourceProfileId = notificationDataValue(item, ['sourceProfileId','source_profile_id','actorId','actor_id']);
    const themeCode = notificationDataValue(item, ['themeCode','theme_code']);
    if (sourceProfileId) return `${type}|source:${sourceProfileId}|theme:${themeCode}`;
  }

  // Tchat : chaque message a son propre identifiant. Le texte des
  // notifications de groupe est toujours le même (« @x a envoyé un
  // message. ») : sans cette clé, 5 messages en 30 min n'en comptaient qu'1.
  if (type.startsWith('AGORA')) {
    const messageId = notificationDataValue(item, ['messageId','message_id']);
    const groupId = notificationDataValue(item, ['groupId','group_id']);
    if (messageId) return `${type}|message:${messageId}|group:${groupId}`;
  }

  const stableId = notificationDataValue(item, [
    'paymentId','payment_id','challengeId','challenge_id','eventId','event_id','offerId','offer_id',
  ]);
  if (stableId) return `${type}|entity:${stableId}`;

  const trackId = notificationDataValue(item, ['trackId','track_id']);
  if (trackId) {
    const actorId = notificationDataValue(item, ['actorId','actor_id','profileId','profile_id','sellerId','seller_id','buyerId','buyer_id']);
    return `${type}|track:${trackId}|actor:${actorId}`;
  }

  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
  return `${type}|text:${normalized(item.title)}|${normalized(item.body)}`;
}

export function dedupeNotifications(items: KeepNotification[]): KeepNotification[] {
  const seen = new Map<string, number>();
  const out: KeepNotification[] = [];
  for (const item of items) {
    const key = notificationSemanticKey(item);
    const time = new Date(item.createdAt).getTime();
    const previous = seen.get(key);
    if (previous != null && Number.isFinite(time) && Math.abs(previous - time) <= NOTIFICATION_DEDUPE_WINDOW_MS) continue;
    seen.set(key, Number.isFinite(time) ? time : Date.now());
    out.push(item);
  }
  return out;
}

export async function deleteNotificationDuplicates(profileId: string, keep: KeepNotification): Promise<number> {
  if (!supabase || !profileId || !keep.id) return 0;
  const { data, error } = await supabase.rpc('keep_notification_remove_semantic_duplicates', { p_keep_id: keep.id });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function loadNotifications(profileId: string): Promise<KeepNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,data,read_at,created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return dedupeNotifications((data ?? []).map(mapNotificationRow));
}

export async function loadUnreadNotificationCount(profileId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,data,read_at,created_at')
    .eq('profile_id', profileId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return dedupeNotifications((data ?? []).map(mapNotificationRow)).length;
}

/**
 * Écoute Supabase Realtime pour que la notification arrive pendant Écouter,
 * Playlists, Soirées, Profil, etc. La table notifications est publiée dans
 * supabase_realtime : aucun polling écran par écran n'est nécessaire.
 */
export function subscribeToNotifications(
  profileId: string,
  onInsert: (notification: KeepNotification) => void,
): () => void {
  const client = supabase;
  if (!client || !profileId) return () => {};

  const channel = client
    .channel(`keep-notifications-${profileId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        if (payload?.new) onInsert(mapNotificationRow(payload.new));
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Écoute INSERT/UPDATE/DELETE pour synchroniser les badges de compteur. Cela
 * évite qu'un badge reste à l'ancien chiffre après lecture ou suppression.
 */
export function subscribeToNotificationChanges(profileId: string, onChange: () => void): () => void {
  const client = supabase;
  if (!client || !profileId) return () => {};

  const channel = client
    .channel(`keep-notification-count-${profileId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function requestSocialLink(targetProfileId: string, platform: string): Promise<void> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { error } = await supabase.rpc('request_social_link', {
    target_profile_id: targetProfileId,
    requested_platform: platform,
  });
  if (error) throw error;
}

async function runNotificationAction(action: 'read' | 'read_all' | 'delete' | 'delete_all', notificationId?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('keep_notification_action', {
    p_action: action,
    p_notification_id: notificationId ?? null,
  });
  if (error) throw error;
}

export async function markNotificationRead(_profileId: string, notificationId: string): Promise<void> {
  await runNotificationAction('read', notificationId);
}

export async function markAllNotificationsRead(_profileId: string): Promise<void> {
  await runNotificationAction('read_all');
}

export async function deleteNotification(profileId: string, notificationId: string): Promise<void> {
  if (!supabase) return;
  // La suppression directe s'appuie sur la policy RLS notifications_delete_own.
  // Elle est plus robuste côté client que de dépendre exclusivement du cache RPC
  // PostgREST. En cas d'indisponibilité de cette route, on garde le RPC en secours.
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', notificationId);
  if (!error) return;
  await runNotificationAction('delete', notificationId);
}

export async function deleteAllNotifications(profileId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('profile_id', profileId);
  if (!error) return;
  await runNotificationAction('delete_all');
}

export async function deleteNotifications(profileId: string, notificationIds: string[]): Promise<void> {
  if (!supabase || !profileId || !notificationIds.length) return;
  const uniqueIds = [...new Set(notificationIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('profile_id', profileId)
    .in('id', uniqueIds);
  if (error) throw error;
}

export async function loadNotificationPreferences(profileId: string): Promise<NotificationPreferences> {
  if (!supabase) return DEFAULT_PREFS;
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('system_enabled,dj_enabled,social_enabled,marketing_enabled,events_enabled,money_enabled,battle_enabled,music_enabled,money_sound,social_sound,battle_sound,music_sound,events_sound')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await supabase.from('notification_preferences').insert({
      profile_id: profileId,
      system_enabled: DEFAULT_PREFS.systemEnabled,
      dj_enabled: DEFAULT_PREFS.djEnabled,
      social_enabled: DEFAULT_PREFS.socialEnabled,
      marketing_enabled: DEFAULT_PREFS.marketingEnabled,
      events_enabled: DEFAULT_PREFS.eventsEnabled,
      money_enabled: DEFAULT_PREFS.moneyEnabled, battle_enabled: DEFAULT_PREFS.battleEnabled, music_enabled: DEFAULT_PREFS.musicEnabled,
      money_sound: DEFAULT_PREFS.moneySound, social_sound: DEFAULT_PREFS.socialSound, battle_sound: DEFAULT_PREFS.battleSound, music_sound: DEFAULT_PREFS.musicSound, events_sound: DEFAULT_PREFS.eventsSound,
    });
    if (insertError) throw insertError;
    return DEFAULT_PREFS;
  }
  return {
    systemEnabled: data.system_enabled,
    djEnabled: data.dj_enabled,
    socialEnabled: data.social_enabled,
    marketingEnabled: data.marketing_enabled,
    eventsEnabled: data.events_enabled ?? true,
    moneyEnabled: data.money_enabled ?? true, battleEnabled: data.battle_enabled ?? true, musicEnabled: data.music_enabled ?? true,
    moneySound: data.money_sound ?? 'MONEY', socialSound: data.social_sound ?? 'DEFAULT', battleSound: data.battle_sound ?? 'DEFAULT', musicSound: data.music_sound ?? 'DEFAULT', eventsSound: data.events_sound ?? 'DEFAULT',
  };
}

export async function saveNotificationPreferences(profileId: string, prefs: NotificationPreferences): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('notification_preferences').upsert({
    profile_id: profileId,
    system_enabled: prefs.systemEnabled,
    dj_enabled: prefs.djEnabled,
    social_enabled: prefs.socialEnabled,
    marketing_enabled: prefs.marketingEnabled,
    events_enabled: prefs.eventsEnabled,
    money_enabled: prefs.moneyEnabled, battle_enabled: prefs.battleEnabled, music_enabled: prefs.musicEnabled,
    money_sound: prefs.moneySound, social_sound: prefs.socialSound, battle_sound: prefs.battleSound, music_sound: prefs.musicSound, events_sound: prefs.eventsSound,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' });
  if (error) throw error;
}
